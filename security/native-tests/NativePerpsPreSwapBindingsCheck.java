package com.jamddmaj.ai.wallet;

/** Diagnostic public RPC snapshots only, not a signing review or policy approval. */
public final class NativePerpsPreSwapBindingsCheck {
    public static void main(String[] args)throws Exception{
        if(args.length<8)throw new IllegalArgumentException("Expected public payer, custody/ledger snapshots, input and resolved addresses");
        byte[] encoded=System.in.readNBytes(2001);if(encoded.length>2000)throw new IllegalArgumentException("Oversized wire");
        NativePerpsTransaction tx=NativePerpsTransaction.decode(java.util.Base64.getDecoder().decode(new String(encoded,java.nio.charset.StandardCharsets.US_ASCII).trim()),args[0]);
        if(args.length!=7+tx.message.accountCount)throw new IllegalArgumentException("Invalid resolved key count");
        byte[][] keys=new byte[tx.message.accountCount][];
        for(int i=0;i<keys.length;i++){
            keys[i]=DevnetSolana.decode(args[7+i],32);
            if(i<tx.message.staticAccountCount()&&!java.util.Arrays.equals(keys[i],tx.message.staticKey(i)))throw new IllegalArgumentException("Different static key");
        }
        NativePerpsCustody input=custody(args[1],args[3]),output=custody(args[2],args[4]);
        byte[][] ledger=null,swap=null,opening=null;NativePerpsPreSwapData swapData=null;
        for(SolanaMessage.Instruction instruction:tx.message.instructions){
            if(!NativePerpsCustody.PROGRAM.equals(DevnetSolana.encode(tx.message.staticKey(instruction.program))))continue;
            byte[] data=instruction.data();
            if(data.length==8){
                if(ledger!=null||swap!=null||opening!=null||NativePerpsPreSwapData.parse(data).kind!=NativePerpsPreSwapData.Kind.SET_LEDGER)throw new IllegalArgumentException("Ledger order mismatch");
                ledger=roles(instruction,keys);
            }else if(data.length==24){
                if(ledger==null||swap!=null||opening!=null)throw new IllegalArgumentException("Pre-swap order mismatch");
                swapData=NativePerpsPreSwapData.parse(data);swap=roles(instruction,keys);
            }else{
                NativePerpsInstructionData order=NativePerpsInstructionData.parse(data);
                if(order.kind!=NativePerpsInstructionData.Kind.INCREASE||opening!=null||swap==null||order.collateral!=null)throw new IllegalArgumentException("Opening/ledger mismatch");
                opening=roles(instruction,keys);
            }
        }
        NativePerpsPreSwapBindings.check(swap,ledger,opening,input,output);
        NativePerpsTokenLedger.decode(NativePerpsCustody.PROGRAM,false,java.util.Base64.getDecoder().decode(args[6]));
        swapData.requireAmounts(new java.math.BigInteger(args[5]),java.math.BigInteger.ONE);
        System.out.println("PRE_SWAP_ROUTE_BOUND=true LEDGER_LAYOUT_MATCH=true INPUT_AMOUNT_MATCH=true OUTPUT_SLIPPAGE_APPROVED=false SIGNING_AUTHORIZED=false SUBMITTED=false");
    }
    private static NativePerpsCustody custody(String asset,String data){return NativePerpsCustody.decode(asset,NativePerpsCustody.address(asset),NativePerpsCustody.PROGRAM,false,java.util.Base64.getDecoder().decode(data));}
    private static byte[][] roles(SolanaMessage.Instruction instruction,byte[][] keys){
        byte[] indexes=instruction.accounts();byte[][] result=new byte[indexes.length][];
        for(int i=0;i<indexes.length;i++)result[i]=keys[indexes[i]&255];return result;
    }
}
