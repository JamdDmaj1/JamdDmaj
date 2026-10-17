package com.jamddmaj.ai.wallet;

import java.math.BigInteger;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.List;
import org.junit.Test;
import static org.junit.Assert.*;

public class NativePerpsOrderIntentTest {
    private static final long NOW=1792278805L;
    private static NativePerpsOrderIntent intent(int side,String sl,String tp){return new NativePerpsOrderIntent("SOL",side,"10.304152","2",50,"103.041520",sl,tp);}
    private static byte[] hex(String value){byte[] bytes=new byte[value.length()/2];for(int i=0;i<bytes.length;i++)bytes[i]=(byte)Integer.parseInt(value.substring(i*2,i*2+2),16);return bytes;}
    // Public live builder output, unsigned by user, never submitted.
    private static byte[] open(){return hex("a47e44b6dfa640b77c043a01000000000100e1f505000000000178262c06000000001501d46a00000000");}
    private static byte[] sl(){return hex("7562427f1e3249b900000000000000007c043a0100000000c095a905000000000000e4276b38000000001501d46a00000000");}
    private static byte[] tp(){return hex("7562427f1e3249b900000000000000007c043a010000000080778e06000000000100e78fda12000000001501d46a00000000");}
    private static NativePerpsInstructionData parse(byte[] data){return NativePerpsInstructionData.parse(data);}
    private static byte[] number(byte[] input,int offset,long value){byte[] bytes=input.clone();ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN).putLong(offset,value);return bytes;}
    private static void reject(NativePerpsOrderIntent intent,byte[] open,byte[] sl,byte[] tp){assertThrows(IllegalArgumentException.class,()->intent.checkInstructions(List.of(parse(open),parse(sl),parse(tp)),NOW));}
    @Test public void matchesLiveDataIncludingExitSizingAndMicroPriceRounding(){
        intent(1,"95","110").checkInstructions(List.of(parse(open()),parse(sl()),parse(tp())),NOW);
        assertEquals(new BigInteger("10304152"),intent(1,null,null).marginUsd);
        assertEquals(new BigInteger("20608304"),intent(1,null,null).maxSizeUsd);
        assertEquals(new BigInteger("1"),NativePerpsOrderIntent.usd("0.000001"));
    }
    @Test public void rejectsExcessExposureWrongSideAndSlippage(){
        NativePerpsOrderIntent intent=intent(1,"95","110");
        reject(intent,number(open(),8,20608305),sl(),tp());
        byte[] wrongSide=open();wrongSide[25]=2;reject(intent,wrongSide,sl(),tp());
        reject(intent,number(open(),26,103556729),sl(),tp());
    }
    @Test public void rejectsChangedMissingDuplicatedOrUnlimitedExits(){
        NativePerpsOrderIntent intent=intent(1,"95","110");
        reject(intent,open(),number(sl(),24,94000000),tp());
        reject(intent,open(),number(sl(),16,1),tp());
        reject(intent,open(),number(sl(),8,1),tp());
        byte[] unlimited=sl();unlimited[33]=1;reject(intent,open(),unlimited,tp());
        reject(intent,open(),sl(),sl());
        assertThrows(IllegalArgumentException.class,()->intent.checkInstructions(List.of(parse(open())),NOW));
        assertThrows(IllegalArgumentException.class,()->intent(1,null,null).checkInstructions(List.of(parse(open()),parse(sl())),NOW));
        intent(1,null,null).checkInstructions(List.of(parse(open())),NOW);
    }
    @Test public void rejectsExpiredFutureAndMisorderedRequests(){
        NativePerpsOrderIntent intent=intent(1,"95","110");
        reject(intent,number(open(),34,NOW-31),sl(),tp());
        reject(intent,open(),number(sl(),42,NOW+3),tp());
        assertThrows(IllegalArgumentException.class,()->intent.checkInstructions(List.of(parse(sl()),parse(open()),parse(tp())),NOW));
        assertThrows(IllegalArgumentException.class,()->intent.checkInstructions(List.of(parse(open()),parse(sl()),parse(tp())),Long.MAX_VALUE));
    }
    @Test public void validatesShortDirectionAndPriceFloor(){
        NativePerpsOrderIntent intent=intent(2,"110","95");
        byte[] shortOpen=number(open(),26,102526312);shortOpen[25]=2;
        intent.checkInstructions(List.of(parse(shortOpen),parse(tp()),parse(sl())),NOW);
        reject(intent,number(shortOpen,26,102526311),tp(),sl());
    }
    @Test public void rejectsAmbiguousMoneyLeverageAndExitInputs(){
        for(String amount:new String[]{"0","-1","01","1e2"," 10","10.0000001","1000000000"})assertThrows(IllegalArgumentException.class,()->new NativePerpsOrderIntent("SOL",1,amount,"2",50,"100",null,null));
        for(String leverage:new String[]{"1","50.1","2.01","2e1","02","NaN"})assertThrows(IllegalArgumentException.class,()->new NativePerpsOrderIntent("SOL",1,"10",leverage,50,"100",null,null));
        assertThrows(IllegalArgumentException.class,()->intent(1,"110","95"));
        assertThrows(IllegalArgumentException.class,()->intent(2,"95","110"));
    }
}
