package com.jamddmaj.ai.wallet;

import android.util.Base64;
import java.math.BigInteger;
import java.util.Arrays;
import org.bouncycastle.math.ec.rfc8032.Ed25519;
import org.json.*;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk=30)
public class NativePerpsSimulationTest {
    static NativePerpsTransaction transaction(){
        byte[] message=NativePerpsAccountBindingsTest.transaction(false,false,false,false).bytes();
        for(int i=0;i<3;i++)System.arraycopy(NativePerpsTransactionTest.publicKey(i+1),0,message,4+32*i,32);
        byte[] wire=new byte[193+message.length];wire[0]=3;System.arraycopy(message,0,wire,193,message.length);
        Ed25519.sign(NativePerpsTransactionTest.seed(3),0,message,0,message.length,wire,129);
        return NativePerpsTransaction.decode(wire,NativePerpsTransactionTest.payer());
    }
    static final class Rpc implements NativeWalletRpc.Transport {
        final NativePerpsTransaction candidate=transaction();
        JSONArray addresses;int simulated,identities,heightReads;long slot=100,fee=15000,height=50;
        boolean failed,incomplete;JSONObject source;
        public Object request(String method,JSONArray params)throws Exception{
            switch(method){
                case "getGenesisHash":identities++;return "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
                case "getSlot":return 100;
                case "getBlockHeight":heightReads++;return height;
                case "getMultipleAccounts":
                    addresses=params.getJSONArray(0);assertEquals("confirmed",params.getJSONObject(1).getString("commitment"));return snapshot("value");
                case "getFeeForMessage":
                    assertArrayEquals(candidate.message.bytes(),Base64.decode(params.getString(0),Base64.NO_WRAP));
                    return new JSONObject().put("context",new JSONObject().put("slot",slot)).put("value",fee);
                case "simulateTransaction":
                    simulated++;assertArrayEquals(candidate.bytes(),Base64.decode(params.getString(0),Base64.NO_WRAP));
                    JSONObject options=params.getJSONObject(1);assertFalse(options.getBoolean("sigVerify"));assertFalse(options.getBoolean("replaceRecentBlockhash"));
                    assertEquals(addresses.toString(),options.getJSONObject("accounts").getJSONArray("addresses").toString());
                    JSONObject response=snapshot("accounts");JSONObject value=new JSONObject().put("err",failed?"fixture failure":JSONObject.NULL)
                        .put("unitsConsumed",400000).put("accounts",response.get("accounts"));
                    return new JSONObject().put("context",response.get("context")).put("value",value);
                default:throw new AssertionError("Forbidden or unexpected simulation method: "+method);
            }
        }
        JSONObject snapshot(String name)throws Exception{
            JSONArray values=new JSONArray();
            source=new JSONObject().put("owner","11111111111111111111111111111111").put("executable",false).put("lamports",1000000)
                .put("data",new JSONArray().put("").put("base64"));
            for(int i=0;i<addresses.length()-(incomplete?1:0);i++)values.put(source);
            return new JSONObject().put("context",new JSONObject().put("slot",slot)).put(name,values);
        }
    }
    private static NativePerpsSimulation simulation(Rpc rpc){
        NativeWalletRpc.Transport lookup=(method,params)->{
            if(method.equals("getGenesisHash"))return "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
            if(method.equals("getSlot"))return 100;
            throw new AssertionError("Unexpected lookup method: "+method);
        };
        return new NativePerpsSimulation(rpc,new NativeSolanaAccounts(lookup),(owner,mint,program)->DevnetSolana.encode(NativePerpsTransactionTest.publicKey(9)));
    }
    private static NativePerpsSimulation.Result inspect(Rpc rpc)throws Exception{
        NativePerpsOrderIntent intent=new NativePerpsOrderIntent("SOL",1,"10","2",50,"105",null,null);
        return simulation(rpc).inspect(rpc.candidate,intent,NativePerpsTransactionTest.payer(),BigInteger.valueOf(100));
    }
    @Test public void preservesAllCosignatureBytesAndReturnsImmutableUnapprovedSnapshots()throws Exception{
        Rpc rpc=new Rpc();NativePerpsSimulation.Result result=inspect(rpc);
        assertEquals(1,rpc.simulated);assertEquals(2,rpc.identities);assertEquals(2,rpc.heightReads);assertTrue(result.matches(rpc.candidate));
        assertEquals(BigInteger.valueOf(15000),result.fee);assertEquals(result.before.size(),result.after.size());
        String payer=NativePerpsTransactionTest.payer();rpc.source.put("lamports",1);
        assertEquals(BigInteger.valueOf(1000000),result.after.get(payer).lamports);
        assertThrows(UnsupportedOperationException.class,()->result.after.clear());
        assertArrayEquals(new byte[0],result.after.get(payer).data());
    }
    @Test public void rejectsExpiredBlockhashBeforeSimulation()throws Exception{
        Rpc rpc=new Rpc();rpc.height=101;
        assertThrows(java.io.IOException.class,()->inspect(rpc));assertEquals(0,rpc.simulated);
    }
    @Test public void rejectsStaleSnapshotsFeesFailedSimulationAndMissingAccounts()throws Exception{
        Rpc stale=new Rpc();stale.slot=99;assertThrows(java.io.IOException.class,()->inspect(stale));
        Rpc fees=new Rpc();fees.fee=1000001;assertThrows(java.io.IOException.class,()->inspect(fees));assertEquals(0,fees.simulated);
        Rpc failed=new Rpc();failed.failed=true;assertThrows(java.io.IOException.class,()->inspect(failed));
        Rpc incomplete=new Rpc();incomplete.incomplete=true;assertThrows(java.io.IOException.class,()->inspect(incomplete));assertEquals(0,incomplete.simulated);
    }
}
