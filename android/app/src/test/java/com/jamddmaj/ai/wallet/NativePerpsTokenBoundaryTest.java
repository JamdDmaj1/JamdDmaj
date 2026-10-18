package com.jamddmaj.ai.wallet;

import java.io.ByteArrayOutputStream;
import java.math.BigInteger;
import java.util.Collections;
import org.junit.Test;
import static org.junit.Assert.*;

public class NativePerpsTokenBoundaryTest {
    private static SolanaMessage message(byte[] data,byte[] accounts,boolean substituted){
        ByteArrayOutputStream out=new ByteArrayOutputStream();out.writeBytes(new byte[]{3,2,1,6});
        byte[] owner=new byte[32];owner[0]=1;
        for(int i=0;i<3;i++){byte[] key=new byte[32];key[0]=(byte)(i+1);out.writeBytes(key);}
        out.writeBytes(NativePerpsTokenBoundary.associated(owner,NativePerpsFunding.USDC));
        byte[] collateral=NativePerpsTokenBoundary.associated(owner,NativePerpsFunding.SOL);
        if(substituted)collateral[0]^=1;
        out.writeBytes(collateral);out.writeBytes(DevnetSolana.decode(SplTokenAccount.PROGRAM,32));
        out.writeBytes(new byte[32]);out.write(1);out.write(5);out.write(accounts.length);out.writeBytes(accounts);out.write(data.length);out.writeBytes(data);
        return SolanaMessage.parse(out.toByteArray());
    }
    private static void check(byte[] data,byte[] accounts,boolean substituted){
        SolanaMessage message=message(data,accounts,substituted);
        NativePerpsTokenBoundary.check(message,SolanaLookupTables.resolve(message,Collections.emptyList(),BigInteger.ZERO),"SOL",1);
    }
    @Test public void acceptsOnlyBoundFundingCleanupAndNativeSync(){
        check(new byte[]{17},new byte[]{4},false);
        check(new byte[]{9},new byte[]{4,0,0},false);
        check(new byte[]{9},new byte[]{3,0,0},false);
    }
    @Test public void rejectsAuthorityChangesEvenIfLaterRestored(){
        for(int kind:new int[]{3,4,5,6,7,8,10,12,13,14,15})assertThrows(IllegalArgumentException.class,()->check(new byte[]{(byte)kind},new byte[]{3,4,0},false));
    }
    @Test public void rejectsSubstitutedCleanupDestinationAuthorityAndTokenAccount(){
        assertThrows(IllegalArgumentException.class,()->check(new byte[]{9},new byte[]{4,1,0},false));
        assertThrows(IllegalArgumentException.class,()->check(new byte[]{9},new byte[]{4,0,1},false));
        assertThrows(IllegalArgumentException.class,()->check(new byte[]{9},new byte[]{4,0,0},true));
        assertThrows(IllegalArgumentException.class,()->check(new byte[]{17},new byte[]{3},false));
        assertThrows(IllegalArgumentException.class,()->check(new byte[]{9,0},new byte[]{4,0,0},false));
    }
}
