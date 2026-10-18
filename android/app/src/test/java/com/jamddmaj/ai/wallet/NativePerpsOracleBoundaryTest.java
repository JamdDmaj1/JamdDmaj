package com.jamddmaj.ai.wallet;

import java.io.ByteArrayOutputStream;
import org.junit.Test;
import static org.junit.Assert.*;

public class NativePerpsOracleBoundaryTest {
    private static SolanaMessage message(int readonlyUnsigned,int[] programs,byte[][] accounts){
        ByteArrayOutputStream out=new ByteArrayOutputStream();
        out.writeBytes(new byte[]{3,2,(byte)readonlyUnsigned,6});
        for(int i=0;i<3;i++){byte[] key=new byte[32];key[0]=(byte)(i+1);out.writeBytes(key);}
        for(String key:new String[]{"DoVEsk76QybCEHQGzkvYPWLQu9gzNoZZZt3TPiL597e","Ed25519SigVerify111111111111111111111111111","PERPHjGBqRHArX4DySjwM6UJHiR3sWAatqfdBS2qQJu"})out.writeBytes(DevnetSolana.decode(key,32));
        out.writeBytes(new byte[32]);out.write(programs.length);
        for(int i=0;i<programs.length;i++){
            out.write(programs[i]);out.write(accounts[i].length);out.writeBytes(accounts[i]);out.write(1);out.write(0);
        }
        return SolanaMessage.parse(out.toByteArray());
    }
    @Test public void acceptsOwnerFreeUpdatesBeforeOpening(){
        NativePerpsOracleBoundary.check(message(3,new int[]{4,3,5},new byte[][]{{},{1,2},{0,1,2}}));
    }
    @Test public void rejectsOwnerCapabilityInOracleUpdates(){
        assertThrows(IllegalArgumentException.class,()->NativePerpsOracleBoundary.check(message(3,new int[]{3,5},new byte[][]{{0},{0}})));
    }
    @Test public void rejectsAccountsOnSignaturePrecompile(){
        assertThrows(IllegalArgumentException.class,()->NativePerpsOracleBoundary.check(message(3,new int[]{4,5},new byte[][]{{1},{0}})));
    }
    @Test public void rejectsUpdatesAfterOpeningAndWritablePrograms(){
        for(int program:new int[]{3,4})assertThrows(IllegalArgumentException.class,()->NativePerpsOracleBoundary.check(message(3,new int[]{5,program},new byte[][]{{0},{}})));
        assertThrows(IllegalArgumentException.class,()->NativePerpsOracleBoundary.check(message(2,new int[]{3,5},new byte[][]{{1},{0}})));
        assertThrows(IllegalArgumentException.class,()->NativePerpsOracleBoundary.check(message(3,new int[]{1,5},new byte[][]{{},{0}})));
    }
}
