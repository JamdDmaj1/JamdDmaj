package com.jamddmaj.ai.wallet;

import java.math.BigInteger;
import java.util.Arrays;

/** Current on-chain Position layout, checked against native owner/market intent.
 * Decoding position state does not approve funding, fees or other instructions. */
final class NativePerpsPosition {
    private final String address,asset;
    private final int side;
    final BigInteger sizeUsd,collateralUsd,price;
    final long openTime,updateTime;
    private NativePerpsPosition(byte[] data,String address,String asset,int side){
        this.address=address;this.asset=asset;this.side=side;
        openTime=time(data,136);updateTime=time(data,144);
        price=u64(data,153);sizeUsd=u64(data,161);collateralUsd=u64(data,169);
    }
    static NativePerpsPosition decode(String address,String programOwner,boolean executable,byte[] input,String payer,String asset,int side){
        if(!NativePerpsCustody.PROGRAM.equals(programOwner)||executable||input==null||input.length<210||input.length>4096)throw invalid();
        byte[] data=input.clone();
        SolanaProgramAddress.Derived expected=NativePerpsAddresses.positionDerivation(payer,asset,side);
        if(!expected.address().equals(address)||(data[209]&255)!=expected.bump
                ||!Arrays.equals(Arrays.copyOf(data,8),new byte[]{(byte)170,(byte)188,(byte)143,(byte)228,122,64,(byte)247,(byte)208})
                ||!key(data,8,payer)||!key(data,40,NativePerpsCustody.POOL)
                ||!key(data,72,NativePerpsCustody.address(asset))
                ||!key(data,104,NativePerpsCustody.address(side==1?asset:"USDC"))||(data[152]&255)!=side)throw invalid();
        // Account allocation can include zero-filled reserved bytes. A future
        // nonzero extension needs an explicit decoder upgrade, not silent use.
        for(int i=210;i<data.length;i++)if(data[i]!=0)throw invalid();
        NativePerpsPosition value=new NativePerpsPosition(data,address,asset,side);
        if(value.updateTime<value.openTime||(value.sizeUsd.signum()>0&&(value.openTime<=0||value.price.signum()<=0||value.collateralUsd.signum()<=0)))throw invalid();
        return value;
    }
    static void checkIncrease(NativePerpsPosition before,NativePerpsPosition after,NativePerpsInstructionData opening,NativePerpsOrderIntent intent){
        if(after==null||opening==null||intent==null||opening.kind!=NativePerpsInstructionData.Kind.INCREASE
                ||opening.side!=intent.side||!intent.asset.equals(after.asset)||intent.side!=after.side
                ||(before!=null&&!before.address.equals(after.address)))throw invalid();
        BigInteger sizeDelta=after.sizeUsd.subtract(before==null?BigInteger.ZERO:before.sizeUsd);
        BigInteger collateralDelta=after.collateralUsd.subtract(before==null?BigInteger.ZERO:before.collateralUsd);
        if(!sizeDelta.equals(opening.sizeUsd)||sizeDelta.compareTo(intent.maxSizeUsd)>0||collateralDelta.signum()<=0||collateralDelta.compareTo(intent.marginUsd)>0
                // Allow only the explicitly requested slippage in effective
                // leverage after collateral conversion and micro-unit rounding.
                ||sizeDelta.multiply(BigInteger.valueOf(100000)).compareTo(collateralDelta.multiply(BigInteger.valueOf(intent.leverageTenths))
                    .multiply(BigInteger.valueOf(10000+intent.maxSlippageBps)))>0)throw invalid();
    }
    private static boolean key(byte[] bytes,int offset,String expected){return Arrays.equals(Arrays.copyOfRange(bytes,offset,offset+32),DevnetSolana.decode(expected,32));}
    private static BigInteger u64(byte[] bytes,int offset){byte[] big=new byte[8];for(int i=0;i<8;i++)big[i]=bytes[offset+7-i];return new BigInteger(1,big);}
    private static long time(byte[] bytes,int offset){BigInteger value=u64(bytes,offset);if(value.bitLength()>63)throw invalid();return value.longValueExact();}
    private static IllegalArgumentException invalid(){return new IllegalArgumentException("Perps position differs from native owner or market intent");}
}
