package com.jamddmaj.ai.wallet;

import android.content.Context;
import android.content.ContextWrapper;
import android.util.Base64;
import java.io.*;
import java.nio.file.Files;
import java.util.Arrays;
import org.json.*;
import org.junit.*;
import org.junit.rules.TemporaryFolder;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk=30)
public class DevnetWalletServiceTest {
 @Rule public TemporaryFolder folder=new TemporaryFolder();
 private Context context;private DevnetWalletService service;private FakeRpc rpc;
 private final byte[] seed=new byte[32];private String recipient;
 @Before public void setup()throws Exception{
  Arrays.fill(seed,(byte)29);byte[] to=new byte[32];Arrays.fill(to,(byte)31);recipient=DevnetSolana.encode(to);
  context=new ContextWrapper(RuntimeEnvironment.getApplication()){@Override public File getNoBackupFilesDir(){return folder.getRoot();}};
  rpc=new FakeRpc();service=new DevnetWalletService(context,rpc);
  service.saveRecoveredWallet("1234567890abcdef1234567890abcdef",DevnetSolana.address(seed));
 }
 private final class FakeRpc implements DevnetWalletService.RpcTransport {
  String chain=DevnetWalletService.GENESIS,confirmation="processed";long balance=5000000000L,fee=5000,height=2;
  boolean sendTimeout=false,simulationError=false,statusError=false;int sends=0;
  public Object request(String method,JSONArray params)throws Exception{
   switch(method){
    case "getGenesisHash":return chain;
    case "getBalance":return new JSONObject().put("value",balance);
    case "getLatestBlockhash":return new JSONObject().put("value",new JSONObject().put("blockhash","11111111111111111111111111111111").put("lastValidBlockHeight",100));
    case "getFeeForMessage":return new JSONObject().put("value",fee);
    case "getBlockHeight":return height;
    case "simulateTransaction":return new JSONObject().put("value",new JSONObject().put("err",simulationError?"failure":JSONObject.NULL));
    case "sendTransaction":
     sends++;assertTrue(new File(folder.getRoot(),"devnet-transfer-public.json").isFile());
     if(sendTimeout)throw new IOException("timeout after possible broadcast");
     byte[] wire=Base64.decode(params.getString(0),Base64.DEFAULT);return DevnetSolana.encode(Arrays.copyOfRange(wire,1,65));
    case "getSignatureStatuses":return new JSONObject().put("value",new JSONArray().put(new JSONObject().put("err",statusError?"error":JSONObject.NULL).put("confirmationStatus",confirmation)));
    default:throw new AssertionError("Unexpected RPC "+method);
   }
  }
 }
 private void reject(Checked action)throws Exception{try{action.run();fail("Expected rejection");}catch(IOException|IllegalArgumentException expected){}}
 private interface Checked{void run()throws Exception;}
 private DevnetWalletService.Draft draft()throws Exception{return service.prepare(recipient,"0.001");}
 @Test public void noOverwriteOnRecovery()throws Exception{reject(()->service.saveRecoveredWallet("abcdef1234567890abcdef1234567890",recipient));assertEquals(DevnetSolana.address(seed),service.wallet().getString("address"));}
 @Test public void wrongNetworkDoesNotSend()throws Exception{rpc.chain="mainnet";reject(()->draft());assertEquals(0,rpc.sends);}
 @Test public void lowBalanceAndSimulationFailureDoNotSend()throws Exception{rpc.balance=0;reject(()->draft());rpc.balance=5000000000L;rpc.simulationError=true;reject(()->draft());assertEquals(0,rpc.sends);}
 @Test public void changedFeeAndExpiredBlockhashDoNotSend()throws Exception{var d=draft();byte[] sig=service.signReviewed(d,seed);rpc.fee++;reject(()->service.submit(d,sig,()->true));rpc.fee--;var second=draft();rpc.height=101;reject(()->service.submit(second,service.signReviewed(second,seed),()->true));assertEquals(0,rpc.sends);}
 @Test public void lockedCannotSend()throws Exception{var d=draft();reject(()->service.submit(d,service.signReviewed(d,seed),()->false));assertEquals(0,rpc.sends);}
 @Test public void timeoutPersistsAcrossRestartWithoutResend()throws Exception{var d=draft();rpc.sendTimeout=true;reject(()->service.submit(d,service.signReviewed(d,seed),()->true));assertEquals(1,rpc.sends);service=new DevnetWalletService(context,rpc);reject(()->draft());assertTrue(service.status().startsWith("uncertain\n"));assertEquals(1,rpc.sends);}
 @Test public void processedFailureStaysBlockedUntilSettled()throws Exception{var d=draft();service.submit(d,service.signReviewed(d,seed),()->true);rpc.statusError=true;assertTrue(service.status().startsWith("submitted\n"));reject(()->draft());rpc.confirmation="finalized";assertTrue(service.status().startsWith("failed\n"));assertNotNull(draft());}
 @Test public void confirmedRecordSurvivesRestartAndDraftCannotReplay()throws Exception{var d=draft();byte[] sig=service.signReviewed(d,seed);String id=service.submit(d,sig,()->true);rpc.confirmation="finalized";assertEquals("confirmed\n"+id,service.status());reject(()->service.submit(d,sig,()->true));service=new DevnetWalletService(context,rpc);assertEquals("confirmed\n"+id,service.status());assertEquals(1,rpc.sends);}
 @Test public void corruptJournalBlocksInsteadOfOverwriting()throws Exception{Files.writeString(new File(folder.getRoot(),"devnet-transfer-public.json").toPath(),"{}");try{draft();fail("Corrupt journal accepted");}catch(JSONException expected){}assertEquals(0,rpc.sends);}
}
