package com.jamddmaj.ai.wallet;

import java.math.BigInteger;
import java.util.Arrays;

/** Native USDC-funded opening plan, not signing approval. Other instructions,
 * ledger chain ownership/state and simulated funding still require validation. */
final class NativePerpsPreSwapPlan {
    static final class LedgerRequirement {
        final String address,tokenAccount;
        private LedgerRequirement(byte[] ledger,byte[] token){address=DevnetSolana.encode(ledger);tokenAccount=DevnetSolana.encode(token);}
    }
    private NativePerpsPreSwapPlan() {}
    static LedgerRequirement inspect(SolanaMessage message,SolanaLookupTables.Resolved keys,NativePerpsOrderIntent intent,
            NativePerpsCustody usdc,NativePerpsCustody collateral){
        if(message==null||keys==null||intent==null||usdc==null||collateral==null||keys.size()!=message.accountCount
                ||!"USDC".equals(usdc.asset)||!collateral.asset.equals(intent.side==1?intent.asset:"USDC"))throw invalid();
        for(int i=0;i<message.staticAccountCount();i++)same(keys.key(i),message.staticKey(i));
        byte[][] ledger=null,swap=null,opening=null;
        NativePerpsPreSwapData swapData=null;NativePerpsInstructionData openingData=null;
        for(SolanaMessage.Instruction instruction:message.instructions){
            if(!NativePerpsCustody.PROGRAM.equals(DevnetSolana.encode(message.staticKey(instruction.program))))continue;
            byte[] data=instruction.data();
            if(NativePerpsPreSwapData.recognizes(data)){
                if(opening!=null)throw invalid();
                NativePerpsPreSwapData auxiliary=NativePerpsPreSwapData.parse(data);
                if(auxiliary.kind==NativePerpsPreSwapData.Kind.SET_LEDGER){
                    if(ledger!=null||swap!=null)throw invalid();
                    ledger=roles(instruction,keys,3);
                    requireMeta(message,instruction,0,true,false);
                }else{
                    if(ledger==null||swap!=null)throw invalid();
                    swap=roles(instruction,keys,16);swapData=auxiliary;
                    if((instruction.accounts()[0]&255)!=0)throw invalid();
                    for(int role:new int[]{1,2,5,6,8,9,11})requireMeta(message,instruction,role,true,false);
                    for(int role:new int[]{3,4,12,13,14,15})requireMeta(message,instruction,role,false,false);
                    for(int role:new int[]{7,10})if(message.isSigner(instruction.accounts()[role]&255))throw invalid();
                }
            }else{
                NativePerpsInstructionData order=NativePerpsInstructionData.parse(data);
                if(order.kind==NativePerpsInstructionData.Kind.INCREASE){
                    if(opening!=null)throw invalid();opening=roles(instruction,keys,20);openingData=order;
                    if((instruction.accounts()[2]&255)!=0)throw invalid();
                }else if(order.kind!=NativePerpsInstructionData.Kind.TPSL||opening==null)throw invalid();
            }
        }
        if(opening==null||openingData.side!=intent.side)throw invalid();
        same(opening[15],DevnetSolana.decode(NativePerpsCustody.PROGRAM,32)); // No unreviewed referral.
        if(intent.side==2){
            if(ledger!=null||swap!=null||openingData.collateral==null||!openingData.collateral.equals(intent.marginUsd))throw invalid();
            same(opening[14],DevnetSolana.decode(NativePerpsCustody.PROGRAM,32));
            same(opening[3],NativePerpsTokenBoundary.associated(keys.key(0),usdc.mint));
            return null;
        }
        if(ledger==null||swap==null||openingData.collateral!=null)throw invalid();
        NativePerpsPreSwapBindings.check(swap,ledger,opening,usdc,collateral);
        swapData.requireAmounts(intent.marginUsd,minimumOutput(intent,collateral.decimals));
        return new LedgerRequirement(ledger[0],ledger[1]);
    }
    static BigInteger minimumOutput(NativePerpsOrderIntent intent,int decimals){
        if(intent==null||decimals<0||decimals>18)throw invalid();
        BigInteger numerator=intent.marginUsd.multiply(BigInteger.TEN.pow(decimals)).multiply(BigInteger.valueOf(10000-intent.maxSlippageBps));
        BigInteger denominator=intent.referencePrice.multiply(BigInteger.valueOf(10000));
        BigInteger floor=numerator.add(denominator.subtract(BigInteger.ONE)).divide(denominator);
        if(floor.signum()<=0||floor.bitLength()>64)throw invalid();return floor;
    }
    private static byte[][] roles(SolanaMessage.Instruction instruction,SolanaLookupTables.Resolved keys,int count){
        byte[] indexes=instruction.accounts();if(indexes.length!=count)throw invalid();byte[][] result=new byte[count][];
        for(int i=0;i<count;i++)result[i]=keys.key(indexes[i]&255);return result;
    }
    private static void requireMeta(SolanaMessage message,SolanaMessage.Instruction instruction,int role,boolean writable,boolean signer){
        int index=instruction.accounts()[role]&255;
        if(message.isSigner(index)!=signer||message.isWritable(index)!=writable)throw invalid();
    }
    private static void same(byte[] a,byte[] b){if(!Arrays.equals(a,b))throw invalid();}
    private static IllegalArgumentException invalid(){return new IllegalArgumentException("Perps pre-swap differs from USDC funding intent");}
}
