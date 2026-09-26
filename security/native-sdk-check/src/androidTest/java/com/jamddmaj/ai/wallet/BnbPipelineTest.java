package com.jamddmaj.ai.wallet;

import android.content.Context;
import android.content.ContextWrapper;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.File;
import java.io.IOException;
import java.math.BigInteger;
import java.util.UUID;
import org.json.JSONObject;
import org.junit.*;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

/** Actual JNI signing and Android storage, fake transport; APK has no Internet permission. */
@RunWith(AndroidJUnit4.class)
public class BnbPipelineTest {
    private Context context;private NativeWalletProfiles.Profile owner;private NativeWalletRpc.Transport transport;
    private int broadcasts;private boolean timeout;private String tx;
    private final String recipient="0x3535353535353535353535353535353535353535",hash="0x"+"b".repeat(64);
    @Before public void setup()throws Exception{
        Context target=InstrumentationRegistry.getInstrumentation().getTargetContext();
        File root=new File(target.getNoBackupFilesDir(),UUID.randomUUID().toString());assertTrue(root.mkdir());
        context=new ContextWrapper(target){@Override public File getNoBackupFilesDir(){return root;}};
        var addresses=NativeHdWallet.addresses(new byte[32]);
        owner=new NativeWalletProfiles.Profile("1".repeat(32),"2".repeat(32),"Public test fixture",addresses.solana,addresses.bnb,1);
        transport=(method,params)->{
            switch(method){
                case "eth_chainId":return "0x38";
                case "eth_getTransactionCount":return "0x0";
                case "eth_gasPrice":return "0x3b9aca00";
                case "eth_estimateGas":return "0x5208";
                case "eth_getBalance":return "0x8ac7230489e80000";
                case "eth_sendRawTransaction":
                    broadcasts++;
                    var saved=new NativeTransferJournal(context,owner,WalletNetwork.BNB_MAINNET).latest();
                    assertNotNull(saved);assertEquals(NativeTransferJournal.Phase.UNKNOWN,saved.phase);
                    String hex=params.getString(0).substring(2);byte[] bytes=new byte[hex.length()/2];
                    for(int i=0;i<bytes.length;i++)bytes[i]=(byte)Integer.parseInt(hex.substring(i*2,i*2+2),16);
                    tx=NativeEvmAddress.hex(NativeEvmAddress.keccak(bytes));assertEquals(tx,saved.transactionId);
                    if(timeout)throw new IOException("Simulated response lost after broadcast");return tx;
                case "eth_getTransactionReceipt":return new JSONObject().put("transactionHash",tx).put("from",owner.bnbAddress).put("to",recipient).put("blockNumber","0xa").put("blockHash",hash).put("status","0x1");
                case "eth_getBlockByNumber":return new JSONObject().put("number","0xa").put("hash",hash);
                default:throw new AssertionError("Unexpected RPC "+method);
            }
        };
    }
    private BnbTransferReview service()throws Exception{return new BnbTransferReview(context,owner,transport);}
    @Test public void reviewedSignaturePersistsBeforeBroadcastAndConfirmsSeparately()throws Exception{
        var service=service();var draft=service.prepare(recipient,"0.000000000000000001");
        var signed=service.signReviewed(draft,new byte[32]);assertEquals(0,broadcasts);
        assertEquals(signed.transactionId,service.submit(signed,()->true));assertEquals(1,broadcasts);
        assertEquals(NativeTransferJournal.Phase.SUBMITTED,new NativeTransferJournal(context,owner,WalletNetwork.BNB_MAINNET).latest().phase);
        assertEquals(NativeTransferJournal.Phase.CONFIRMED,service.checkLatest().phase);
        try{service.submit(signed,()->true);fail("Repeated signed submission");}catch(IOException expected){}assertEquals(1,broadcasts);
    }
    @Test public void lostResponseSurvivesServiceRestartAndBlocksAnotherTransfer()throws Exception{
        timeout=true;var service=service();var signed=service.signReviewed(service.prepare(recipient,"1"),new byte[32]);
        try{service.submit(signed,()->true);fail("Timeout hidden");}catch(IOException expected){}
        assertEquals(1,broadcasts);var reopened=service();
        try{reopened.prepare(recipient,"1");fail("Pending transfer bypassed");}catch(IOException expected){}
        assertEquals(NativeTransferJournal.Phase.CONFIRMED,reopened.checkLatest().phase);assertEquals(1,broadcasts);
    }
    @Test public void backgroundedAuthorizationNeverBroadcasts()throws Exception{
        var service=service();var signed=service.signReviewed(service.prepare(recipient,"1"),new byte[32]);
        try{service.submit(signed,()->false);fail("Locked submission accepted");}catch(IOException expected){}assertEquals(0,broadcasts);
    }
}
