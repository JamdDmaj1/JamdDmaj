package com.jamddmaj.ai.wallet;

import android.content.Context;
import android.content.ContextWrapper;
import java.io.File;
import java.math.BigInteger;
import java.nio.file.Files;
import java.nio.charset.StandardCharsets;
import org.bouncycastle.math.ec.rfc8032.Ed25519;
import org.json.JSONObject;
import org.junit.*;
import org.junit.rules.TemporaryFolder;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk=30)
public class NativePerpsJournalTest {
    @Rule public TemporaryFolder folder=new TemporaryFolder();
    private Context context;private NativeWalletProfiles.Profile owner;private NativeTransferJournal journal;
    private NativePerpsSignedEnvelope envelope;
    private final NativePerpsOrderIntent intent=new NativePerpsOrderIntent("SOL",1,"10","2",50,"100",null,null);
    @Before public void setup()throws Exception{
        context=new ContextWrapper(RuntimeEnvironment.getApplication()){@Override public File getNoBackupFilesDir(){return folder.getRoot();}};
        owner=new NativeWalletProfiles.Profile("1".repeat(32),"2".repeat(32),"Fixture",NativePerpsTransactionTest.payer(),"0x"+"1".repeat(40),1000);
        journal=new NativeTransferJournal(context,owner,WalletNetwork.SOLANA_MAINNET);
        NativePerpsTransaction transaction=NativePerpsTransaction.decode(NativePerpsTransactionTest.fixture(),owner.solanaAddress);
        byte[] message=transaction.message.bytes(),signature=new byte[64];
        // Unfunded deterministic fixture only; no network transport exists here.
        Ed25519.sign(NativePerpsTransactionTest.seed(1),0,message,0,message.length,signature,0);
        envelope=NativePerpsSignedEnvelope.attach(transaction,signature);
    }
    private void begin()throws Exception{journal.beginPerps(envelope,intent,BigInteger.valueOf(15000));}
    private File path(){return new File(folder.getRoot(),"wallet-transfers-v1/"+owner.ownerId+"/"+WalletNetwork.SOLANA_MAINNET.storageDomain+".json");}
    @Test public void exactBroadcastIdentitySurvivesRestartAndBlocksAllSolanaOperations()throws Exception{
        begin();journal=new NativeTransferJournal(context,owner,WalletNetwork.SOLANA_MAINNET);
        var record=journal.latest();assertEquals(NativeTransferJournal.Phase.UNKNOWN,record.phase);
        assertEquals(envelope.transactionId,record.transactionId);assertEquals(intent.marginUsd,record.units);
        assertEquals("SOL",record.perps.asset);assertEquals(1,record.perps.side);
        assertEquals(DevnetSolana.encode(NativePerpsAddresses.position(owner.solanaAddress,"SOL",1)),record.recipient);
        byte[] expected=java.security.MessageDigest.getInstance("SHA-256").digest(envelope.bytes());
        assertEquals(java.util.HexFormat.of().formatHex(expected),record.perps.signedWireSha256);
        assertThrows(java.io.IOException.class,()->journal.requireNoPending());
        assertThrows(java.io.IOException.class,()->journal.beginToken(envelope.transactionId,owner.solanaAddress,BigInteger.ONE,BigInteger.ONE,NativeSolanaTokens.USDC));
        assertThrows(java.io.IOException.class,()->journal.begin(envelope.transactionId,owner.solanaAddress,BigInteger.ONE,BigInteger.ONE));
        assertThrows(java.io.IOException.class,()->begin());
    }
    @Test public void stateTransitionsPreserveMetadataAndDoNotPermitReplay()throws Exception{
        begin();String digest=journal.latest().perps.signedWireSha256;
        journal.submitted(envelope.transactionId);journal.settled(envelope.transactionId,true);
        assertEquals(digest,journal.latest().perps.signedWireSha256);journal.requireNoPending();
        assertThrows(java.io.IOException.class,()->begin());
    }
    @Test public void rejectsConflictingKindsWrongPositionAndMalformedMetadata()throws Exception{
        begin();String original=Files.readString(path().toPath());
        for(String fault:new String[]{"mixed","position","side","digest"}){
            JSONObject value=new JSONObject(original),p=value.getJSONObject("perps");
            if(fault.equals("mixed"))value.put("tokenMint",NativeSolanaTokens.USDC);
            if(fault.equals("position"))p.put("position",owner.solanaAddress);
            if(fault.equals("side"))p.put("side",1.5);
            if(fault.equals("digest"))p.put("signedWireSha256","unverified");
            Files.writeString(path().toPath(),value.toString(),StandardCharsets.UTF_8);
            assertThrows(Exception.class,()->journal.latest());
        }
    }
    @Test public void wrongWalletOrNetworkCannotRecordEnvelope()throws Exception{
        NativeWalletProfiles.Profile other=new NativeWalletProfiles.Profile("3".repeat(32),"4".repeat(32),"Other","11111111111111111111111111111111","0x"+"1".repeat(40),1000);
        var wrong=new NativeTransferJournal(context,other,WalletNetwork.SOLANA_MAINNET);
        assertThrows(java.io.IOException.class,()->wrong.beginPerps(envelope,intent,BigInteger.ONE));
        var evm=new NativeTransferJournal(context,owner,WalletNetwork.BNB_MAINNET);
        assertThrows(java.io.IOException.class,()->evm.beginPerps(envelope,intent,BigInteger.ONE));
        assertThrows(java.io.IOException.class,()->journal.beginPerps(envelope,intent,BigInteger.ZERO));
        assertThrows(java.io.IOException.class,()->journal.beginPerps(envelope,intent,BigInteger.valueOf(1000001)));
        assertNull(journal.latest());
    }
}
