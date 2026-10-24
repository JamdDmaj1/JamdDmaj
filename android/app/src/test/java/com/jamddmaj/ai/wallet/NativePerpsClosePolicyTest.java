package com.jamddmaj.ai.wallet;

import java.math.BigInteger;
import java.util.Collections;
import org.junit.Test;
import static org.junit.Assert.*;

public class NativePerpsClosePolicyTest {
    private static void check(NativePerpsTransaction transaction){
        NativePerpsClosePolicy.check(transaction,SolanaLookupTables.resolve(transaction.message,Collections.emptyList(),BigInteger.ZERO),
            NativePerpsCloseBindingsTest.intent(),NativePerpsCloseBindingsTest.custody(),NativePerpsCloseBindingsTest.custody(),null,1792279214);
    }
    @Test public void checksBothFullCloseLayoutsWithExplicitBoundedCompute(){
        for(boolean v2:new boolean[]{false,true})check(NativePerpsCloseBindingsTest.transaction(v2,-1,false,true));
    }
    @Test public void rejectsMissingComputeDuplicateCloseAndSubstitutedRole(){
        assertThrows(IllegalArgumentException.class,()->check(NativePerpsCloseBindingsTest.transaction(true,-1,false)));
        assertThrows(IllegalArgumentException.class,()->check(NativePerpsCloseBindingsTest.transaction(true,-1,true,true)));
        assertThrows(IllegalArgumentException.class,()->check(NativePerpsCloseBindingsTest.transaction(true,3,false,true)));
    }
}
