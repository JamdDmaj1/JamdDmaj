package com.jamddmaj.ai.wallet;

import java.math.BigInteger;
import java.util.Arrays;

/** Bounded Jupiter Perps instruction decoder, NOT signing authorization.
 * Layout: security/native-tests/jupiter-perps-idl-layout.json, read from the
 * program-owned mainnet IDL. Accounts, oracle data, sizing, fees and simulated
 * effects must independently match the user's intent before any signing path.
 */
final class NativePerpsInstructionData {
    enum Kind { INCREASE, DECREASE, TPSL }
    final Kind kind;
    final BigInteger sizeUsd, collateral, price, counter;
    final int side;
    final Boolean entirePosition, triggerAbove;
    final long requestTime;
    private NativePerpsInstructionData(Kind kind,BigInteger size,BigInteger collateral,
            BigInteger price,BigInteger counter,int side,Boolean entire,Boolean above,long time) {
        this.kind=kind;this.sizeUsd=size;this.collateral=collateral;this.price=price;
        this.counter=counter;this.side=side;this.entirePosition=entire;
        this.triggerAbove=above;this.requestTime=time;
    }
    static NativePerpsInstructionData parse(byte[] input) {
        if(input==null||input.length<8||input.length>64)throw invalid();
        Cursor c=new Cursor(input.clone());
        byte[] discriminator=c.take(8);
        Kind kind;
        BigInteger size,collateral,price,counter=null;
        int side=0;
        Boolean entire=null,above=null;
        long time;
        if(Arrays.equals(discriminator,new byte[]{(byte)164,126,68,(byte)182,(byte)223,(byte)166,64,(byte)183})) {
            kind=Kind.INCREASE;size=c.u64();
            collateral=c.option()?c.u64():null;
            side=c.u8();if(side!=1&&side!=2)throw invalid();
            price=c.u64();time=c.time();
            if(size.signum()<=0)throw invalid();
        } else if(Arrays.equals(discriminator,new byte[]{(byte)162,(byte)191,(byte)200,62,(byte)139,62,(byte)176,17})) {
            kind=Kind.DECREASE;collateral=c.u64();size=c.u64();price=c.u64();
            entire=c.option()?c.bool():null;time=c.time();counter=c.u64();
        } else if(Arrays.equals(discriminator,new byte[]{117,98,66,127,30,50,73,(byte)185})) {
            kind=Kind.TPSL;collateral=c.u64();size=c.u64();price=c.u64();
            above=c.bool();entire=c.bool();counter=c.u64();time=c.time();
        } else throw invalid();
        if(c.offset!=input.length||price.signum()<=0)throw invalid();
        return new NativePerpsInstructionData(kind,size,collateral,price,counter,side,entire,above,time);
    }
    private static IllegalArgumentException invalid(){return new IllegalArgumentException("Invalid perps instruction data");}
    private static final class Cursor {
        final byte[] bytes;int offset;
        Cursor(byte[] bytes){this.bytes=bytes;}
        int u8(){if(offset>=bytes.length)throw invalid();return bytes[offset++]&255;}
        boolean bool(){int value=u8();if(value>1)throw invalid();return value==1;}
        boolean option(){return bool();}
        byte[] take(int size){if(size<0||size>bytes.length-offset)throw invalid();byte[] value=Arrays.copyOfRange(bytes,offset,offset+size);offset+=size;return value;}
        BigInteger u64(){byte[] little=take(8),big=new byte[8];for(int i=0;i<8;i++)big[i]=little[7-i];return new BigInteger(1,big);}
        long time(){BigInteger value=u64();if(value.signum()<=0||value.bitLength()>63)throw invalid();return value.longValueExact();}
    }
}
