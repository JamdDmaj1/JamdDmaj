package com.jamddmaj.ai.wallet;

import java.math.BigDecimal;
import java.math.BigInteger;

/** Converts human token amounts exactly; never rounds up or down. */
final class NativeSwapAmounts {
    static String units(String text,int decimals) {
        if(text==null || text.length()>300 || decimals<0 || decimals>255
                || !text.matches("(?:0|[1-9][0-9]*)(?:[.,][0-9]+)?")) throw new IllegalArgumentException("Invalid token amount");
        BigInteger result;
        try { result=new BigDecimal(text.replace(',','.')).movePointRight(decimals).toBigIntegerExact(); }
        catch(ArithmeticException invalid) { throw new IllegalArgumentException("Token amount has too many decimals",invalid); }
        if(result.signum()<=0 || result.bitLength()>64) throw new IllegalArgumentException("Token amount outside supported range");
        return result.toString();
    }
}
