package com.jamddmaj.ai.wallet;

import java.util.Arrays;

/** Cross-instruction account consistency only. This does not establish trusted
 * custody/PDA identities, validate funding or authorize signing. */
final class NativePerpsAccountBindings {
    private static final String PROGRAM="PERPHjGBqRHArX4DySjwM6UJHiR3sWAatqfdBS2qQJu";
    private NativePerpsAccountBindings() {}

    /** Requires RPC-resolved lookup keys, not the provider's suggested accounts.
     * Returns the number of bound exits; no policy-approved result is produced. */
    static int checkOpeningTransaction(SolanaMessage message,SolanaLookupTables.Resolved resolved) {
        if(message==null||resolved==null||resolved.size()!=message.accountCount||message.signatures!=3)throw invalid();
        for(int i=0;i<message.staticAccountCount();i++)same(message.staticKey(i),resolved.key(i));
        byte[][] opening=null;
        java.util.List<byte[][]> exits=new java.util.ArrayList<>();
        for(SolanaMessage.Instruction instruction:message.instructions){
            if(!PROGRAM.equals(DevnetSolana.encode(message.staticKey(instruction.program))))continue;
            if(NativePerpsPreSwapData.recognizes(instruction.data())){
                if(opening!=null)throw invalid();
                NativePerpsPreSwapData.parse(instruction.data());
                continue; // Full pre-swap plan/custody/ledger checks are separate mandatory gates.
            }
            NativePerpsInstructionData data=NativePerpsInstructionData.parse(instruction.data());
            byte[] indexes=instruction.accounts();
            if(indexes.length!=20)throw invalid();
            byte[][] keys=new byte[20][];
            for(int i=0;i<20;i++)keys[i]=resolved.key(indexes[i]&255);
            // The owner's account must be the actual fee payer, not another
            // signer supplied by the response. The other two signers retain
            // their envelope roles; their trusted identities remain unchecked.
            if((indexes[0]&255)!=1||(indexes[1]&255)!=2||(indexes[2]&255)!=0)throw invalid();
            same(keys[19],DevnetSolana.decode(PROGRAM,32));
            if(data.kind==NativePerpsInstructionData.Kind.INCREASE){
                if(opening!=null||!exits.isEmpty())throw invalid();
                opening=keys;
            }else if(data.kind==NativePerpsInstructionData.Kind.TPSL){
                if(opening==null||exits.size()>=2)throw invalid();
                checkIncreaseAndExit(opening,keys);
                for(byte[][] previous:exits){
                    different(previous[7],keys[7]);
                    different(previous[8],keys[8]);
                }
                exits.add(keys);
            }else throw invalid();
        }
        if(opening==null)throw invalid();
        return exits.size();
    }

    static void checkIncreaseAndExit(byte[][] increase, byte[][] exit) {
        check(increase); check(exit);
        // Current on-chain IDL: instantIncreasePosition / instantCreateTpsl.
        // Shared keeper, API keeper, owner, perpetuals, pool and position.
        for (int index : new int[]{0,1,2,4,5,6}) same(increase[index],exit[index]);
        same(increase[7],exit[9]);   // market custody
        same(increase[8],exit[10]); // market Doves oracle
        same(increase[9],exit[11]); // market Pyth oracle
        same(increase[10],exit[12]); // collateral custody
        same(increase[16],exit[15]); // SPL token program
        same(increase[17],exit[17]); // system program
        same(increase[18],exit[18]); // event authority
        same(increase[19],exit[19]); // program
        // Every request and its token account must be distinct from each other
        // and from the position. Their actual PDAs still require verification.
        different(exit[7],exit[8]);
        different(exit[7],exit[6]);
        different(exit[8],exit[6]);
    }

    private static void check(byte[][] keys) {
        if(keys==null||keys.length!=20)throw invalid();
        for(byte[] key:keys)if(key==null||key.length!=32)throw invalid();
    }
    private static void same(byte[] a,byte[] b){if(!Arrays.equals(a,b))throw invalid();}
    private static void different(byte[] a,byte[] b){if(Arrays.equals(a,b))throw invalid();}
    private static IllegalArgumentException invalid(){return new IllegalArgumentException("Inconsistent perps exit accounts");}
}
