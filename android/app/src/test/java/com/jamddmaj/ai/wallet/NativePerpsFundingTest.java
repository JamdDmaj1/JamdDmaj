package com.jamddmaj.ai.wallet;

import java.math.BigInteger;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.HashMap;
import java.util.Map;
import org.junit.Test;
import static org.junit.Assert.*;

public class NativePerpsFundingTest {
    private static final String PAYER="4vJ9JU1bJJE96FWSJKvHsmmFADCg4gpZQff4P3bkLKi";
    private static final String SOURCE=NativePerpsFunding.USDC, OTHER=NativePerpsFunding.SOL;
    private static BigInteger n(long value){return BigInteger.valueOf(value);}
    private static NativePerpsFunding.State system(long lamports){return new NativePerpsFunding.State(NativePerpsFunding.SYSTEM,false,n(lamports),new byte[0]);}
    private static byte[] tokenBytes(long amount){
        byte[] bytes=new byte[165];System.arraycopy(DevnetSolana.decode(SOURCE,32),0,bytes,0,32);
        System.arraycopy(DevnetSolana.decode(PAYER,32),0,bytes,32,32);
        ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN).putLong(64,amount);bytes[108]=1;return bytes;
    }
    private static NativePerpsFunding.State token(long amount){return new NativePerpsFunding.State(SplTokenAccount.PROGRAM,false,n(2039280),tokenBytes(amount));}
    private static Map<String,NativePerpsFunding.State> state(long sol,long usdc){
        Map<String,NativePerpsFunding.State> result=new HashMap<>();result.put(PAYER,system(sol));result.put(SOURCE,token(usdc));return result;
    }
    private static NativePerpsFunding inspect(Map<String,NativePerpsFunding.State> before,Map<String,NativePerpsFunding.State> after){
        return NativePerpsFunding.inspect(PAYER,SOURCE,n(10000000),n(15000),before,after,new HashMap<>(),new HashMap<>());
    }
    @Test public void acceptsOnlyExactMarginAndNetworkFee(){
        NativePerpsFunding facts=inspect(state(100000000,20000000),state(99985000,10000000));
        assertEquals(n(10000000),facts.usdcDebit);assertEquals(n(15000),facts.networkFee);assertEquals(n(0),facts.rentLocked);
        for(long amount:new long[]{9999999,10000001})assertThrows(IllegalArgumentException.class,()->inspect(state(100000000,20000000),state(99985000,amount)));
        assertThrows(IllegalArgumentException.class,()->inspect(state(100000000,20000000),state(99984000,10000000)));
    }
    @Test public void rejectsOtherTokenAndAuthorityChanges(){
        Map<String,NativePerpsFunding.State> before=state(100000000,20000000),after=state(99985000,10000000);
        before.put(OTHER,token(20));after.put(OTHER,token(19));
        assertThrows(IllegalArgumentException.class,()->inspect(before,after));
        after.put(OTHER,token(20));byte[] delegated=tokenBytes(10000000);delegated[72]=1;
        after.put(SOURCE,new NativePerpsFunding.State(SplTokenAccount.PROGRAM,false,n(2039280),delegated));
        assertThrows(IllegalArgumentException.class,()->inspect(before,after));
    }
    @Test public void accountsForExactNewRentAndRejectsHiddenSolDebit(){
        Map<String,NativePerpsFunding.State> before=state(100000000,20000000),after=state(97985000,10000000);
        before.put(OTHER,null);after.put(OTHER,new NativePerpsFunding.State(NativePerpsCustody.PROGRAM,false,n(2000000),new byte[210]));
        Map<String,NativePerpsFunding.Rent> rents=new HashMap<>();rents.put(OTHER,new NativePerpsFunding.Rent(NativePerpsCustody.PROGRAM,n(2000000),null,null));
        assertEquals(n(2000000),NativePerpsFunding.inspect(PAYER,SOURCE,n(10000000),n(15000),before,after,rents,new HashMap<>()).rentLocked);
        after.put(PAYER,system(97984000));
        assertThrows(IllegalArgumentException.class,()->NativePerpsFunding.inspect(PAYER,SOURCE,n(10000000),n(15000),before,after,rents,new HashMap<>()));
    }
    @Test public void allowsSourceClosureOnlyWhenEntireExactMarginWasSpent(){
        Map<String,NativePerpsFunding.State> after=state(102024280,0);after.put(SOURCE,null);
        assertEquals(n(2039280),inspect(state(100000000,10000000),after).rentRefunded);
        assertThrows(IllegalArgumentException.class,()->inspect(state(100000000,10000001),after));
    }
}
