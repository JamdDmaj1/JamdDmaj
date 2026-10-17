package com.jamddmaj.ai.wallet;

import org.junit.Test;
import static org.junit.Assert.*;

public class NativeSwapCheckTest {
    @Test public void decodeSectionCodesAreAllowlistedAndDoNotExposeValues() {
        for(NativeSwapPreparation.Part part:NativeSwapPreparation.Part.values()) {
            Exception failure=assertThrows(NativeSwapCheck.class,()->NativeSwapCheck.at(NativeSwapCheck.Stage.DECODE,
                ()->{throw new NativeSwapPreparation.InvalidPart(part);}));
            assertEquals("SWAP_CHECK_DECODE_"+part.name(),NativeSwapCheck.publicCode(failure));
        }
        Exception schema=assertThrows(NativeSwapCheck.class,()->NativeSwapCheck.at(NativeSwapCheck.Stage.DECODE,
            ()->{throw new org.json.JSONException("private-provider-value");}));
        assertEquals("SWAP_CHECK_DECODE_SCHEMA",NativeSwapCheck.publicCode(schema));
    }
    @Test public void decodeTimeMismatchHasActionableFixedCode() {
        Exception failure=assertThrows(NativeSwapCheck.class,()->NativeSwapCheck.at(NativeSwapCheck.Stage.DECODE,
            ()->{throw new NativeSwapPreparation.TimeMismatch();}));
        assertEquals("SWAP_CHECK_DECODE_TIME",NativeSwapCheck.publicCode(failure));
        assertTrue(NativeSwapCheck.describe(failure,false).contains("secure response time"));
        assertTrue(NativeSwapCheck.describe(failure,true).contains("respuesta segura"));
    }
    @Test public void successfulCheckPreservesExactResult() throws Exception {
        Object expected=new Object();
        assertSame(expected,NativeSwapCheck.at(NativeSwapCheck.Stage.QUOTE,()->expected));
    }
    @Test public void failuresExposeOnlyFixedStageNotProviderDetails() throws Exception {
        for(NativeSwapCheck.Stage stage:NativeSwapCheck.Stage.values()) {
            Exception failure=assertThrows(NativeSwapCheck.class,()->NativeSwapCheck.at(stage,()->{
                throw new IllegalArgumentException("private-provider-detail");
            }));
            assertEquals("SWAP_CHECK_"+stage.name(),NativeSwapCheck.publicCode(failure));
            assertFalse(NativeSwapCheck.publicCode(failure).contains("private-provider-detail"));
            for(boolean spanish:new boolean[]{true,false}) {
                String message=NativeSwapCheck.describe(failure,spanish);
                assertFalse(message.isEmpty());assertFalse(message.contains("private-provider-detail"));
            }
        }
        assertEquals("SWAP_CHECK_PREPARATION",NativeSwapCheck.publicCode(new Exception("private")));
    }
    @Test public void nestedChecksPreserveFirstFailedBoundary() {
        Exception failure=assertThrows(NativeSwapCheck.class,()->NativeSwapCheck.at(NativeSwapCheck.Stage.ROUTE,
            ()->NativeSwapCheck.at(NativeSwapCheck.Stage.COMPILE,()->{throw new Exception("private");})));
        assertEquals("SWAP_CHECK_COMPILE",NativeSwapCheck.publicCode(failure));
    }
}
