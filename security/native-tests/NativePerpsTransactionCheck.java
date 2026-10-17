package com.jamddmaj.ai.wallet;

import java.util.Base64;

/** Public unsigned preparation only. No private keys, signing, RPC or broadcasting. */
public final class NativePerpsTransactionCheck {
    public static void main(String[] args) {
        if(args.length!=2)throw new IllegalArgumentException("Provide public payer and partial transaction");
        byte[] wire=Base64.getDecoder().decode(args[1]);
        NativePerpsTransaction decoded=NativePerpsTransaction.decode(wire,args[0]);
        int instructions=0;
        for(SolanaMessage.Instruction instruction:decoded.message.instructions) {
            String program=DevnetSolana.encode(decoded.message.staticKey(instruction.program));
            if(!program.equals("PERPHjGBqRHArX4DySjwM6UJHiR3sWAatqfdBS2qQJu"))continue;
            NativePerpsInstructionData data=NativePerpsInstructionData.parse(instruction.data());
            instructions++;
            System.out.println("PERPS_KIND="+data.kind+" SIZE="+data.sizeUsd+" COLLATERAL="+data.collateral+" SIDE="+data.side);
        }
        if(instructions==0)throw new IllegalArgumentException("Missing supported perps instruction");
        if(decoded.message.lookups.isEmpty()){
            SolanaLookupTables.Resolved resolved=SolanaLookupTables.resolve(decoded.message,java.util.Collections.emptyList(),java.math.BigInteger.ZERO);
            System.out.println("BOUND_EXITS="+decoded.checkOpeningAccountBindings(resolved));
        }else{
            System.out.println("ACCOUNT_BINDINGS_PENDING_RPC_LOOKUP_RESOLUTION=true");
        }
        System.out.println("ENVELOPE_AND_DATA_DECODED=true POLICY_APPROVED=false SIGNED_BY_USER=false SUBMITTED=false");
    }
}
