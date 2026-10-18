package com.jamddmaj.ai.wallet;

import java.math.BigInteger;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Arrays;
import org.junit.Test;
import static org.junit.Assert.*;

public class NativePerpsTokenLedgerTest {
    private static final String TOKEN="So11111111111111111111111111111111111111112";
    static byte[] fixture()throws Exception{return ByteBuffer.allocate(48).order(ByteOrder.LITTLE_ENDIAN)
        .put(Arrays.copyOf(MessageDigest.getInstance("SHA-256").digest("account:TokenLedger".getBytes(StandardCharsets.US_ASCII)),8))
        .put(DevnetSolana.decode(TOKEN,32)).putLong(123).array();}
    private static NativePerpsTokenLedger decode(byte[] data){return NativePerpsTokenLedger.decode(NativePerpsCustody.PROGRAM,false,data);}
    @Test public void bindsTokenAccountAndExactUnsignedSnapshot()throws Exception{
        NativePerpsTokenLedger value=decode(fixture());value.requireSnapshot(TOKEN,BigInteger.valueOf(123));
        assertThrows(IllegalArgumentException.class,()->value.requireSnapshot(TOKEN,BigInteger.valueOf(122)));
        assertThrows(IllegalArgumentException.class,()->value.requireSnapshot(NativePerpsFunding.USDC,BigInteger.valueOf(123)));
        byte[] maximum=fixture();Arrays.fill(maximum,40,48,(byte)255);
        assertEquals(new BigInteger("18446744073709551615"),decode(maximum).amount);
    }
    @Test public void rejectsWrongOwnerExecutableDiscriminatorAndEveryTruncation()throws Exception{
        byte[] data=fixture();assertThrows(IllegalArgumentException.class,()->NativePerpsTokenLedger.decode(NativePerpsFunding.SYSTEM,false,data));
        assertThrows(IllegalArgumentException.class,()->NativePerpsTokenLedger.decode(NativePerpsCustody.PROGRAM,true,data));
        for(int size=0;size<48;size++){byte[] shortData=Arrays.copyOf(data,size);assertThrows(IllegalArgumentException.class,()->decode(shortData));}
        assertThrows(IllegalArgumentException.class,()->decode(Arrays.copyOf(data,49)));
        data[0]^=1;assertThrows(IllegalArgumentException.class,()->decode(data));
    }
}
