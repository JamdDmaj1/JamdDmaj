package com.jamddmaj.ai.wallet;

import android.content.Context;
import android.content.ContextWrapper;
import android.util.Base64;
import java.io.File;
import java.io.IOException;
import java.util.Arrays;
import org.bouncycastle.math.ec.rfc8032.Ed25519;
import org.json.JSONObject;
import org.junit.Before;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;

/** Synthetic keys and fake transports only; real POSIX persistence is tested
 * in the isolated Linux fixture runner, never against a user's wallet. */
@RunWith(RobolectricTestRunner.class)
@Config(sdk=30)
public class NativePerpsCloseTransfersTest {
    @Rule public TemporaryFolder folder=new TemporaryFolder();
    private Context context;private NativeWalletProfiles.Profile owner;
    @Before public void setup(){
        context=new ContextWrapper(RuntimeEnvironment.getApplication()){@Override public File getNoBackupFilesDir(){return folder.getRoot();}};
        owner=new NativeWalletProfiles.Profile("1".repeat(32),"2".repeat(32),"Close fixture",NativePerpsTransactionTest.payer(),"0x"+"1".repeat(40),1000);
    }
    private SolanaNativeTransfers.Signer signer(int[] calls){return new SolanaNativeTransfers.Signer(){
        public String address(byte[] entropy){return owner.solanaAddress;}
        public byte[] sign(byte[] entropy,byte[] message){calls[0]++;byte[] signature=new byte[64];Ed25519.sign(NativePerpsTransactionTest.seed(1),0,message,0,message.length,signature,0);return signature;}
    };}
    @Test public void exactCloseSignsOncePersistsBeforeTransportAndSurvivesRestart()throws Exception{
        NativePerpsCloseServiceTest.Rpc rpc=new NativePerpsCloseServiceTest.Rpc();int[] sends={0},signs={0};
        NativePerpsCloseTransfers transfers=new NativePerpsCloseTransfers(context,owner,rpc.service(),request->{
            sends[0]++;NativeTransferJournal.Record recorded=new NativeTransferJournal(context,owner,WalletNetwork.SOLANA_MAINNET).latest();
            assertEquals(NativeTransferJournal.Phase.UNKNOWN,recorded.phase);assertEquals("FULL_CLOSE",recorded.perps.operation);
            assertEquals(java.math.BigInteger.valueOf(101),recorded.perps.minimumSlot);
            assertEquals(NativePerpsCloseBindingsTest.intent().sizeUsd,recorded.units);assertEquals("decrease-position",request.getString("action"));
            byte[] wire=Base64.decode(request.getString("serializedTxBase64"),Base64.NO_WRAP);
            assertArrayEquals(rpc.transaction.message.bytes(),Arrays.copyOfRange(wire,193,wire.length));
            assertArrayEquals(rpc.transaction.signature(2),Arrays.copyOfRange(wire,129,193));
            return new JSONObject().put("action","decrease-position").put("txid",recorded.transactionId);
        });
        NativePerpsCloseTransfers.Draft draft=transfers.prepare("SOL",1,"103",50);
        byte[] signature=transfers.signReviewed(draft,new byte[0],signer(signs),()->true);
        rpc.slot=101; // Persist the last validated bank, not the earlier display bank.
        String id=transfers.submit(draft,signature,()->true);assertEquals(DevnetSolana.encode(signature),id);assertEquals(1,signs[0]);assertEquals(1,sends[0]);assertEquals(3,rpc.simulations);
        NativeTransferJournal restarted=new NativeTransferJournal(context,owner,WalletNetwork.SOLANA_MAINNET);
        assertEquals(NativeTransferJournal.Phase.SUBMITTED,restarted.latest().phase);assertEquals("FULL_CLOSE",restarted.latest().perps.operation);
        assertEquals(java.math.BigInteger.valueOf(101),restarted.latest().perps.minimumSlot);
        assertThrows(Exception.class,restarted::requireNoPending);restarted.settled(id,true);
        assertEquals("FULL_CLOSE",restarted.latest().perps.operation);assertThrows(Exception.class,()->transfers.submit(draft,signature,()->true));assertEquals(1,sends[0]);
    }
    @Test public void uncertainSendRemainsDurableUnknownAndCannotBeRetried()throws Exception{
        NativePerpsCloseServiceTest.Rpc rpc=new NativePerpsCloseServiceTest.Rpc();int[] sends={0},signs={0};
        NativePerpsCloseTransfers transfers=new NativePerpsCloseTransfers(context,owner,rpc.service(),request->{sends[0]++;throw new IOException("fixture timeout after possible send");});
        NativePerpsCloseTransfers.Draft draft=transfers.prepare("SOL",1,"103",50);byte[] signature=transfers.signReviewed(draft,new byte[0],signer(signs),()->true);
        assertThrows(Exception.class,()->transfers.submit(draft,signature,()->true));NativeTransferJournal restarted=new NativeTransferJournal(context,owner,WalletNetwork.SOLANA_MAINNET);
        assertEquals(NativeTransferJournal.Phase.UNKNOWN,restarted.latest().phase);assertEquals("FULL_CLOSE",restarted.latest().perps.operation);
        assertThrows(Exception.class,restarted::requireNoPending);assertThrows(Exception.class,()->transfers.submit(draft,signature,()->true));assertEquals(1,sends[0]);
    }
    @Test public void lockedExpiredAndUnsignedDraftsCannotReachTransportOrSigner()throws Exception{
        NativePerpsCloseServiceTest.Rpc rpc=new NativePerpsCloseServiceTest.Rpc();int[] signs={0};
        NativePerpsCloseTransfers transfers=new NativePerpsCloseTransfers(context,owner,rpc.service(),request->{throw new AssertionError("No send permitted");});
        NativePerpsCloseTransfers.Draft draft=transfers.prepare("SOL",1,"103",50);
        assertThrows(Exception.class,()->transfers.signReviewed(draft,new byte[0],signer(signs),()->false));
        assertThrows(Exception.class,()->transfers.submit(draft,new byte[64],()->true));
        rpc.clock.now+=NativePerpsCloseService.REVIEW_LIFETIME_MS;assertThrows(Exception.class,()->transfers.signReviewed(draft,new byte[0],signer(signs),()->true));assertEquals(0,signs[0]);
    }
}
