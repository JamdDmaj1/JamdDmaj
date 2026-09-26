package com.jamddmaj.ai.wallet;

import android.content.Context;
import android.content.ContextWrapper;
import java.io.File;
import java.math.BigInteger;
import org.junit.*;
import org.junit.rules.TemporaryFolder;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk=30)
public class BnbTransferReviewTest {
    @Rule public TemporaryFolder folder=new TemporaryFolder();
    private String chain="0x38",nonce="0x0",price="0x3b9aca00",gas="0x5208",balance="0x8ac7230489e80000";
    private BnbTransferReview service;
    private final String to="0x"+"2".repeat(40);
    @Before public void setup() throws Exception {
        Context context=new ContextWrapper(RuntimeEnvironment.getApplication()){@Override public File getNoBackupFilesDir(){return folder.getRoot();}};
        var owner=new NativeWalletProfiles.Profile("1".repeat(32),"2".repeat(32),"Owner","11111111111111111111111111111111","0x"+"1".repeat(40),1);
        service=new BnbTransferReview(context,owner,(method,params)->{
            switch(method){case "eth_chainId":return chain;case "eth_getTransactionCount":return nonce;case "eth_gasPrice":return price;case "eth_estimateGas":return gas;case "eth_getBalance":return balance;default:throw new AssertionError("Unexpected RPC/sign/broadcast: "+method);}
        });
    }
    interface Check{void run()throws Exception;}
    private void rejects(Check check)throws Exception{try{check.run();fail("Unsafe review accepted");}catch(java.io.IOException|IllegalArgumentException expected){}}
    @Test public void exactWeiAndMaximumFeeWithoutBroadcast()throws Exception{
        var draft=service.prepare(to,"1.000000000000000001");assertEquals(new BigInteger("1000000000000000001"),draft.units);
        assertEquals(BigInteger.valueOf(56),draft.chainId);assertEquals(new BigInteger("21000000000000"),draft.maximumFee);service.revalidate(draft);
    }
    @Test public void wrongChainAndInsufficientBalanceFailClosed()throws Exception{
        chain="0x61";rejects(()->service.prepare(to,"1"));chain="0x38";balance="0x1";rejects(()->service.prepare(to,"1"));
    }
    @Test public void changedNonceOrFeeRequiresNewReview()throws Exception{
        var draft=service.prepare(to,"1");nonce="0x1";rejects(()->service.revalidate(draft));nonce="0x0";price="0x3b9aca01";rejects(()->service.revalidate(draft));
    }
    @Test public void contractGasAllowanceIsExplicitAndBounded()throws Exception{
        gas="0xc350";var draft=service.prepare(to,"1");assertEquals(BigInteger.valueOf(60000),draft.gasLimit);
        gas="0x7a120";rejects(()->service.prepare(to,"1"));
    }
    @Test public void malformedQuantityAndAddressRejected()throws Exception{
        rejects(()->service.prepare("0x"+"0".repeat(40),"1"));price="0x00";rejects(()->service.prepare(to,"1"));
    }
}
