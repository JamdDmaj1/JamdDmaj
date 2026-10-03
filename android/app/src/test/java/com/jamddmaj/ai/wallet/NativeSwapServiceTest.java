package com.jamddmaj.ai.wallet;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk=30)
public class NativeSwapServiceTest {
    @Test public void previewIncludesFeeAndSimulationForExactCandidate() throws Exception {
        Clock clock=new Clock();
        NativeSwapSimulation simulation=new NativeSwapSimulation((method,params)-> {
            if (method.equals("getGenesisHash")) return "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
            if (method.equals("getSlot") || method.equals("getBlockHeight")) return 100;
            org.json.JSONObject response=new org.json.JSONObject().put("context",new org.json.JSONObject().put("slot",100));
            if (method.equals("getFeeForMessage")) return response.put("value",5000);
            if (method.equals("simulateTransaction")) return response.put("value",new org.json.JSONObject()
                .put("err",org.json.JSONObject.NULL).put("unitsConsumed",200000));
            throw new AssertionError("Unexpected RPC: "+method);
        });
        NativeSwapService service=new NativeSwapService(intent->NativeSwapPreparationTest.fixture(),accounts(clock,false),clock,simulation);
        NativeSwapService.Preview preview=service.preview(NativeSwapPreparationTest.intent());
        assertTrue(preview.simulation.matches(preview.candidate.message));
        assertEquals("5000",preview.simulation.fee.toString());
    }
    static final class Clock implements NativeSwapService.Clock {
        long time=1001, elapsed=10;
        public long wall() { return time; }
        public long elapsed() { return elapsed; }
    }
    static NativeSolanaAccounts accounts(Clock clock, boolean expire) {
        return new NativeSolanaAccounts((method,params)-> {
            if (method.equals("getGenesisHash")) return "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
            if (method.equals("getSlot")) {
                if (expire) { clock.time=16000; clock.elapsed=16000; }
                return 100;
            }
            throw new AssertionError("Unexpected RPC: "+method);
        });
    }
    @Test public void preparesMatchingUnsignedMaterialWithoutSubmission() throws Exception {
        Clock clock=new Clock();
        NativeSwapService service=new NativeSwapService(intent->{
            assertEquals(NativeSwapPreparationTest.key(1),intent.payer);
            assertEquals("10000000",intent.amount);
            return NativeSwapPreparationTest.fixture();
        },accounts(clock,false),clock);
        NativeSwapService.Candidate candidate=service.prepare(NativeSwapPreparationTest.intent());
        assertEquals(-1,candidate.message.version);
        assertEquals("1178704",candidate.preparation.minimumOut.toString());
    }
    @Test public void expiryDuringRpcRejectsTheCandidate() {
        Clock clock=new Clock();
        NativeSwapService service=new NativeSwapService(intent->NativeSwapPreparationTest.fixture(),accounts(clock,true),clock);
        assertThrows(java.io.IOException.class,()->service.prepare(NativeSwapPreparationTest.intent()));
    }
    @Test public void providerFailureDoesNotAccessChain() {
        Clock clock=new Clock();
        NativeSwapService service=new NativeSwapService(intent->{throw new java.io.IOException("Unavailable");},
            new NativeSolanaAccounts((method,params)->{throw new AssertionError("RPC must not run");}),clock);
        assertThrows(java.io.IOException.class,()->service.prepare(NativeSwapPreparationTest.intent()));
    }
}
