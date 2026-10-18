package com.jamddmaj.ai.wallet;

/** Restricts oracle-update capabilities, not their price payload or authority.
 * This is one prerequisite only; it never produces signing authorization. */
final class NativePerpsOracleBoundary {
    private static final String DOVES="DoVEsk76QybCEHQGzkvYPWLQu9gzNoZZZt3TPiL597e";
    private static final String ED25519="Ed25519SigVerify111111111111111111111111111";
    private static final String PERPS="PERPHjGBqRHArX4DySjwM6UJHiR3sWAatqfdBS2qQJu";
    private NativePerpsOracleBoundary() {}

    static void check(SolanaMessage message) {
        if(message==null)throw invalid();
        boolean opened=false;
        for(SolanaMessage.Instruction instruction:message.instructions){
            // No invoked program may also carry spending or writable authority.
            if(message.isSigner(instruction.program)||message.isWritable(instruction.program))throw invalid();
            String program=DevnetSolana.encode(message.staticKey(instruction.program));
            if(PERPS.equals(program))opened=true;
            if(!DOVES.equals(program)&&!ED25519.equals(program))continue;
            if(opened)throw invalid();
            byte[] accounts=instruction.accounts();
            if(ED25519.equals(program)&&accounts.length!=0)throw invalid();
            // Oracle CPI cannot access the owner's signer or debit the payer.
            for(byte account:accounts)if((account&255)==0)throw invalid();
        }
    }
    private static IllegalArgumentException invalid(){return new IllegalArgumentException("Unsafe perps oracle instruction capabilities");}
}
