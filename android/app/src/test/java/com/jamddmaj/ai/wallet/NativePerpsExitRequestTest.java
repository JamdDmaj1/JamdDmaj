package com.jamddmaj.ai.wallet;

import java.math.BigInteger;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.Arrays;
import org.junit.Test;
import static org.junit.Assert.*;

public class NativePerpsExitRequestTest {
    private static final String PAYER="4vJ9JU1bJJE96FWSJKvHsmmFADCg4gpZQff4P3bkLKi";
    private static final BigInteger COUNTER=BigInteger.valueOf(4);
    private static SolanaProgramAddress.Derived address(int side){return NativePerpsAddresses.exitDerivation(NativePerpsAddresses.position(PAYER,"SOL",side),COUNTER);}
    private static NativePerpsInstructionData instruction(){
        byte[] bytes=NativePerpsInstructionDataTest.trigger(true);bytes[33]=0;
        ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN).putLong(16,20000000);
        return NativePerpsInstructionData.parse(bytes);
    }
    private static byte[] fixture(int side){
        ByteBuffer b=ByteBuffer.allocate(230).order(ByteOrder.LITTLE_ENDIAN);
        b.put(new byte[]{12,38,(byte)250,(byte)199,46,(byte)154,32,(byte)216});
        for(String key:new String[]{PAYER,NativePerpsCustody.POOL,NativePerpsCustody.address("SOL"),DevnetSolana.encode(NativePerpsAddresses.position(PAYER,"SOL",side)),NativePerpsFunding.USDC})b.put(DevnetSolana.decode(key,32));
        b.putLong(1792277047).putLong(1792277047).putLong(20000000).putLong(0).put((byte)2).put((byte)1).put((byte)side);
        b.put(new byte[3]).put((byte)1).putLong(110000000).put((byte)1).put((byte)1).put((byte)1).put((byte)0).put((byte)0);
        b.putLong(4).put((byte)address(side).bump).put((byte)0);assertEquals(230,b.position());return b.array();
    }
    private static NativePerpsExitRequest check(byte[] data,int side){return NativePerpsExitRequest.check(address(side).address(),NativePerpsCustody.PROGRAM,false,data,PAYER,"SOL",side,instruction());}
    @Test public void acceptsExactPendingLongAndShortRequestsWithZeroPadding(){
        for(int side:new int[]{1,2}){NativePerpsExitRequest value=check(fixture(side),side);assertEquals(BigInteger.valueOf(110000000),value.triggerPrice);assertTrue(value.triggerAbove);check(Arrays.copyOf(fixture(side),320),side);}
    }
    @Test public void rejectsAlteredIdentitySizingTriggerStatusCounterAndBump(){
        for(int offset:new int[]{0,8,40,72,104,136,184,192,200,201,202,203,204,205,206,207,215,216,217,218,219,220,228,229}){
            byte[] data=fixture(1);data[offset]^=1;assertThrows("offset "+offset,IllegalArgumentException.class,()->check(data,1));
        }
    }
    @Test public void rejectsTruncationUnknownExtensionAndWrongProgram(){
        for(int size=0;size<230;size++){byte[] data=Arrays.copyOf(fixture(1),size);assertThrows(IllegalArgumentException.class,()->check(data,1));}
        byte[] extra=Arrays.copyOf(fixture(1),231);extra[230]=1;assertThrows(IllegalArgumentException.class,()->check(extra,1));
        assertThrows(IllegalArgumentException.class,()->NativePerpsExitRequest.check(address(1).address(),NativePerpsFunding.SYSTEM,false,fixture(1),PAYER,"SOL",1,instruction()));
    }
}
