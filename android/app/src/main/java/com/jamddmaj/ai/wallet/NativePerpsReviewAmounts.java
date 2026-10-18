package com.jamddmaj.ai.wallet;

import java.math.BigInteger;

/** Display-only immutable amounts. Possession never authorizes a signature. */
final class NativePerpsReviewAmounts {
    final BigInteger walletDebitUsdc,creditedCollateralUsd,estimatedTradingCostUsd,newExposureUsd;
    final BigInteger totalExposureUsd,totalCollateralUsd,networkFeeLamports,rentLockedLamports,rentRefundedLamports;
    NativePerpsReviewAmounts(BigInteger debit,BigInteger previousSize,BigInteger previousCollateral,
            BigInteger nextSize,BigInteger nextCollateral,BigInteger fee,BigInteger locked,BigInteger refunded){
        for(BigInteger value:new BigInteger[]{debit,previousSize,previousCollateral,nextSize,nextCollateral,fee,locked,refunded})
            if(value==null||value.signum()<0)throw new IllegalArgumentException("Invalid review amounts");
        newExposureUsd=nextSize.subtract(previousSize);
        creditedCollateralUsd=nextCollateral.subtract(previousCollateral);
        if(debit.signum()<=0||fee.signum()<=0||newExposureUsd.signum()<=0||creditedCollateralUsd.signum()<=0
                ||creditedCollateralUsd.compareTo(debit)>0)throw new IllegalArgumentException("Invalid review deltas");
        walletDebitUsdc=debit;estimatedTradingCostUsd=debit.subtract(creditedCollateralUsd);
        totalExposureUsd=nextSize;totalCollateralUsd=nextCollateral;
        networkFeeLamports=fee;rentLockedLamports=locked;rentRefundedLamports=refunded;
    }
    static String usd(BigInteger units){return decimal(units,6);}
    static String sol(BigInteger units){return decimal(units,9);}
    private static String decimal(BigInteger units,int decimals){
        if(units==null||units.signum()<0)throw new IllegalArgumentException("Invalid display amount");
        BigInteger[] parts=units.divideAndRemainder(BigInteger.TEN.pow(decimals));
        String fraction=parts[1].toString();
        StringBuilder result=new StringBuilder(parts[0].toString()).append('.');
        for(int i=fraction.length();i<decimals;i++)result.append('0');
        return result.append(fraction).toString();
    }
}
