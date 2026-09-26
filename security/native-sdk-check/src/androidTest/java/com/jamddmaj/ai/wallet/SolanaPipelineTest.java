package com.jamddmaj.ai.wallet;

import android.content.Context;
import android.content.ContextWrapper;
import android.util.Base64;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.File;
import java.io.IOException;
import java.util.Arrays;
import java.util.Collections;
import java.util.UUID;
import org.json.*;
import org.junit.*;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

/** Full production SOL service + actual SDK signer, but transport is entirely offline. */
@RunWith(AndroidJUnit4.class)
public class SolanaPipelineTest {
    private Context context;private NativeWalletProfiles.Profile owner;private NativeWalletRpc.Transport transport;
    private int sends;private boolean timeout;private String confirmation="processed";
    private String recipient;
    private final SolanaNativeTransfers.Signer signer=new SolanaNativeTransfers.Signer(){
        public String address(byte[] entropy){return NativeHdWallet.addresses(entropy).solana;}
        public byte[] sign(byte[] entropy,byte[] message){return NativeHdWallet.signSolana(entropy,message);}
    };
    @Before public void setup()throws Exception{
        Context target=InstrumentationRegistry.getInstrumentation().getTargetContext();File root=new File(target.getNoBackupFilesDir(),UUID.randomUUID().toString());assertTrue(root.mkdir());
        context=new ContextWrapper(target){@Override public File getNoBackupFilesDir(){return root;}};
        var addresses=NativeHdWallet.addresses(new byte[32]);
        owner=new NativeWalletProfiles.Profile(String.join("",Collections.nCopies(32,"1")),String.join("",Collections.nCopies(32,"2")),"Public fixture",addresses.solana,addresses.bnb,1);
        byte[] destination=new byte[32];Arrays.fill(destination,(byte)52);recipient=DevnetSolana.encode(destination);
        transport=(method,params)->{
            switch(method){
                case "getGenesisHash":return "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
                case "getBalance":return new JSONObject().put("value",5000000000L);
                case "getLatestBlockhash":return new JSONObject().put("value",new JSONObject().put("blockhash","11111111111111111111111111111111").put("lastValidBlockHeight",100));
                case "getFeeForMessage":return new JSONObject().put("value",5000);
                case "getBlockHeight":return 1;
                case "simulateTransaction":return new JSONObject().put("value",new JSONObject().put("err",JSONObject.NULL));
                case "sendTransaction":
                    sends++;assertEquals(NativeTransferJournal.Phase.UNKNOWN,new NativeTransferJournal(context,owner,WalletNetwork.SOLANA_MAINNET).latest().phase);
                    assertFalse(params.getJSONObject(1).getBoolean("skipPreflight"));assertEquals(0,params.getJSONObject(1).getInt("maxRetries"));
                    if(timeout)throw new IOException("Lost response");
                    return DevnetSolana.encode(Arrays.copyOfRange(Base64.decode(params.getString(0),Base64.DEFAULT),1,65));
                case "getSignatureStatuses":return new JSONObject().put("value",new JSONArray().put(new JSONObject().put("confirmationStatus",confirmation).put("err",JSONObject.NULL)));
                default:throw new AssertionError("Unexpected RPC "+method);
            }
        };
    }
    private SolanaNativeTransfers service()throws Exception{return new SolanaNativeTransfers(context,owner,transport);}
    @Test public void hdSignatureMatchesReviewAndRecordsBeforeTransport()throws Exception{
        var service=service();var draft=service.prepare(recipient,"1.000000001");byte[] signature=service.signReviewed(draft,new byte[32],signer);assertEquals(0,sends);
        service.submit(draft,signature,()->true);assertEquals(1,sends);assertEquals(NativeTransferJournal.Phase.SUBMITTED,service.checkLatest().phase);
        confirmation="finalized";assertEquals(NativeTransferJournal.Phase.CONFIRMED,service.checkLatest().phase);
        try{service.submit(draft,signature,()->true);fail("Replay accepted");}catch(IOException expected){}assertEquals(1,sends);
    }
    @Test public void uncertainSendCannotBeRepeatedAfterRestart()throws Exception{
        timeout=true;var service=service();var draft=service.prepare(recipient,"1");
        try{service.submit(draft,service.signReviewed(draft,new byte[32],signer),()->true);fail("Timeout ignored");}catch(IOException expected){}
        var reopened=service();try{reopened.prepare(recipient,"1");fail("Pending operation bypassed");}catch(IOException expected){}
        assertEquals(NativeTransferJournal.Phase.UNKNOWN,reopened.checkLatest().phase);assertEquals(1,sends);
    }
    @Test public void authorizationLostBeforeSendStopsTransport()throws Exception{
        var service=service();var draft=service.prepare(recipient,"1");
        try{service.submit(draft,service.signReviewed(draft,new byte[32],signer),()->false);fail("Locked wallet broadcast");}catch(IOException expected){}assertEquals(0,sends);
    }
}
