package com.jamddmaj.ai.wallet;

import java.math.BigInteger;

/** Bounds the requested priority fee before RPC work. Not signing approval:
 * instruction identities, funding, simulation and signer policy remain required. */
final class NativePerpsComputeBudget {
    private static final String PROGRAM="ComputeBudget111111111111111111111111111111";
    private static final BigInteger MILLION=BigInteger.valueOf(1000000);
    private NativePerpsComputeBudget() {}

    static BigInteger check(SolanaMessage message) {
        if(message==null)throw invalid();
        Long units=null;
        BigInteger price=null;
        boolean body=false;
        for(SolanaMessage.Instruction instruction:message.instructions){
            if(!PROGRAM.equals(DevnetSolana.encode(message.staticKey(instruction.program)))){
                body=true;continue;
            }
            if(body||message.isWritable(instruction.program)||message.isSigner(instruction.program)
                    ||instruction.accounts().length!=0)throw invalid();
            byte[] data=instruction.data();
            if(data.length==5&&data[0]==2&&units==null){
                units=unsigned(data,1,4).longValueExact();
                if(units<1||units>1400000)throw invalid();
            }else if(data.length==9&&data[0]==3&&price==null){
                price=unsigned(data,1,8);
            }else throw invalid();
        }
        // Require explicit limits, so no default-budget assumptions can affect fees.
        if(units==null||price==null||!body)throw invalid();
        BigInteger fee=price.multiply(BigInteger.valueOf(units)).add(MILLION.subtract(BigInteger.ONE)).divide(MILLION);
        if(fee.compareTo(MILLION)>0)throw invalid();
        return fee;
    }
    private static BigInteger unsigned(byte[] bytes,int offset,int count){
        byte[] bigEndian=new byte[count];
        for(int i=0;i<count;i++)bigEndian[count-i-1]=bytes[offset+i];
        return new BigInteger(1,bigEndian);
    }
    private static IllegalArgumentException invalid(){return new IllegalArgumentException("Invalid or excessive perps compute budget");}
}
