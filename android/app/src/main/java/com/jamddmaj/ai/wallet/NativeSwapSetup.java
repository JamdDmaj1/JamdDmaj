package com.jamddmaj.ai.wallet;

import java.math.BigInteger;
import java.util.Arrays;

/** Validates top-level funding/setup/cleanup. Chain account state and route CPI checks remain separate. */
final class NativeSwapSetup {
    static final String COMPUTE="ComputeBudget111111111111111111111111111111";
    static final String ASSOCIATED="ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
    static final String SYSTEM="11111111111111111111111111111111";
    static final String SOL="So11111111111111111111111111111111111111112";
    interface Deriver { String associated(String owner,String mint,String program); }
    final boolean createsSource, createsDestination;
    final BigInteger wrappedSol, priorityFeeBound;
    private NativeSwapSetup(boolean source,boolean destination,BigInteger wrapped,BigInteger priority) {
        createsSource=source; createsDestination=destination; wrappedSol=wrapped; priorityFeeBound=priority;
    }
    static NativeSwapSetup inspect(SolanaMessage message,SolanaLookupTables.Resolved keys,NativeJupiterRoute route,
            NativeSwapPreparation preparation,Deriver deriver) {
        NativeSwapPreparation.Intent intent=preparation.intent;
        if (!route.source.equals(deriver.associated(intent.payer,intent.inputMint,route.sourceTokenProgram))
                || !route.destination.equals(deriver.associated(intent.payer,intent.outputMint,route.destinationTokenProgram))) throw invalid();
        boolean inputSol=SOL.equals(intent.inputMint), outputSol=SOL.equals(intent.outputMint);
        if ((inputSol && !NativeJupiterRoute.TOKEN.equals(route.sourceTokenProgram))
                || (outputSol && !NativeJupiterRoute.TOKEN.equals(route.destinationTokenProgram))) throw invalid();
        boolean sourceCreated=false,destinationCreated=false,transfer=false,sync=false,close=false,limitSeen=false,priceSeen=false;
        BigInteger wrapped=BigInteger.ZERO, price=BigInteger.ZERO; int limit=1400000;
        for(int i=0;i<message.instructions.size();i++) {
            if(i==route.instructionIndex) continue;
            SolanaMessage.Instruction instruction=message.instructions.get(i);
            String program=key(keys,instruction.program); byte[] data=instruction.data(), accounts=instruction.accounts();
            if(COMPUTE.equals(program)) {
                if(i>route.instructionIndex || accounts.length!=0 || data.length==0) throw invalid();
                if(data[0]==2 && data.length==5 && !limitSeen) {
                    BigInteger requested=uint(data,1,4);
                    if(requested.signum()<=0 || requested.compareTo(BigInteger.valueOf(1400000))>0) throw invalid();
                    limit=requested.intValue(); limitSeen=true;
                } else if(data[0]==3 && data.length==9 && !priceSeen) {
                    price=uint(data,1,8); priceSeen=true;
                } else throw invalid();
            } else if(ASSOCIATED.equals(program)) {
                if(i>route.instructionIndex || !(data.length==0 || (data.length==1 && (data[0]==0 || data[0]==1)))
                        || (accounts.length!=6 && accounts.length!=7)) throw invalid();
                same(keys,accounts,0,intent.payer); same(keys,accounts,2,intent.payer); same(keys,accounts,4,SYSTEM);
                if(!message.isWritable(accounts[1]&255)) throw invalid();
                String account=key(keys,accounts[1]&255);
                if(route.source.equals(account) && !sourceCreated) {
                    same(keys,accounts,3,intent.inputMint); same(keys,accounts,5,route.sourceTokenProgram); sourceCreated=true;
                } else if(route.destination.equals(account) && !destinationCreated) {
                    same(keys,accounts,3,intent.outputMint); same(keys,accounts,5,route.destinationTokenProgram); destinationCreated=true;
                } else throw invalid();
                if(accounts.length==7) same(keys,accounts,6,"SysvarRent111111111111111111111111111111111");
            } else if(SYSTEM.equals(program)) {
                if(i>route.instructionIndex || !inputSol || transfer || accounts.length!=2 || data.length!=12
                        || !Arrays.equals(Arrays.copyOf(data,4),new byte[]{2,0,0,0})) throw invalid();
                same(keys,accounts,0,intent.payer); same(keys,accounts,1,route.source);
                wrapped=uint(data,4,8);
                if(!wrapped.equals(new BigInteger(intent.amount))) throw invalid();
                transfer=true;
            } else if(NativeJupiterRoute.TOKEN.equals(program)) {
                if(data.length!=1) throw invalid();
                if(data[0]==17 && i<route.instructionIndex && inputSol && transfer && !sync && accounts.length==1) {
                    same(keys,accounts,0,route.source); sync=true;
                } else if(data[0]==9 && i>route.instructionIndex && (inputSol || outputSol) && !close && accounts.length==3) {
                    same(keys,accounts,0,inputSol?route.source:route.destination);
                    same(keys,accounts,1,intent.payer); same(keys,accounts,2,intent.payer); close=true;
                } else throw invalid();
            } else throw invalid();
        }
        if(!limitSeen || (inputSol && (!transfer || !sync)) || ((inputSol || outputSol) && !close)) throw invalid();
        BigInteger fee=price.multiply(BigInteger.valueOf(limit)).add(BigInteger.valueOf(999999)).divide(BigInteger.valueOf(1000000));
        if(fee.compareTo(BigInteger.valueOf(1000000))>0) throw invalid();
        return new NativeSwapSetup(sourceCreated,destinationCreated,wrapped,fee);
    }
    private static String key(SolanaLookupTables.Resolved keys,int index) { return DevnetSolana.encode(keys.key(index)); }
    private static void same(SolanaLookupTables.Resolved keys,byte[] accounts,int index,String expected) {
        if(!expected.equals(key(keys,accounts[index]&255))) throw invalid();
    }
    private static BigInteger uint(byte[] data,int offset,int size) {
        byte[] reversed=new byte[size]; for(int i=0;i<size;i++) reversed[size-1-i]=data[offset+i]; return new BigInteger(1,reversed);
    }
    private static IllegalArgumentException invalid() { return new IllegalArgumentException("Unexpected swap setup or funding instruction"); }
}
