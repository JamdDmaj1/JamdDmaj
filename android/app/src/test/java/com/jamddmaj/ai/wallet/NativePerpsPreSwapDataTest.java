package com.jamddmaj.ai.wallet;

import java.math.BigInteger;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.Arrays;
import org.junit.Test;
import static org.junit.Assert.*;

public class NativePerpsPreSwapDataTest {
    static byte[] ledger(){return new byte[]{(byte)228,85,(byte)185,112,78,79,77,2};}
    static byte[] swap(long input,long minimum){return ByteBuffer.allocate(24).order(ByteOrder.LITTLE_ENDIAN)
        .put(new byte[]{(byte)197,38,86,(byte)165,(byte)199,23,38,(byte)234}).putLong(input).putLong(minimum).array();}
    @Test public void decodesExactMainnetLayoutsAndUnsignedAmounts(){
        assertEquals(NativePerpsPreSwapData.Kind.SET_LEDGER,NativePerpsPreSwapData.parse(ledger()).kind);
        NativePerpsPreSwapData value=NativePerpsPreSwapData.parse(swap(10000000,95000000));
        assertEquals(NativePerpsPreSwapData.Kind.PRE_SWAP,value.kind);
        assertEquals(BigInteger.valueOf(10000000),value.amountIn);
        assertEquals(BigInteger.valueOf(95000000),value.minimumOut);
        assertEquals(new BigInteger("18446744073709551615"),NativePerpsPreSwapData.parse(swap(-1,-1)).amountIn);
    }
    @Test public void rejectsUnknownZeroTruncatedAndTrailingData(){
        assertThrows(IllegalArgumentException.class,()->NativePerpsPreSwapData.parse(null));
        for(byte[] valid:new byte[][]{ledger(),swap(10000000,95000000)}){
            for(int length=0;length<valid.length;length++){
                byte[] truncated=Arrays.copyOf(valid,length);
                assertThrows(IllegalArgumentException.class,()->NativePerpsPreSwapData.parse(truncated));
            }
            assertThrows(IllegalArgumentException.class,()->NativePerpsPreSwapData.parse(Arrays.copyOf(valid,valid.length+1)));
            valid[0]^=1;assertThrows(IllegalArgumentException.class,()->NativePerpsPreSwapData.parse(valid));
        }
        assertThrows(IllegalArgumentException.class,()->NativePerpsPreSwapData.parse(swap(0,1)));
        assertThrows(IllegalArgumentException.class,()->NativePerpsPreSwapData.parse(swap(1,0)));
    }
    @Test public void bindsExactInputAndNativeOutputFloor(){
        NativePerpsPreSwapData value=NativePerpsPreSwapData.parse(swap(10000000,95000000));
        value.requireAmounts(BigInteger.valueOf(10000000),BigInteger.valueOf(95000000));
        value.requireAmounts(BigInteger.valueOf(10000000),BigInteger.valueOf(94999999));
        assertThrows(IllegalArgumentException.class,()->value.requireAmounts(BigInteger.valueOf(9999999),BigInteger.ONE));
        assertThrows(IllegalArgumentException.class,()->value.requireAmounts(BigInteger.valueOf(10000000),BigInteger.valueOf(95000001)));
        assertThrows(IllegalArgumentException.class,()->value.requireAmounts(BigInteger.valueOf(10000000),BigInteger.ZERO));
        assertThrows(IllegalArgumentException.class,()->NativePerpsPreSwapData.parse(ledger()).requireAmounts(BigInteger.ONE,BigInteger.ONE));
    }
}
