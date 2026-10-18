package com.jamddmaj.ai.wallet;

import org.junit.Test;
import static org.junit.Assert.*;

public class NativePerpsInstructionPolicyTest {
    private static final String ASSOCIATED="ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
    private static NativePerpsPreSwapPlanTest.Fixture fixture(){
        NativePerpsPreSwapPlanTest.Fixture value=new NativePerpsPreSwapPlanTest.Fixture();
        value.extraProgram=ASSOCIATED;value.extraData=new byte[]{1};
        value.extraAccounts=new byte[][]{value.route.opening[2],value.route.swap[1],value.route.opening[2],DevnetSolana.decode(NativePerpsFunding.USDC,32),DevnetSolana.decode(NativePerpsFunding.SYSTEM,32),DevnetSolana.decode(SplTokenAccount.PROGRAM,32)};
        return value;
    }
    private static void check(NativePerpsPreSwapPlanTest.Fixture fixture){fixture.compile();NativePerpsInstructionPolicy.check(fixture.message,fixture.resolved,fixture.intent);}
    @Test public void acceptsBoundUsdcAtaAndProtocolOnlyInstructions(){check(fixture());}
    @Test public void rejectsEverySubstitutedAtaCreationRole(){
        for(int i=0;i<6;i++){
            NativePerpsPreSwapPlanTest.Fixture fixture=fixture();byte[] other=new byte[32];other[0]=(byte)(200+i);fixture.extraAccounts[i]=other;
            assertThrows(IllegalArgumentException.class,()->check(fixture));
        }
    }
    @Test public void rejectsUnknownProgramDirectSolTransferAndUnreviewedRoute(){
        for(String program:new String[]{NativePerpsFunding.SYSTEM,"JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4","MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"}){
            NativePerpsPreSwapPlanTest.Fixture fixture=fixture();fixture.extraProgram=program;fixture.extraAccounts=new byte[0][];fixture.extraData=new byte[]{1};
            assertThrows(IllegalArgumentException.class,()->check(fixture));
        }
    }
    @Test public void rejectsNonIdempotentOrMalformedAtaInstruction(){
        for(byte[] data:new byte[][]{new byte[0],new byte[]{0},new byte[]{1,0}}){
            NativePerpsPreSwapPlanTest.Fixture fixture=fixture();fixture.extraData=data;assertThrows(IllegalArgumentException.class,()->check(fixture));
        }
    }
}
