package com.jamddmaj.ai.wallet;

import java.math.BigInteger;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.Arrays;
import org.junit.Test;
import static org.junit.Assert.*;

public class NativePerpsInstructionDataTest {
    static byte[] increase(boolean amount) {
        ByteBuffer b=ByteBuffer.allocate(amount?42:34).order(ByteOrder.LITTLE_ENDIAN);
        b.put(new byte[]{(byte)164,126,68,(byte)182,(byte)223,(byte)166,64,(byte)183});
        b.putLong(19900000).put((byte)(amount?1:0));if(amount)b.putLong(10000000);
        return b.put((byte)1).putLong(105000000).putLong(1792277047).array();
    }
    static byte[] decrease(Boolean entire) {
        ByteBuffer b=ByteBuffer.allocate(entire==null?49:50).order(ByteOrder.LITTLE_ENDIAN);
        b.put(new byte[]{(byte)162,(byte)191,(byte)200,62,(byte)139,62,(byte)176,17});
        b.putLong(0).putLong(0).putLong(95000000).put((byte)(entire==null?0:1));
        if(entire!=null)b.put((byte)(entire?1:0));
        return b.putLong(1792277047).putLong(-1).array();
    }
    static byte[] trigger(boolean above) {
        return ByteBuffer.allocate(50).order(ByteOrder.LITTLE_ENDIAN)
            .put(new byte[]{117,98,66,127,30,50,73,(byte)185})
            .putLong(0).putLong(0).putLong(110000000).put((byte)(above?1:0)).put((byte)1)
            .putLong(4).putLong(1792277047).array();
    }
    @Test public void decodesExactIncreaseAndOptionalLedgerAmount() {
        NativePerpsInstructionData data=NativePerpsInstructionData.parse(increase(true));
        assertEquals(NativePerpsInstructionData.Kind.INCREASE,data.kind);
        assertEquals(BigInteger.valueOf(19900000),data.sizeUsd);
        assertEquals(BigInteger.valueOf(10000000),data.collateral);
        assertEquals(1,data.side);assertEquals(1792277047L,data.requestTime);
        assertNull(NativePerpsInstructionData.parse(increase(false)).collateral);
        byte[] shortOrder=increase(true);shortOrder[25]=2;
        assertEquals(2,NativePerpsInstructionData.parse(shortOrder).side);
    }
    @Test public void decodesCloseAndTriggerWithoutConfusingThemWithOpening() {
        for(Boolean entire:new Boolean[]{null,false,true}) {
            NativePerpsInstructionData data=NativePerpsInstructionData.parse(decrease(entire));
            assertEquals(NativePerpsInstructionData.Kind.DECREASE,data.kind);assertEquals(entire,data.entirePosition);
            assertEquals(new BigInteger("18446744073709551615"),data.counter);
        }
        for(boolean above:new boolean[]{false,true}) {
            NativePerpsInstructionData data=NativePerpsInstructionData.parse(trigger(above));
            assertEquals(NativePerpsInstructionData.Kind.TPSL,data.kind);
            assertEquals(Boolean.valueOf(above),data.triggerAbove);assertEquals(Boolean.TRUE,data.entirePosition);
        }
    }
    @Test public void rejectsEveryTruncationTrailingDataAndUnknownInstruction() {
        for(byte[] valid:new byte[][]{increase(true),increase(false),decrease(null),decrease(true),trigger(true)}) {
            for(int length=0;length<valid.length;length++) {
                byte[] shortData=Arrays.copyOf(valid,length);
                assertThrows(IllegalArgumentException.class,()->NativePerpsInstructionData.parse(shortData));
            }
            assertThrows(IllegalArgumentException.class,()->NativePerpsInstructionData.parse(Arrays.copyOf(valid,valid.length+1)));
            valid[0]^=1;
            assertThrows(IllegalArgumentException.class,()->NativePerpsInstructionData.parse(valid));
        }
        assertThrows(IllegalArgumentException.class,()->NativePerpsInstructionData.parse(null));
    }
    @Test public void rejectsInvalidOptionsEnumsZeroPricesAndNegativeTimes() {
        for(int offset:new int[]{16,25})for(int value:new int[]{3,255}) {
            byte[] bad=increase(true);bad[offset]=(byte)value;
            assertThrows(IllegalArgumentException.class,()->NativePerpsInstructionData.parse(bad));
        }
        for(int offset:new int[]{32,33}) {
            byte[] bad=trigger(true);bad[offset]=2;
            assertThrows(IllegalArgumentException.class,()->NativePerpsInstructionData.parse(bad));
        }
        byte[] zeroPrice=increase(true);Arrays.fill(zeroPrice,26,34,(byte)0);
        assertThrows(IllegalArgumentException.class,()->NativePerpsInstructionData.parse(zeroPrice));
        byte[] negative=increase(true);negative[41]=(byte)128;
        assertThrows(IllegalArgumentException.class,()->NativePerpsInstructionData.parse(negative));
    }
}
