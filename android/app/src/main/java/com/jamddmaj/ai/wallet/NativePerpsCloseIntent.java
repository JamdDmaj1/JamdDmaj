package com.jamddmaj.ai.wallet;

import java.math.BigInteger;
import java.util.Arrays;

/** Full-close price/identity intent only. Never authorizes a signature: account
 * bindings, fresh chain state, exact-wire simulation and payout checks remain
 * mandatory. Settlement is collateral first, with a separate USDC conversion. */
final class NativePerpsCloseIntent {
    private static final byte[] V1={46,23,(byte)240,44,30,(byte)138,94,(byte)140};
    private static final byte[] V2={(byte)162,(byte)191,(byte)200,62,(byte)139,62,(byte)176,17};
    final String payer,asset,positionAddress,receiveToken;
    final int side,maxSlippageBps;
    final BigInteger sizeUsd,collateralUsd,referencePrice,priceLimit;
    NativePerpsCloseIntent(String payer,String asset,int side,NativePerpsPosition observed,
            String referencePrice,int maxSlippageBps){
        if(observed==null||!observed.matches(payer,asset,side)||observed.sizeUsd.signum()<=0
                ||maxSlippageBps<1||maxSlippageBps>100)throw invalid();
        this.payer=payer;this.asset=asset;this.side=side;this.maxSlippageBps=maxSlippageBps;
        positionAddress=DevnetSolana.encode(NativePerpsAddresses.position(payer,asset,side));
        sizeUsd=observed.sizeUsd;collateralUsd=observed.collateralUsd;
        this.referencePrice=NativePerpsOrderIntent.usd(referencePrice);
        BigInteger numerator=this.referencePrice.multiply(BigInteger.valueOf(side==1?10000-maxSlippageBps:10000+maxSlippageBps));
        // Closing a long sells (minimum), closing a short buys (maximum).
        priceLimit=(side==1?numerator.add(BigInteger.valueOf(9999)):numerator).divide(BigInteger.valueOf(10000));
        receiveToken=side==1?asset:"USDC";
    }
    static final class Core {
        final boolean variant2;
        final BigInteger counter,price;
        final long requestTime;
        private Core(boolean variant2,BigInteger counter,BigInteger price,long requestTime){
            this.variant2=variant2;this.counter=counter;this.price=price;this.requestTime=requestTime;
        }
    }
    Core checkCore(byte[] input,long trustedNowSeconds){
        if(input==null||trustedNowSeconds<30||trustedNowSeconds>Long.MAX_VALUE-2)throw invalid();
        byte[] data=input.clone();boolean v2=data.length==50&&Arrays.equals(Arrays.copyOf(data,8),V2);
        if(!(v2||data.length==42&&Arrays.equals(Arrays.copyOf(data,8),V1))||data[32]!=1||data[33]!=1)throw invalid();
        BigInteger collateral=u64(data,8),size=u64(data,16),price=u64(data,24),time=u64(data,34);
        if(collateral.compareTo(collateralUsd)>0||size.compareTo(sizeUsd)>0||price.signum()<=0
                ||time.bitLength()>63||time.longValue()<trustedNowSeconds-30||time.longValue()>trustedNowSeconds+2
                ||(side==1?price.compareTo(priceLimit)<0:price.compareTo(priceLimit)>0))throw invalid();
        return new Core(v2,v2?u64(data,42):null,price,time.longValueExact());
    }
    private static BigInteger u64(byte[] data,int offset){byte[] big=new byte[8];for(int i=0;i<8;i++)big[i]=data[offset+7-i];return new BigInteger(1,big);}
    private static IllegalArgumentException invalid(){return new IllegalArgumentException("Full close differs from native position or protected price");}
}
