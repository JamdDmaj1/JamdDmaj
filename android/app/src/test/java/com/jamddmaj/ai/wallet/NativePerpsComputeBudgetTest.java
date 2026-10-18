package com.jamddmaj.ai.wallet;

import java.io.ByteArrayOutputStream;
import java.math.BigInteger;
import org.junit.Test;
import static org.junit.Assert.*;

public class NativePerpsComputeBudgetTest {
    private static byte[] value(int kind,long number,int count){
        byte[] data=new byte[count+1];data[0]=(byte)kind;
        for(int i=0;i<count;i++)data[i+1]=(byte)(number >>> (i*8));
        return data;
    }
    private static SolanaMessage message(byte[]... instructions){return message(false,instructions);}
    private static SolanaMessage message(boolean accounts,byte[]... instructions){
        ByteArrayOutputStream out=new ByteArrayOutputStream();
        out.writeBytes(new byte[]{1,0,2,3});
        byte[] payer=new byte[32];payer[0]=1;out.writeBytes(payer);
        out.writeBytes(DevnetSolana.decode("ComputeBudget111111111111111111111111111111",32));
        out.writeBytes(new byte[32]); // system program, readonly
        out.writeBytes(new byte[32]); // blockhash
        out.write(instructions.length);
        for(byte[] data:instructions){
            out.write(data.length==0?2:1);
            out.write(accounts?1:0);if(accounts)out.write(0);
            out.write(data.length);out.writeBytes(data);
        }
        return SolanaMessage.parse(out.toByteArray());
    }
    @Test public void boundsExactFeeWithCeilingAndUnsignedArithmetic(){
        assertEquals(BigInteger.valueOf(2000),NativePerpsComputeBudget.check(message(value(2,200000,4),value(3,10000,8),new byte[0])));
        assertEquals(BigInteger.ONE,NativePerpsComputeBudget.check(message(value(3,1,8),value(2,1,4),new byte[0])));
        assertEquals(BigInteger.ZERO,NativePerpsComputeBudget.check(message(value(2,1400000,4),value(3,0,8),new byte[0])));
    }
    @Test public void rejectsMissingDuplicateLateAndUnsupportedBudgetInstructions(){
        byte[] units=value(2,200000,4),price=value(3,10000,8),body=new byte[0];
        for(byte[][] data:new byte[][][]{ {units,body},{price,body},{units,price,units,body},
                {units,price,price,body},{body,units,price},{units,price,value(1,1,4),body},
                {units,price},{value(2,0,4),price,body},{value(2,1400001,4),price,body} }){
            assertThrows(IllegalArgumentException.class,()->NativePerpsComputeBudget.check(message(data)));
        }
        assertThrows(IllegalArgumentException.class,()->NativePerpsComputeBudget.check(message(true,units,price,body)));
    }
    @Test public void rejectsExcessiveFeesIncludingUnsignedOverflowInputs(){
        assertThrows(IllegalArgumentException.class,()->NativePerpsComputeBudget.check(message(value(2,1400000,4),value(3,1000000,8),new byte[0])));
        assertThrows(IllegalArgumentException.class,()->NativePerpsComputeBudget.check(message(value(2,1400000,4),value(3,-1,8),new byte[0])));
    }
}
