package com.jamddmaj.ai.wallet;

import android.util.Base64;
import org.json.*;
import org.bouncycastle.math.ec.rfc8032.Ed25519;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;

/** Complete native account/plan policy with a deterministic mainnet-RPC fixture.
 * Test keys only; never reads secrets or calls a live endpoint/signing service. */
@RunWith(RobolectricTestRunner.class)
@Config(sdk=30)
public class NativePerpsAccountVerificationTest {
    static final class Rpc implements NativeWalletRpc.Transport {
        final NativePerpsPreSwapPlanTest.Fixture fixture=new NativePerpsPreSwapPlanTest.Fixture(true);
        int ledgerReads;boolean wrongLedgerOwner,executableLedger,wrongLedgerLength,positionRequests;
        Rpc(){fixture.compile();}
        public Object request(String method,JSONArray params)throws Exception{
            switch(method){
                case "getGenesisHash":return "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
                case "getSlot":return 100;
                case "getProgramAccounts":
                    assertEquals(NativePerpsCustody.PROGRAM,params.getString(0));JSONObject query=params.getJSONObject(1);assertTrue(query.getBoolean("withContext"));
                    assertEquals(3,query.getJSONArray("filters").length());assertEquals(104,query.getJSONArray("filters").getJSONObject(2).getJSONObject("memcmp").getInt("offset"));
                    return context(positionRequests?new JSONArray().put(new JSONObject()):new JSONArray());
                case "getMultipleAccounts":
                    assertEquals(1,params.getJSONArray(0).length());
                    assertEquals(DevnetSolana.encode(fixture.lookup),params.getJSONArray(0).getString(0));
                    return context(new JSONArray().put(account(SolanaLookupTables.PROGRAM,false,fixture.table)));
                case "getAccountInfo":
                    String address=params.getString(0);JSONObject value;
                    if(address.equals(NativePerpsCustody.address("SOL")))value=account(NativePerpsCustody.PROGRAM,false,NativePerpsCustodyTest.fixture());
                    else if(address.equals(NativePerpsCustody.address("USDC"))){
                        byte[] bytes=NativePerpsCustodyTest.fixture();
                        System.arraycopy(DevnetSolana.decode(NativePerpsFunding.USDC,32),0,bytes,40,32);bytes[104]=6;bytes[105]=1;
                        byte[] key=new byte[32];key[0]=90;System.arraycopy(key,0,bytes,72,32);key[0]=91;System.arraycopy(key,0,bytes,384,32);
                        value=account(NativePerpsCustody.PROGRAM,false,bytes);
                    }else if(address.equals(DevnetSolana.encode(fixture.route.ledger[0]))){
                        ledgerReads++;byte[] data=NativePerpsTokenLedgerTest.fixture();
                        if(wrongLedgerLength)data=java.util.Arrays.copyOf(data,49);
                        value=account(wrongLedgerOwner?NativePerpsFunding.SYSTEM:NativePerpsCustody.PROGRAM,executableLedger,data);
                    }else throw new AssertionError("Unexpected public account read");
                    return context(value);
                default:throw new AssertionError("Forbidden or unexpected RPC method: "+method);
            }
        }
        private static JSONObject context(Object value)throws Exception{return new JSONObject().put("context",new JSONObject().put("slot",100)).put("value",value);}
        private static JSONObject account(String owner,boolean executable,byte[] data)throws Exception{return new JSONObject().put("owner",owner).put("executable",executable).put("lamports",2000000)
            .put("data",new JSONArray().put(Base64.encodeToString(data,Base64.NO_WRAP)).put("base64"));}
        NativePerpsTransaction transaction(){
            fixture.compile();byte[] message=fixture.message.bytes(),wire=new byte[193+message.length];wire[0]=3;
            System.arraycopy(message,0,wire,193,message.length);
            Ed25519.sign(NativePerpsTransactionTest.seed(3),0,message,0,message.length,wire,129);
            return NativePerpsTransaction.decode(wire,NativePerpsTransactionTest.payer());
        }
        void verify()throws Exception{new NativeSolanaAccounts(this).verifyPerpsOrderAccounts(transaction(),fixture.intent,1792277047L);}
    }
    @Test public void verifiesDecodedUsdcLongThroughRealNativeAccountPolicy()throws Exception{
        Rpc rpc=new Rpc();rpc.verify();assertEquals(1,rpc.ledgerReads);
    }
    @Test public void refusesOldPositionRequestsBeforeNewExposureOrLedgerRead()throws Exception{
        Rpc rpc=new Rpc();rpc.positionRequests=true;Exception failure=assertThrows(Exception.class,rpc::verify);
        assertEquals("PERPS_POSITION_REQUESTS_REQUIRE_REVIEW",failure.getMessage());assertEquals(0,rpc.ledgerReads);
    }
    @Test public void rejectsNonProgramOwnedExecutableOrMalformedLedger()throws Exception{
        for(int i=0;i<3;i++){
            Rpc rpc=new Rpc();rpc.wrongLedgerOwner=i==0;rpc.executableLedger=i==1;rpc.wrongLedgerLength=i==2;
            assertThrows(Exception.class,rpc::verify);
        }
    }
    @Test public void rejectsOverspendingOrWeakOutputBeforeAcceptingLedger()throws Exception{
        for(byte[] data:new byte[][]{NativePerpsPreSwapDataTest.swap(10000001,95000000),NativePerpsPreSwapDataTest.swap(10000000,1)}){
            Rpc rpc=new Rpc();rpc.fixture.data.set(1,data);assertThrows(Exception.class,rpc::verify);assertEquals(0,rpc.ledgerReads);
        }
    }
    @Test public void verifiesExactUsdcShortWithoutReadingAnUnneededLedger()throws Exception{
        Rpc rpc=new Rpc();NativePerpsPreSwapPlanTest.configureShort(rpc.fixture);rpc.verify();assertEquals(0,rpc.ledgerReads);
    }
}
