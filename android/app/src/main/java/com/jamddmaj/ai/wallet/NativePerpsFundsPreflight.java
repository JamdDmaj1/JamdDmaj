package com.jamddmaj.ai.wallet;

import java.io.IOException;
import java.math.BigInteger;
import java.util.Arrays;

/** Early balance rejection only. Passing is NOT fee coverage or signing approval. */
final class NativePerpsFundsPreflight {
    static final class Account {
        final String owner;final boolean executable;final BigInteger lamports;final byte[] data;
        Account(String owner,boolean executable,BigInteger lamports,byte[] data)throws IOException{
            if(owner==null||lamports==null||lamports.signum()<0||lamports.bitLength()>64||data==null||data.length>165)throw unavailable();
            this.owner=owner;this.executable=executable;this.lamports=lamports;this.data=data.clone();
        }
    }
    static final class Failure extends IOException {
        final String reason;final BigInteger availableUsdc,requiredUsdc;
        private Failure(String reason,BigInteger available,BigInteger required){super(reason);this.reason=reason;availableUsdc=available;requiredUsdc=required;}
    }
    static void check(byte[] wallet,byte[] mint,BigInteger required,Account payer,Account funding)throws IOException{
        if(wallet==null||wallet.length!=32||mint==null||mint.length!=32||required==null||required.compareTo(BigInteger.valueOf(10000000))<0||required.bitLength()>64)throw unavailable();
        BigInteger sol=BigInteger.ZERO,usdc=BigInteger.ZERO;
        if(payer!=null){
            if(!"11111111111111111111111111111111".equals(payer.owner)||payer.executable||payer.data.length!=0)throw unavailable();
            sol=payer.lamports;
        }
        if(funding!=null){
            final SplTokenAccount token;
            try{token=SplTokenAccount.decode(funding.owner,funding.executable,funding.data);}catch(RuntimeException invalid){throw unavailable();}
            byte[] close=token.closeAuthority();
            if(!Arrays.equals(token.owner(),wallet)||!Arrays.equals(token.mint(),mint)||token.frozen||token.hasDelegate()||token.nativeReserve!=null
                ||close!=null&&!Arrays.equals(close,wallet))throw unavailable();
            usdc=token.amount;
        }
        if(usdc.compareTo(required)<0)throw new Failure("PERPS_INSUFFICIENT_USDC",usdc,required);
        if(sol.signum()==0)throw new Failure("PERPS_MISSING_SOL_FEES",usdc,required);
    }
    private static IOException unavailable(){return new IOException("PERPS_BALANCE_UNVERIFIED");}
    private NativePerpsFundsPreflight(){}
}
