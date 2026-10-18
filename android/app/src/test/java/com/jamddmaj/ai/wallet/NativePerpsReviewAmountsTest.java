package com.jamddmaj.ai.wallet;

import java.math.BigInteger;
import org.junit.Test;
import static org.junit.Assert.*;

public class NativePerpsReviewAmountsTest {
    private static BigInteger n(long value){return BigInteger.valueOf(value);}
    private static NativePerpsReviewAmounts amounts(long collateral){
        return new NativePerpsReviewAmounts(n(10000000),n(50000000),n(20000000),n(69400000),n(collateral),n(15000),n(2000000),n(0));
    }
    @Test public void separatesNewCreditCostsAndExistingExposure(){
        NativePerpsReviewAmounts value=amounts(29700000);
        assertEquals(n(19400000),value.newExposureUsd);assertEquals(n(9700000),value.creditedCollateralUsd);
        assertEquals(n(300000),value.estimatedTradingCostUsd);assertEquals(n(69400000),value.totalExposureUsd);
        assertEquals("10.000000",NativePerpsReviewAmounts.usd(value.walletDebitUsdc));
        assertEquals("0.000015000",NativePerpsReviewAmounts.sol(value.networkFeeLamports));
        assertEquals("0.002000000",NativePerpsReviewAmounts.sol(value.rentLockedLamports));
    }
    @Test public void rejectsNegativeCostsOrMissingPositiveCredit(){
        for(long credit:new long[]{20000000,19999999,30000001})
            assertThrows(IllegalArgumentException.class,()->amounts(credit));
    }
    @Test public void formatsIntegersWithoutPrecisionLoss(){
        assertEquals("18446744073709.551615",NativePerpsReviewAmounts.usd(new BigInteger("18446744073709551615")));
        assertEquals("0.000001",NativePerpsReviewAmounts.usd(n(1)));
        assertEquals("0.000000000",NativePerpsReviewAmounts.sol(n(0)));
        assertThrows(IllegalArgumentException.class,()->NativePerpsReviewAmounts.usd(n(-1)));
    }
}
