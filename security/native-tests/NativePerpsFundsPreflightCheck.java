package com.jamddmaj.ai.wallet;

import java.io.IOException;
import java.math.BigInteger;

/** Pure synthetic public balance bytes. No network, signatures or funds. */
public final class NativePerpsFundsPreflightCheck {
    static final byte[] wallet=new byte[32],mint=new byte[32];
    static final BigInteger margin=BigInteger.valueOf(10000000);
    static {wallet[0]=7;mint[0]=8;}
    static byte[] token(long amount){byte[] data=new byte[165];System.arraycopy(mint,0,data,0,32);System.arraycopy(wallet,0,data,32,32);
        for(int i=0;i<8;i++)data[64+i]=(byte)(amount>>>(i*8));data[108]=1;return data;}
    static NativePerpsFundsPreflight.Account account(byte[] data)throws Exception{return new NativePerpsFundsPreflight.Account(SplTokenAccount.PROGRAM,false,BigInteger.valueOf(2039280),data);}
    static NativePerpsFundsPreflight.Account payer(long amount)throws Exception{return new NativePerpsFundsPreflight.Account("11111111111111111111111111111111",false,BigInteger.valueOf(amount),new byte[0]);}
    interface Attempt {void run()throws Exception;}
    static void rejected(Attempt attempt,String reason)throws Exception{
        try{attempt.run();throw new AssertionError("Accepted invalid balance");}
        catch(IOException failure){if(!reason.equals(failure.getMessage()))throw new AssertionError(failure);}
    }
    public static void main(String[] args)throws Exception{
        rejected(()->NativePerpsFundsPreflight.check(wallet,mint,margin,null,null),"PERPS_INSUFFICIENT_USDC");
        rejected(()->NativePerpsFundsPreflight.check(wallet,mint,margin,payer(100000000),account(token(5141387))),"PERPS_INSUFFICIENT_USDC");
        rejected(()->NativePerpsFundsPreflight.check(wallet,mint,margin,payer(0),account(token(10000000))),"PERPS_MISSING_SOL_FEES");
        // Passing early balance evidence still says nothing about exact fees.
        NativePerpsFundsPreflight.check(wallet,mint,margin,payer(1),account(token(10000000)));
        for(int fault=0;fault<7;fault++){
            byte[] bytes=token(10000000);
            if(fault==0)bytes[0]++;if(fault==1)bytes[32]++;if(fault==2)bytes[108]=2;
            if(fault==3){bytes[72]=1;bytes[76]=9;}if(fault==4)bytes[109]=1;
            if(fault==5){bytes[129]=1;bytes[133]=9;}if(fault==6)bytes[73]=1;
            rejected(()->NativePerpsFundsPreflight.check(wallet,mint,margin,payer(1000000),account(bytes)),"PERPS_BALANCE_UNVERIFIED");
        }
        rejected(()->NativePerpsFundsPreflight.check(wallet,mint,BigInteger.ONE,payer(1),account(token(10000000))),"PERPS_BALANCE_UNVERIFIED");
        rejected(()->NativePerpsFundsPreflight.check(wallet,mint,margin,new NativePerpsFundsPreflight.Account(SplTokenAccount.PROGRAM,false,BigInteger.ONE,new byte[0]),account(token(10000000))),"PERPS_BALANCE_UNVERIFIED");
        System.out.println("Native futures funding preflight checks passed; signingAuthorized=false");
    }
}
