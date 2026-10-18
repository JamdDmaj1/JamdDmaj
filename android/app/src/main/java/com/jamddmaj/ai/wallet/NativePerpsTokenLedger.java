package com.jamddmaj.ai.wallet;

import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Arrays;

/** Current Anchor TokenLedger account; decoding alone is not authorization. */
final class NativePerpsTokenLedger {
    final String tokenAccount;
    final BigInteger amount;
    private NativePerpsTokenLedger(byte[] data){
        tokenAccount=DevnetSolana.encode(Arrays.copyOfRange(data,8,40));
        byte[] big=new byte[8];for(int i=0;i<8;i++)big[7-i]=data[40+i];amount=new BigInteger(1,big);
    }
    static NativePerpsTokenLedger decode(String owner,boolean executable,byte[] data){
        if(!NativePerpsCustody.PROGRAM.equals(owner)||executable||data==null||data.length!=48)throw invalid();
        try{
            byte[] discriminator=Arrays.copyOf(MessageDigest.getInstance("SHA-256").digest("account:TokenLedger".getBytes(StandardCharsets.US_ASCII)),8);
            if(!Arrays.equals(discriminator,Arrays.copyOf(data,8)))throw invalid();
        }catch(java.security.NoSuchAlgorithmException impossible){throw new IllegalStateException(impossible);}
        return new NativePerpsTokenLedger(data.clone());
    }
    void requireSnapshot(String expectedTokenAccount,BigInteger expectedAmount){
        if(expectedAmount==null||expectedAmount.signum()<0||!tokenAccount.equals(expectedTokenAccount)||!amount.equals(expectedAmount))throw invalid();
    }
    private static IllegalArgumentException invalid(){return new IllegalArgumentException("Invalid or mismatched perps token ledger");}
}
