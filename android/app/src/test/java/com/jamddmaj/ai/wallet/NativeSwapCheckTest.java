package com.jamddmaj.ai.wallet;

import org.junit.Test;
import static org.junit.Assert.*;

public class NativeSwapCheckTest {
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
