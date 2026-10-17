package com.jamddmaj.ai.wallet;

import java.math.BigInteger;
import org.junit.Test;
import static org.junit.Assert.*;

public class NativePerpsAddressesTest {
    private static final String OWNER="4vJ9JU1bJJE96FWSJKvHsmmFADCg4gpZQff4P3bkLKi";
    @Test public void matchesIndependentSdkPositionsAndUnsigned64BitRequestCounters(){
        String[][] vectors={
            {"SOL","1","7PJVXao3xWQU9BN27DNUJiEAz3qiEKTbvLJViAb8GZSM","HsJagkSTEsmZcpBdfhi9UnYyp8db5VbJe169LkxGnJJQ"},
            {"SOL","2","5TqFAc2X2XnBqPRggRjUbR1C5AH4J7SToxSZT6sS47cA","CTKmyDpp7PCbtWszjACGmLHznNFFxhC1nX81ty6jWT3S"},
            {"ETH","1","447ZBKurikJmYFJbhG9fpo7y8LBVp46gcF28KjgaiZQk","FP9dBLg6KBz8cQN3yYuPf5csvp21GMvKpzeugk5fDEwg"},
            {"ETH","2","2jiWe5FFySkTiTpKiddEe1fYaAz5zpDMpdRKEeboK6A7","BGB1WcZ5eywUUfaMdfJrqMRABQb1GpigHzcfsXBwzRHm"},
            {"BTC","1","2cVTZTmgEcAdAEXxgktbY7MEr1kW4oi2mDKgQ1iYpxHq","4bnxZXGtM6GH6w3UKas2xkHM4UU5oyezkGRqHseCWwMR"},
            {"BTC","2","7FFwKA3iqPjkihRHybZSB3WEBMRRp8PsARHgHVs7F9CQ","EBxNKS1te7WZLLnGZeA7ve1Xt97feYiFPk4hy6baUjRW"}
        };
        for(String[] vector:vectors){
            byte[] position=NativePerpsAddresses.position(OWNER,vector[0],Integer.parseInt(vector[1]));
            assertEquals(vector[2],DevnetSolana.encode(position));
            assertEquals(vector[3],DevnetSolana.encode(NativePerpsAddresses.exitRequest(position,new BigInteger("18446744073709551615"))));
        }
    }
    @Test public void rejectsInvalidIntentAndUnboundedCounters(){
        assertThrows(IllegalArgumentException.class,()->NativePerpsAddresses.position(OWNER,"USDC",1));
        assertThrows(IllegalArgumentException.class,()->NativePerpsAddresses.position(OWNER,"SOL",0));
        assertThrows(IllegalArgumentException.class,()->NativePerpsAddresses.exitRequest(new byte[31],BigInteger.ZERO));
        assertThrows(IllegalArgumentException.class,()->NativePerpsAddresses.exitRequest(new byte[32],BigInteger.valueOf(-1)));
        assertThrows(IllegalArgumentException.class,()->NativePerpsAddresses.exitRequest(new byte[32],BigInteger.ONE.shiftLeft(64)));
    }
    @Test public void enforcesPublicSeedBoundsAndKeepsDerivedBytesImmutable(){
        String program=NativePerpsCustody.PROGRAM;
        assertThrows(IllegalArgumentException.class,()->SolanaProgramAddress.find(program,java.util.Collections.nCopies(16,new byte[0])));
        assertThrows(IllegalArgumentException.class,()->SolanaProgramAddress.find(program,java.util.Collections.singletonList(new byte[33])));
        assertThrows(IllegalArgumentException.class,()->SolanaProgramAddress.isCurvePoint(new byte[31]));
        SolanaProgramAddress.Derived result=SolanaProgramAddress.find(program,java.util.Collections.emptyList());
        byte[] original=result.key();result.key()[0]^=1;assertArrayEquals(original,result.key());
        assertFalse(SolanaProgramAddress.isCurvePoint(result.key()));assertTrue(result.bump>0&&result.bump<=255);
    }
}
