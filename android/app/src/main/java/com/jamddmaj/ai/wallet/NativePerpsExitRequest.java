package com.jamddmaj.ai.wallet;

import java.math.BigInteger;
import java.util.Arrays;

/** Pending TP/SL state, decoded from the current program-owned mainnet IDL.
 * A matching request is evidence only, never permission to sign or execute. */
final class NativePerpsExitRequest {
    final BigInteger sizeUsd,triggerPrice,counter;
    final boolean triggerAbove;
    private NativePerpsExitRequest(BigInteger size,BigInteger price,BigInteger counter,boolean above){
        sizeUsd=size;triggerPrice=price;this.counter=counter;triggerAbove=above;
    }
    static NativePerpsExitRequest check(String address,String owner,boolean executable,byte[] bytes,
            String payer,String asset,int side,NativePerpsInstructionData instruction){
        if(!NativePerpsCustody.PROGRAM.equals(owner)||executable||bytes==null||bytes.length<230||bytes.length>4096
                ||instruction==null||instruction.kind!=NativePerpsInstructionData.Kind.TPSL||(side!=1&&side!=2))throw invalid();
        Cursor c=new Cursor(bytes.clone());
        if(!Arrays.equals(c.take(8),new byte[]{12,38,(byte)250,(byte)199,46,(byte)154,32,(byte)216}))throw invalid();
        c.key(payer);c.key(NativePerpsCustody.POOL);c.key(NativePerpsCustody.address(asset));
        byte[] position=NativePerpsAddresses.position(payer,asset,side);
        c.key(DevnetSolana.encode(position));c.key(NativePerpsFunding.USDC);
        long opened=c.time(),updated=c.time();
        BigInteger size=c.u64(),collateral=c.u64();
        if(opened<=0||updated<opened||!size.equals(instruction.sizeUsd)||!BigInteger.ZERO.equals(collateral)
                ||c.u8()!=2||c.u8()!=1||c.u8()!=side)throw invalid();
        // TP/SL requests must not carry market slippage, swap minimum or a
        // deferred pre-swap amount. All options are decoded, not skipped.
        if(c.optionalNumber()!=null||c.optionalNumber()!=null||c.optionalNumber()!=null)throw invalid();
        BigInteger trigger=c.optionalNumber();Boolean above=c.optionalBoolean(),entire=c.optionalBoolean();
        if(trigger==null||!trigger.equals(instruction.price)||!instruction.triggerAbove.equals(above)
                ||!Boolean.FALSE.equals(entire)||!Boolean.FALSE.equals(instruction.entirePosition)||c.bool())throw invalid();
        BigInteger counter=c.u64();int bump=c.u8();
        if(!counter.equals(instruction.counter))throw invalid();
        SolanaProgramAddress.Derived derived=NativePerpsAddresses.exitDerivation(position,counter);
        if(!derived.address().equals(address)||derived.bump!=bump)throw invalid();
        if(c.u8()!=0)throw invalid(); // Referral is not authorized by native intent.
        while(c.offset<c.data.length)if(c.u8()!=0)throw invalid();
        return new NativePerpsExitRequest(size,trigger,counter,above);
    }
    private static final class Cursor {
        final byte[] data;int offset;
        Cursor(byte[] data){this.data=data;}
        byte[] take(int size){if(size<0||offset>data.length-size)throw invalid();byte[] value=Arrays.copyOfRange(data,offset,offset+size);offset+=size;return value;}
        int u8(){return take(1)[0]&255;}
        boolean bool(){int value=u8();if(value>1)throw invalid();return value==1;}
        BigInteger u64(){byte[] value=take(8),big=new byte[8];for(int i=0;i<8;i++)big[7-i]=value[i];return new BigInteger(1,big);}
        long time(){BigInteger value=u64();if(value.bitLength()>63)throw invalid();return value.longValueExact();}
        void key(String expected){if(!Arrays.equals(take(32),DevnetSolana.decode(expected,32)))throw invalid();}
        BigInteger optionalNumber(){return bool()?u64():null;}
        Boolean optionalBoolean(){return bool()?bool():null;}
    }
    private static IllegalArgumentException invalid(){return new IllegalArgumentException("Pending TP/SL differs from native position intent");}
}
