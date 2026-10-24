package com.jamddmaj.ai.wallet;

import java.math.BigInteger;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk=30)
public class NativePerpsCloseChainTest {
    @Test public void confirmationRequiresAbsentOrZeroPositionInANewEnoughBank()throws Exception{
        NativePerpsCloseServiceTest.Rpc rpc=new NativePerpsCloseServiceTest.Rpc();NativePerpsCloseChain chain=new NativePerpsCloseChain(rpc);
        NativePerpsCloseIntent intent=NativePerpsCloseBindingsTest.intent();BigInteger minimum=BigInteger.valueOf(100);
        assertFalse(chain.isClosed(intent.payer,intent.asset,intent.side,minimum));
        NativePerpsSimulation.Account original=rpc.before.get(intent.positionAddress);rpc.before.put(intent.positionAddress,null);
        assertTrue(chain.isClosed(intent.payer,intent.asset,intent.side,minimum));
        byte[] empty=original.data();ByteBuffer.wrap(empty).order(ByteOrder.LITTLE_ENDIAN).putLong(161,0).putLong(169,0).putLong(201,0);
        rpc.before.put(intent.positionAddress,NativePerpsCloseOracleContextTest.account(original.owner,empty,original.lamports.longValueExact()));
        assertTrue(chain.isClosed(intent.payer,intent.asset,intent.side,minimum));assertEquals(0,rpc.simulations);
    }
    @Test public void staleOrMissingBankEvidenceCannotClaimAClosedPosition()throws Exception{
        NativePerpsCloseServiceTest.Rpc rpc=new NativePerpsCloseServiceTest.Rpc();NativePerpsCloseChain chain=new NativePerpsCloseChain(rpc);NativePerpsCloseIntent intent=NativePerpsCloseBindingsTest.intent();
        rpc.before.put(intent.positionAddress,null);
        assertThrows(Exception.class,()->chain.isClosed(intent.payer,intent.asset,intent.side,BigInteger.valueOf(101)));
        assertThrows(Exception.class,()->chain.isClosed(intent.payer,intent.asset,intent.side,BigInteger.ZERO));
    }
}
