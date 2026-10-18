package com.jamddmaj.ai.wallet;

import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.Arrays;

/** Bounds every top-level program and ATA creation in the USDC-funded format.
 * Custody/plan/ledger checks and exact simulation remain mandatory. No signing
 * approval can be obtained from this instruction check alone. */
final class NativePerpsInstructionPolicy {
    private static final String ASSOCIATED="ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
    private static final String COMPUTE="ComputeBudget111111111111111111111111111111";
    private static final String DOVES="DoVEsk76QybCEHQGzkvYPWLQu9gzNoZZZt3TPiL597e";
    private static final String ED25519="Ed25519SigVerify111111111111111111111111111";
    private NativePerpsInstructionPolicy() {}
    static void check(SolanaMessage message,SolanaLookupTables.Resolved keys,NativePerpsOrderIntent intent){
        if(message==null||keys==null||intent==null||keys.size()!=message.accountCount)throw invalid();
        NativePerpsComputeBudget.check(message);NativePerpsOracleBoundary.check(message);
        NativePerpsTokenBoundary.check(message,keys,intent.asset,intent.side);
        Map<String,byte[][]> allowed=new HashMap<>();byte[] owner=keys.key(0);
        add(allowed,owner,NativePerpsFunding.USDC);
        add(allowed,owner,NativePerpsCustody.mint(intent.side==1?intent.asset:"USDC"));
        for(SolanaMessage.Instruction instruction:message.instructions){
            if(!NativePerpsCustody.PROGRAM.equals(DevnetSolana.encode(message.staticKey(instruction.program))))continue;
            if(NativePerpsPreSwapData.recognizes(instruction.data())){NativePerpsPreSwapData.parse(instruction.data());continue;}
            NativePerpsInstructionData data=NativePerpsInstructionData.parse(instruction.data());
            if(data.kind==NativePerpsInstructionData.Kind.TPSL){
                byte[] position=NativePerpsAddresses.position(DevnetSolana.encode(owner),intent.asset,intent.side);
                add(allowed,NativePerpsAddresses.exitRequest(position,data.counter),NativePerpsFunding.USDC);
            }else if(data.kind!=NativePerpsInstructionData.Kind.INCREASE)throw invalid();
        }
        Set<String> created=new HashSet<>();
        for(SolanaMessage.Instruction instruction:message.instructions){
            String program=DevnetSolana.encode(message.staticKey(instruction.program));
            if(ASSOCIATED.equals(program)){
                byte[] indexes=instruction.accounts(),data=instruction.data();
                if(indexes.length!=6||data.length!=1||data[0]!=1||(indexes[0]&255)!=0)throw invalid();
                int ata=indexes[1]&255;if(!message.isWritable(ata)||message.isSigner(ata))throw invalid();
                String address=DevnetSolana.encode(keys.key(ata));byte[][] expected=allowed.get(address);
                if(expected==null||!created.add(address)||!Arrays.equals(keys.key(indexes[2]&255),expected[0])
                        ||!Arrays.equals(keys.key(indexes[3]&255),expected[1])
                        ||!NativePerpsFunding.SYSTEM.equals(DevnetSolana.encode(keys.key(indexes[4]&255)))
                        ||!SplTokenAccount.PROGRAM.equals(DevnetSolana.encode(keys.key(indexes[5]&255))))throw invalid();
                for(int role:new int[]{3,4,5})if(message.isWritable(indexes[role]&255)||message.isSigner(indexes[role]&255))throw invalid();
            }else if(!(COMPUTE.equals(program)||DOVES.equals(program)||ED25519.equals(program)
                    ||NativePerpsCustody.PROGRAM.equals(program)||SplTokenAccount.PROGRAM.equals(program)))throw invalid();
            // In particular: no direct system SOL transfer, unreviewed Jupiter
            // route, arbitrary memo/program CPI or Token-2022 authority access.
        }
    }
    private static void add(Map<String,byte[][]> allowed,byte[] owner,String mint){
        String account=DevnetSolana.encode(NativePerpsTokenBoundary.associated(owner,mint));
        allowed.put(account,new byte[][]{owner,DevnetSolana.decode(mint,32)});
    }
    private static IllegalArgumentException invalid(){return new IllegalArgumentException("Unsupported perps instruction or associated account creation");}
}
