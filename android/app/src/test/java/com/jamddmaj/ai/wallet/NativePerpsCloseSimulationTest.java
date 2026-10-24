package com.jamddmaj.ai.wallet;

import android.util.Base64;
import java.math.BigInteger;
import java.util.Collections;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk=30)
public class NativePerpsCloseSimulationTest {
    private static final class Rpc implements NativeWalletRpc.Transport {
        final NativePerpsTransaction transaction=NativePerpsCloseBindingsTest.transaction(true,-1,false,true);
        int simulations,reads;long beforeSlot=100,afterSlot=100,fee=15000;boolean fail,replacement,incomplete;
        JSONArray addresses;
        public Object request(String method,JSONArray params)throws Exception{
            switch(method){
                case "getGenesisHash":return "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
                case "getSlot":return 100;
                case "getBlockHeight":return 50;
                case "getFeeForMessage":
                    assertArrayEquals(transaction.message.bytes(),Base64.decode(params.getString(0),Base64.NO_WRAP));
                    return new JSONObject().put("context",new JSONObject().put("slot",100)).put("value",fee);
                case "getMultipleAccounts":
                    reads++;addresses=params.getJSONArray(0);return snapshot(beforeSlot,"value");
                case "simulateTransaction":
                    simulations++;assertArrayEquals(transaction.bytes(),Base64.decode(params.getString(0),Base64.NO_WRAP));
                    JSONObject options=params.getJSONObject(1);assertFalse(options.getBoolean("sigVerify"));assertFalse(options.getBoolean("replaceRecentBlockhash"));
                    assertEquals(addresses.toString(),options.getJSONObject("accounts").getJSONArray("addresses").toString());
                    JSONObject response=snapshot(afterSlot,"accounts"),value=new JSONObject().put("err",fail?"fixture":JSONObject.NULL).put("accounts",response.get("accounts")).put("unitsConsumed",300000);
                    if(replacement)value.put("replacementBlockhash",new JSONObject().put("blockhash","unapproved"));
                    return new JSONObject().put("context",response.get("context")).put("value",value);
                default:throw new AssertionError("Unexpected or forbidden RPC: "+method);
            }
        }
        private JSONObject snapshot(long slot,String name)throws Exception{
            JSONArray values=new JSONArray();for(int i=0;i<addresses.length()-(incomplete?1:0);i++)values.put(JSONObject.NULL);
            return new JSONObject().put("context",new JSONObject().put("slot",slot)).put(name,values);
        }
    }
    private static NativePerpsSimulation simulator(Rpc rpc){
        NativeWalletRpc.Transport lookup=(method,params)->{
            if("getGenesisHash".equals(method))return "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
            if("getSlot".equals(method))return 100;
            throw new AssertionError("Unexpected lookup RPC "+method);
        };
        return new NativePerpsSimulation(rpc,new NativeSolanaAccounts(lookup),(owner,mint,program)->DevnetSolana.encode(NativePerpsTokenBoundary.associated(DevnetSolana.decode(owner,32),mint)));
    }
    private static NativePerpsSimulation.Result inspect(Rpc rpc)throws Exception{
        return simulator(rpc).inspectClose(rpc.transaction,NativePerpsCloseBindingsTest.intent(),BigInteger.valueOf(60),BigInteger.valueOf(100),Collections.emptySet());
    }
    @Test public void collectsExactUnsignedWireAndSameBankWithoutApprovingEffects()throws Exception{
        Rpc rpc=new Rpc();NativePerpsSimulation.Result result=inspect(rpc);assertTrue(result.matches(rpc.transaction));assertEquals(BigInteger.valueOf(100),result.slot);assertEquals(1,rpc.simulations);
        assertTrue(result.before.containsKey(NativePerpsCloseBindingsTest.intent().positionAddress));
        // Empty fake positions are not valid close effects; collection alone
        // deliberately grants no review/signing permission.
        assertNull(result.before.get(NativePerpsCloseBindingsTest.intent().positionAddress));
    }
    @Test public void refusesDifferentBanksRatherThanComparingUnrelatedState(){
        Rpc rpc=new Rpc();rpc.afterSlot=101;assertThrows(Exception.class,()->inspect(rpc));assertTrue(rpc.simulations<=3);
    }
    @Test public void refusesFailureReplacementBlockhashIncompleteSnapshotsAndUnboundedFees(){
        for(int mode=0;mode<4;mode++){
            Rpc rpc=new Rpc();if(mode==0)rpc.fail=true;if(mode==1)rpc.replacement=true;if(mode==2)rpc.incomplete=true;if(mode==3)rpc.fee=1000001;
            assertThrows(Exception.class,()->inspect(rpc));
        }
    }
}
