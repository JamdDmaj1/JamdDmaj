package com.jamddmaj.ai.wallet;

import android.util.Base64;
import java.math.BigInteger;
import java.util.Arrays;
import java.util.List;
import org.json.*;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk=30)
public class NativeSwapSimulationTest {
    static byte[] key(int n) { byte[] b=new byte[32]; b[0]=(byte)n; return b; }
    static SolanaMessage message() {
        return SolanaMessageCompiler.compile(key(1),key(9),List.of(new SolanaMessageCompiler.Instruction(key(2),
            List.of(new SolanaMessageCompiler.Meta(key(1),true,true)),new byte[]{7})),List.of(),BigInteger.ONE);
    }
    static class Rpc implements NativeWalletRpc.Transport {
        Object fee=5000, error=JSONObject.NULL;
        long slot=100,height=100;
        int simulations;
        public Object request(String method,JSONArray params) throws Exception {
            switch(method) {
                case "getGenesisHash": return "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
                case "getSlot": return 100;
                case "getBlockHeight": return height;
                case "getFeeForMessage":
                    assertArrayEquals(message().bytes(),Base64.decode(params.getString(0),Base64.NO_WRAP));
                    return new JSONObject().put("context",new JSONObject().put("slot",slot)).put("value",fee);
                case "simulateTransaction":
                    simulations++;
                    byte[] wire=Base64.decode(params.getString(0),Base64.NO_WRAP);
                    assertEquals(1,wire[0]); assertArrayEquals(new byte[64],Arrays.copyOfRange(wire,1,65));
                    assertArrayEquals(message().bytes(),Arrays.copyOfRange(wire,65,wire.length));
                    JSONObject options=params.getJSONObject(1);
                    assertFalse(options.getBoolean("sigVerify")); assertFalse(options.getBoolean("replaceRecentBlockhash"));
                    assertEquals("100",options.get("minContextSlot").toString());
                    return new JSONObject().put("context",new JSONObject().put("slot",slot))
                        .put("value",new JSONObject().put("err",error).put("unitsConsumed",250000));
                default: throw new AssertionError("Unexpected RPC: "+method);
            }
        }
    }
    static NativeSwapSimulation.Result inspect(Rpc rpc) throws Exception {
        return new NativeSwapSimulation(rpc).inspect(message(),DevnetSolana.encode(key(1)),BigInteger.valueOf(200));
    }
    @Test public void evidenceBindsExactMessageAndFee() throws Exception {
        Rpc rpc=new Rpc(); NativeSwapSimulation.Result result=inspect(rpc);
        assertEquals(BigInteger.valueOf(5000),result.fee); assertTrue(result.matches(message()));
        assertEquals(1,rpc.simulations);
    }
    @Test public void expiredBlockhashOrMissingFeeStopsBeforeSimulation() {
        Rpc expired=new Rpc(); expired.height=201;
        assertThrows(java.io.IOException.class,()->inspect(expired)); assertEquals(0,expired.simulations);
        Rpc missing=new Rpc(); missing.fee=JSONObject.NULL;
        assertThrows(Exception.class,()->inspect(missing)); assertEquals(0,missing.simulations);
        Rpc high=new Rpc(); high.fee=1000001;
        assertThrows(java.io.IOException.class,()->inspect(high)); assertEquals(0,high.simulations);
    }
    @Test public void rejectsStaleContextAndFailedSimulation() {
        Rpc stale=new Rpc(); stale.slot=99;
        assertThrows(java.io.IOException.class,()->inspect(stale));
        Rpc failed=new Rpc(); failed.error=new JSONObject().put("InstructionError",1);
        assertThrows(java.io.IOException.class,()->inspect(failed));
    }
}
