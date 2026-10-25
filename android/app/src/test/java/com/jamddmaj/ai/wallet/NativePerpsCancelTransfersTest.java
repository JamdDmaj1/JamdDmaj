package com.jamddmaj.ai.wallet;

import android.content.Context;
import android.content.ContextWrapper;
import android.util.Base64;
import java.io.File;
import java.io.IOException;
import java.math.BigInteger;
import java.util.Arrays;
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
public class NativePerpsCancelTransfersTest {
    @Rule public TemporaryFolder folder=new TemporaryFolder();private Context context;private NativeWalletProfiles.Profile owner;
    @Before public void setup(){context=new ContextWrapper(RuntimeEnvironment.getApplication()){@Override public File getNoBackupFilesDir(){return folder.getRoot();}};
        owner=new NativeWalletProfiles.Profile("1".repeat(32),"2".repeat(32),"Cancellation fixture",NativePerpsCancelTest.payer(),"0x"+"1".repeat(40),1000);}
    private SolanaNativeTransfers.Signer signer(int[] calls){return new SolanaNativeTransfers.Signer(){public String address(byte[] entropy){return owner.solanaAddress;}
        public byte[] sign(byte[] entropy,byte[] message){calls[0]++;byte[] signature=new byte[64];Ed25519.sign(NativePerpsTransactionTest.seed(1),0,message,0,message.length,signature,0);return signature;}};}
    @Test public void persistsBeforeSendingAndHoldsAllSolanaOperationsUntilFinalized()throws Exception{
        NativePerpsCancelTest.Rpc rpc=new NativePerpsCancelTest.Rpc("SOL",1,true,false);int[] sends={0},signs={0};
        NativePerpsCancelTransfers transfers=new NativePerpsCancelTransfers(context,owner,rpc.service(),request->{
            sends[0]++;NativeTransferJournal.Record record=new NativeTransferJournal(context,owner,WalletNetwork.SOLANA_MAINNET).latest();
            assertEquals(NativeTransferJournal.Phase.UNKNOWN,record.phase);assertEquals("CANCEL_TPSL",record.perps.operation);assertEquals(BigInteger.ONE,record.units);assertEquals(rpc.intent.requestAddress,record.recipient);
            assertEquals(BigInteger.valueOf(101),record.perps.minimumSlot);assertEquals(rpc.intent.counter,record.perps.requestCounter);
            assertEquals("cancel-tpsl",request.getString("action"));byte[] wire=Base64.decode(request.getString("serializedTxBase64"),Base64.NO_WRAP);
            assertArrayEquals(rpc.transaction.message.bytes(),Arrays.copyOfRange(wire,193,wire.length));return new JSONObject().put("action","cancel-tpsl").put("txid",record.transactionId);
        });
        var draft=transfers.prepare(rpc.intent);byte[] signature=transfers.signReviewed(draft,new byte[0],signer(signs),()->true);rpc.slot=101;
        String id=transfers.submit(draft,signature,()->true);assertEquals(DevnetSolana.encode(signature),id);assertEquals(1,sends[0]);assertEquals(1,signs[0]);
        NativeTransferJournal journal=new NativeTransferJournal(context,owner,WalletNetwork.SOLANA_MAINNET);assertEquals("CANCEL_TPSL",journal.latest().perps.operation);
        SolanaNativeTransfers recovery=new SolanaNativeTransfers(context,owner,rpc);
        assertEquals(NativeTransferJournal.Phase.SUBMITTED,recovery.checkLatest().phase);assertThrows(Exception.class,journal::requireNoPending);
        rpc.signatureState="finalized";assertEquals(NativeTransferJournal.Phase.CONFIRMED,recovery.checkLatest().phase);journal.requireNoPending();
        NativeTransferJournal.Perps p=journal.latest().perps;NativePerpsCloseChain chain=new NativePerpsCloseChain(rpc);
        assertFalse(chain.cancellationAbsent(p.requestAddress,owner.solanaAddress,p.asset,p.side,p.requestCounter,p.minimumSlot));
        rpc.finalAbsence=true;assertTrue(chain.cancellationAbsent(p.requestAddress,owner.solanaAddress,p.asset,p.side,p.requestCounter,p.minimumSlot));
        assertThrows(Exception.class,()->transfers.submit(draft,signature,()->true));assertEquals(1,sends[0]);
    }
    @Test public void timeoutRemainsUnknownAfterRestartAndNeverRetries()throws Exception{
        NativePerpsCancelTest.Rpc rpc=new NativePerpsCancelTest.Rpc("BTC",2,false,true);int[] sends={0},signs={0};
        NativePerpsCancelTransfers transfers=new NativePerpsCancelTransfers(context,owner,rpc.service(),request->{sends[0]++;throw new IOException("fixture timeout");});
        var draft=transfers.prepare(rpc.intent);byte[] signature=transfers.signReviewed(draft,new byte[0],signer(signs),()->true);
        assertThrows(Exception.class,()->transfers.submit(draft,signature,()->true));NativeTransferJournal restarted=new NativeTransferJournal(context,owner,WalletNetwork.SOLANA_MAINNET);
        assertEquals(NativeTransferJournal.Phase.UNKNOWN,restarted.latest().phase);assertEquals(rpc.intent.requestAddress,restarted.latest().perps.requestAddress);
        assertThrows(Exception.class,restarted::requireNoPending);assertThrows(Exception.class,()->transfers.submit(draft,signature,()->true));assertEquals(1,sends[0]);
    }
    @Test public void lockedExpiredOrWrongWalletCannotAuthorizeCancellation()throws Exception{
        NativePerpsCancelTest.Rpc rpc=new NativePerpsCancelTest.Rpc("ETH",1,false,false);int[] signs={0};
        NativePerpsCancelTransfers transfers=new NativePerpsCancelTransfers(context,owner,rpc.service(),request->{throw new AssertionError("No send");});
        var draft=transfers.prepare(rpc.intent);assertThrows(Exception.class,()->transfers.submit(draft,new byte[64],()->true));
        assertThrows(Exception.class,()->transfers.signReviewed(draft,new byte[0],signer(signs),()->false));rpc.clock.now+=25000;
        assertThrows(Exception.class,()->transfers.signReviewed(draft,new byte[0],signer(signs),()->true));assertEquals(0,signs[0]);
        NativeWalletProfiles.Profile other=new NativeWalletProfiles.Profile("3".repeat(32),"4".repeat(32),"Other fixture",DevnetSolana.encode(NativePerpsTransactionTest.publicKey(9)),"0x"+"2".repeat(40),1000);
        NativePerpsCancelTransfers wrong=new NativePerpsCancelTransfers(context,other,rpc.service(),request->{throw new AssertionError("No send");});assertThrows(Exception.class,()->wrong.prepare(rpc.intent));
    }
    @Test public void corruptedCancellationIdentityCannotBeReadAsAValidPendingRecord()throws Exception{
        NativePerpsCancelTest.Rpc rpc=new NativePerpsCancelTest.Rpc("SOL",1,true,false);int[] signs={0};
        NativePerpsCancelTransfers transfers=new NativePerpsCancelTransfers(context,owner,rpc.service(),request->{throw new IOException("fixture timeout");});
        var draft=transfers.prepare(rpc.intent);byte[] signature=transfers.signReviewed(draft,new byte[0],signer(signs),()->true);assertThrows(Exception.class,()->transfers.submit(draft,signature,()->true));
        File file=new File(folder.getRoot(),"wallet-transfers-v1/"+owner.ownerId+"/"+WalletNetwork.SOLANA_MAINNET.storageDomain+".json");String original=new String(java.nio.file.Files.readAllBytes(file.toPath()),java.nio.charset.StandardCharsets.UTF_8);
        for(String fault:new String[]{"request","counter","slot","units"}){
            JSONObject value=new JSONObject(original),p=value.getJSONObject("perps");if("request".equals(fault))p.put("request",owner.solanaAddress);if("counter".equals(fault))p.put("counter","5");if("slot".equals(fault))p.put("minimumSlot","0");if("units".equals(fault))value.put("units","2");
            java.nio.file.Files.write(file.toPath(),value.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));assertThrows(Exception.class,()->new NativeTransferJournal(context,owner,WalletNetwork.SOLANA_MAINNET).latest());
        }
    }
}
