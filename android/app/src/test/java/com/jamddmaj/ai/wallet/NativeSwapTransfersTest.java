package com.jamddmaj.ai.wallet;

import android.content.*;
import android.util.Base64;
import java.io.*;
import java.util.Arrays;
import org.json.*;
import org.junit.*;
import org.junit.rules.TemporaryFolder;
import org.junit.runner.RunWith;
import org.robolectric.*;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;

/** Disposable signing seed and fake transports only. No real RPC or funds. */
@RunWith(RobolectricTestRunner.class)
@Config(sdk=30)
public class NativeSwapTransfersTest {
    @Rule public TemporaryFolder folder=new TemporaryFolder();
    private Context context;
    private NativeWalletProfiles.Profile owner;
    private NativeSwapTransfers transfers;
    private final byte[] seed=new byte[32];
    private int sends;
    private boolean timeout;
    private NativeSwapServiceTest.Clock clock;
    private final SolanaNativeTransfers.Signer signer=new SolanaNativeTransfers.Signer(){
        public String address(byte[] value){return DevnetSolana.address(value);}
        public byte[] sign(byte[] value,byte[] message){return DevnetSolana.sign(value,message);}
    };
    private JSONArray owned(JSONArray values) throws Exception {
        for(int i=0;i<values.length();i++) {
            if(values.isNull(i)) continue;
            JSONObject value=values.getJSONObject(i);
            byte[] bytes=Base64.decode(value.getJSONArray("data").getString(0),Base64.NO_WRAP);
            if(bytes.length==165) {
                System.arraycopy(DevnetSolana.decode(owner.solanaAddress,32),0,bytes,32,32);
                value.put("data",new JSONArray().put(Base64.encodeToString(bytes,Base64.NO_WRAP)).put("base64"));
            }
        }
        return values;
    }
    @Before public void setup() throws Exception {
        Arrays.fill(seed,(byte)51);
        context=new ContextWrapper(RuntimeEnvironment.getApplication()){@Override public File getNoBackupFilesDir(){return folder.getRoot();}};
        owner=new NativeWalletProfiles.Profile("1".repeat(32),"2".repeat(32),"Fixture",DevnetSolana.address(seed),"0x"+"1".repeat(40),1000);
        clock=new NativeSwapServiceTest.Clock();
        NativeSwapSimulation simulation=new NativeSwapSimulation((method,params)->{
            if(method.equals("getGenesisHash"))return "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
            if(method.equals("getSlot") || method.equals("getBlockHeight"))return 100;
            if(method.equals("getMinimumBalanceForRentExemption"))return 2039280;
            JSONObject result=new JSONObject().put("context",new JSONObject().put("slot",100));
            if(method.equals("getFeeForMessage"))return result.put("value",5000);
            if(method.equals("simulateTransaction"))return result.put("value",new JSONObject().put("err",JSONObject.NULL).put("unitsConsumed",200000)
                .put("accounts",owned(NativeSwapEffectsTest.post(999995000L,0,1184627))));
            throw new AssertionError(method);
        });
        NativeSwapChainState state=new NativeSwapChainState((method,params)->{
            Object result=new NativeSwapChainStateTest.Rpc().request(method,params);
            if(method.equals("getMultipleAccounts"))owned(((JSONObject)result).getJSONArray("value"));
            return result;
        });
        NativeSwapService service=new NativeSwapService(intent->new JSONObject(NativeJupiterRouteTest.fixture().toString()
            .replace("\""+NativeJupiterRouteTest.key(1)+"\"","\""+owner.solanaAddress+"\"")),
            NativeSwapServiceTest.accounts(clock,false),clock,simulation,(payer,mint,program)->NativeJupiterRouteTest.key(mint.equals(NativeJupiterRouteTest.key(2))?10:13),state);
        transfers=new NativeSwapTransfers(context,owner,service,(method,params)->{
            if(method.equals("getGenesisHash"))return "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
            if(method.equals("getAccountInfo")) {
                byte[] mint=new byte[82]; mint[44]=6; mint[45]=1;
                return new JSONObject().put("value",new JSONObject().put("owner",NativeJupiterRoute.TOKEN).put("executable",false)
                    .put("data",new JSONArray().put(Base64.encodeToString(mint,Base64.NO_WRAP)).put("base64")));
            }
            if(method.equals("simulateTransaction")) {
                assertTrue(params.getJSONObject(1).getBoolean("sigVerify"));
                return new JSONObject().put("value",new JSONObject().put("err",JSONObject.NULL));
            }
            if(method.equals("sendTransaction")) {
                sends++;
                var record=new NativeTransferJournal(context,owner,WalletNetwork.SOLANA_MAINNET).latest();
                assertEquals(NativeTransferJournal.Phase.UNKNOWN,record.phase);
                assertEquals(NativeJupiterRouteTest.key(2),record.inputMint);
                assertEquals("1178704",record.minimumOutput.toString());
                assertEquals(0,params.getJSONObject(1).getInt("maxRetries"));
                if(timeout)throw new IOException("Unknown result");
                return DevnetSolana.encode(Arrays.copyOfRange(Base64.decode(params.getString(0),Base64.NO_WRAP),1,65));
            }
            throw new AssertionError(method);
        });
    }
    private NativeSwapTransfers.Draft draft() throws Exception {
        return transfers.prepare(new NativeSwapPreparation.Intent(owner.solanaAddress,NativeJupiterRouteTest.key(2),NativeJupiterRouteTest.key(3),"10000000",50));
    }
    @Test public void signsExactReviewAndPersistsSwapBeforeSingleSubmission() throws Exception {
        var draft=draft(); byte[] signature=transfers.signReviewed(draft,seed,signer,()->true);
        assertEquals(0,sends);
        transfers.submit(draft,signature,()->true);
        assertEquals(1,sends);
        var record=new NativeTransferJournal(context,owner,WalletNetwork.SOLANA_MAINNET).latest();
        assertEquals(NativeTransferJournal.Phase.SUBMITTED,record.phase);
        assertEquals(NativeJupiterRouteTest.key(3),record.outputMint);
        assertThrows(IOException.class,()->transfers.submit(draft,signature,()->true));
    }
    @Test public void unknownSubmissionBlocksAllFurtherSolanaOperations() throws Exception {
        var draft=draft(); timeout=true;
        byte[] signature=transfers.signReviewed(draft,seed,signer,()->true);
        assertThrows(IOException.class,()->transfers.submit(draft,signature,()->true));
        assertThrows(IOException.class,()->draft());
        assertThrows(IOException.class,()->new NativeTransferJournal(context,owner,WalletNetwork.SOLANA_MAINNET).requireNoPending());
        assertEquals(1,sends);
    }
    @Test public void lockedExpiredOrWrongSignatureNeverBroadcasts() throws Exception {
        var draft=draft();
        assertThrows(IOException.class,()->transfers.signReviewed(draft,seed,signer,()->false));
        assertThrows(IOException.class,()->transfers.submit(draft,new byte[64],()->true));
        clock.time=16000;
        assertThrows(IOException.class,()->transfers.signReviewed(draft,seed,signer,()->true));
        assertEquals(0,sends);
    }
    @Test public void humanAmountUsesOnChainDecimalsBeforeReview() throws Exception {
        var result=transfers.prepareAmount(NativeJupiterRouteTest.key(2),NativeJupiterRouteTest.key(3),"10,000000",50);
        assertEquals("10.000000",result.review.inputAmount);
        assertThrows(IllegalArgumentException.class,()->transfers.prepareAmount(NativeJupiterRouteTest.key(2),NativeJupiterRouteTest.key(3),"0.0000001",50));
        assertEquals(0,sends);
    }
}
