package com.jamddmaj.ai.wallet;

import java.math.BigInteger;
import java.util.Arrays;

/** Exact mainnet IDL decoding for setTokenLedger and instantIncreasePositionPreSwap.
 * Data/amount checks only: accounts, ordering, ledger state and simulation are
 * independent requirements. No signing authorization is produced. */
final class NativePerpsPreSwapData {
    enum Kind { SET_LEDGER, PRE_SWAP }
    private static final byte[] LEDGER={(byte)228,85,(byte)185,112,78,79,77,2};
    private static final byte[] SWAP={(byte)197,38,86,(byte)165,(byte)199,23,38,(byte)234};
    final Kind kind;
    final BigInteger amountIn,minimumOut;
    private NativePerpsPreSwapData(Kind kind,BigInteger amountIn,BigInteger minimumOut){
        this.kind=kind;this.amountIn=amountIn;this.minimumOut=minimumOut;
    }
    static NativePerpsPreSwapData parse(byte[] data){
        if(data==null||data.length<8)throw invalid();
        byte[] discriminator=Arrays.copyOf(data,8);
        if(Arrays.equals(discriminator,LEDGER)){
            if(data.length!=8)throw invalid();
            return new NativePerpsPreSwapData(Kind.SET_LEDGER,null,null);
        }
        if(!Arrays.equals(discriminator,SWAP)||data.length!=24)throw invalid();
        BigInteger input=u64(data,8),output=u64(data,16);
        if(input.signum()<=0||output.signum()<=0)throw invalid();
        return new NativePerpsPreSwapData(Kind.PRE_SWAP,input,output);
    }
    void requireAmounts(BigInteger expectedInput,BigInteger nativeMinimumOutput){
        if(kind!=Kind.PRE_SWAP||expectedInput==null||nativeMinimumOutput==null||expectedInput.signum()<=0
                ||nativeMinimumOutput.signum()<=0||expectedInput.bitLength()>64||nativeMinimumOutput.bitLength()>64
                ||!amountIn.equals(expectedInput)||minimumOut.compareTo(nativeMinimumOutput)<0)throw invalid();
    }
    private static BigInteger u64(byte[] data,int offset){
        byte[] big=new byte[8];for(int i=0;i<8;i++)big[7-i]=data[offset+i];return new BigInteger(1,big);
    }
    private static IllegalArgumentException invalid(){return new IllegalArgumentException("Invalid perps pre-swap data or funding limits");}
}
