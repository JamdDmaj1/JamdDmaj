package com.jamddmaj.ai.wallet;

import java.util.Arrays;

/** Bounds top-level SPL setup/cleanup. Route CPI and final funding must still
 * be checked separately; this check is not spending authorization. */
final class NativePerpsTokenBoundary {
    private static final String TOKEN_2022="TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
    private static final String ASSOCIATED="ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
    private NativePerpsTokenBoundary() {}
    static byte[] associated(byte[] owner,String mint){
        return SolanaProgramAddress.find(ASSOCIATED,Arrays.asList(owner,DevnetSolana.decode(SplTokenAccount.PROGRAM,32),DevnetSolana.decode(mint,32))).key();
    }
    static void check(SolanaMessage message,SolanaLookupTables.Resolved keys,String asset,int side){
        if(message==null||keys==null||keys.size()!=message.accountCount||(side!=1&&side!=2))throw invalid();
        for(int i=0;i<message.staticAccountCount();i++)if(!Arrays.equals(message.staticKey(i),keys.key(i)))throw invalid();
        byte[] owner=keys.key(0),source=associated(owner,NativePerpsFunding.USDC);
        byte[] collateral=associated(owner,NativePerpsCustody.mint(side==1?asset:"USDC"));
        for(SolanaMessage.Instruction instruction:message.instructions){
            String program=DevnetSolana.encode(message.staticKey(instruction.program));
            if(TOKEN_2022.equals(program))throw invalid(); // Supported custody mints are classic SPL.
            if(!SplTokenAccount.PROGRAM.equals(program))continue;
            if(message.isWritable(instruction.program)||message.isSigner(instruction.program))throw invalid();
            byte[] data=instruction.data(),accounts=instruction.accounts();
            if(data.length!=1)throw invalid();
            if(data[0]==9){ // Close only a bound funding ATA, returning rent to owner.
                if(accounts.length!=3||(accounts[1]&255)!=0||(accounts[2]&255)!=0)throw invalid();
                int index=accounts[0]&255;
                if(!message.isWritable(index)||(!Arrays.equals(keys.key(index),source)&&!Arrays.equals(keys.key(index),collateral)))throw invalid();
            }else if(data[0]==17){ // Sync native only for SOL collateral, never an unrelated account.
                if(side!=1||!"SOL".equals(asset)||accounts.length!=1||!message.isWritable(accounts[0]&255)
                        ||!Arrays.equals(keys.key(accounts[0]&255),collateral))throw invalid();
            }else throw invalid(); // Includes approve/revoke/setAuthority and direct transfers.
        }
    }
    private static IllegalArgumentException invalid(){return new IllegalArgumentException("Unsupported perps token setup or authority change");}
}
