package com.jamddmaj.ai.wallet;

import org.junit.Test;
import static org.junit.Assert.*;

public class NativeSwapAmountsTest {
    @Test public void preservesExactSolAndTokenUnits() {
        assertEquals("10000000",NativeSwapAmounts.units("0,01",9));
        assertEquals("1000001",NativeSwapAmounts.units("1.000001",6));
        assertEquals("18446744073709551615",NativeSwapAmounts.units("18446744073709551615",0));
    }
    @Test public void rejectsAmbiguityRoundingAndOverflow() {
        for(String amount:new String[]{"1,000.01","1.000,01","1e3","-1","+1"," 1","01","0","0.0000001","18446744073709551616"})
            assertThrows(IllegalArgumentException.class,()->NativeSwapAmounts.units(amount,6));
    }
}
