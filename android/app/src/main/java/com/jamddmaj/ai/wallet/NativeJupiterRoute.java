package com.jamddmaj.ai.wallet;

import java.math.BigInteger;

/** Binds Jupiter V2 monetary fields and user-facing accounts to native intent.
 * Token ownership, setup/cleanup and remaining route accounts require further policy checks.
 */
final class NativeJupiterRoute {
    static final String TOKEN="TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
    static final String TOKEN_2022="TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
    final String source, destination, sourceTokenProgram, destinationTokenProgram;
    final int instructionIndex;
    private NativeJupiterRoute(String source,String destination,String inputProgram,String outputProgram,int index) {
        this.source=source; this.destination=destination;
        this.sourceTokenProgram=inputProgram; this.destinationTokenProgram=outputProgram; this.instructionIndex=index;
    }
    static NativeJupiterRoute inspect(SolanaMessage message,SolanaLookupTables.Resolved accounts,NativeSwapPreparation preparation) {
        if (message==null || accounts==null || preparation==null || accounts.size()!=message.accountCount
                || message.signatures!=1 || !key(accounts,0).equals(preparation.intent.payer)) throw invalid();
        NativeJupiterRoute result=null;
        for (int i=0;i<message.instructions.size();i++) {
            SolanaMessage.Instruction instruction=message.instructions.get(i);
            if (!JupiterV2Header.PROGRAM.equals(key(accounts,instruction.program))) continue;
            if (result!=null) throw invalid();
            JupiterV2Header header=JupiterV2Header.parse(JupiterV2Header.PROGRAM,instruction.data());
            header.requireIntent(new BigInteger(preparation.intent.amount),preparation.outAmount,
                preparation.minimumOut,preparation.intent.slippageBps);
            byte[] positions=instruction.accounts();
            boolean shared=header.sharedAccounts;
            if (positions.length<(shared?12:10)) throw invalid();
            int authority=index(positions,shared?1:0), source=index(positions,shared?2:1), destination=index(positions,shared?5:2);
            if (authority!=0 || !message.isSigner(authority) || source==destination || source==0 || destination==0
                    || !message.isWritable(source) || !message.isWritable(destination)) throw invalid();
            int inputMint=index(positions,shared?6:3), outputMint=index(positions,shared?7:4);
            if (!key(accounts,inputMint).equals(preparation.intent.inputMint) || !key(accounts,outputMint).equals(preparation.intent.outputMint)
                    || message.isWritable(inputMint) || message.isWritable(outputMint)) throw invalid();
            int inputProgram=index(positions,shared?8:5), outputProgram=index(positions,shared?9:6);
            String input=tokenProgram(message,accounts,inputProgram), output=tokenProgram(message,accounts,outputProgram);
            int self=index(positions,shared?11:9), event=index(positions,shared?10:8);
            if (!key(accounts,self).equals(JupiterV2Header.PROGRAM) || message.isWritable(self)
                    || message.isWritable(event) || message.isSigner(event)) throw invalid();
            if (!shared) {
                int optional=index(positions,7);
                if (optional!=destination && optional!=self) throw invalid();
            }
            result=new NativeJupiterRoute(key(accounts,source),key(accounts,destination),input,output,i);
        }
        if (result==null) throw invalid();
        return result;
    }
    private static String tokenProgram(SolanaMessage message,SolanaLookupTables.Resolved accounts,int index) {
        String key=key(accounts,index);
        if ((!TOKEN.equals(key) && !TOKEN_2022.equals(key)) || message.isWritable(index) || message.isSigner(index)) throw invalid();
        return key;
    }
    private static int index(byte[] indexes,int offset) { return indexes[offset]&255; }
    private static String key(SolanaLookupTables.Resolved accounts,int index) { return DevnetSolana.encode(accounts.key(index)); }
    private static IllegalArgumentException invalid() { return new IllegalArgumentException("Jupiter route differs from swap intent"); }
}
