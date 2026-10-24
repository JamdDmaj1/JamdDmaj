package com.jamddmaj.ai.wallet;

import java.math.BigInteger;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.Arrays;
import org.junit.Test;
import static org.junit.Assert.*;

public class NativePerpsCloseIntentTest {
    private static final String OWNER="4vJ9JU1bJJE96FWSJKvHsmmFADCg4gpZQff4P3bkLKi";
    private static final long NOW=1792279214;
    private static NativePerpsPosition position(String asset,int side){
        byte[] data=NativePerpsPositionTest.fixture();
        System.arraycopy(DevnetSolana.decode(NativePerpsCustody.address(asset),32),0,data,72,32);
        System.arraycopy(DevnetSolana.decode(NativePerpsCustody.address(side==1?asset:"USDC"),32),0,data,104,32);
        data[152]=(byte)side;data[209]=(byte)NativePerpsAddresses.positionDerivation(OWNER,asset,side).bump;
        return NativePerpsPosition.decode(DevnetSolana.encode(NativePerpsAddresses.position(OWNER,asset,side)),NativePerpsCustody.PROGRAM,false,data,OWNER,asset,side);
    }
    private static NativePerpsCloseIntent intent(String asset,int side){return new NativePerpsCloseIntent(OWNER,asset,side,position(asset,side),"103.000001",50);}
    private static byte[] core(boolean v2,long price){
        ByteBuffer b=ByteBuffer.allocate(v2?50:42).order(ByteOrder.LITTLE_ENDIAN);
        b.put(v2?new byte[]{(byte)162,(byte)191,(byte)200,62,(byte)139,62,(byte)176,17}:new byte[]{46,23,(byte)240,44,30,(byte)138,94,(byte)140});
        b.putLong(0).putLong(0).putLong(price).put((byte)1).put((byte)1).putLong(NOW);
        if(v2)b.putLong(-1);return b.array();
    }
    @Test public void bindsAllMarketsSidesAndBothVariants(){
        for(String asset:new String[]{"SOL","ETH","BTC"})for(int side:new int[]{1,2}){
            NativePerpsCloseIntent intent=intent(asset,side);
            assertEquals(side==1?asset:"USDC",intent.receiveToken);
            for(boolean v2:new boolean[]{false,true}){
                NativePerpsCloseIntent.Core checked=intent.checkCore(core(v2,intent.priceLimit.longValueExact()),NOW);
                assertEquals(v2,checked.variant2);assertEquals(v2?new BigInteger("18446744073709551615"):null,checked.counter);
            }
        }
    }
    @Test public void roundsLimitsInwardAndRejectsOneMicroUnitBeyond(){
        for(int side:new int[]{1,2}){
            NativePerpsCloseIntent intent=intent("SOL",side);
            assertEquals(new BigInteger(side==1?"102485001":"103515001"),intent.priceLimit);
            assertThrows(IllegalArgumentException.class,()->intent.checkCore(core(true,intent.priceLimit.longValueExact()+(side==1?-1:1)),NOW));
        }
    }
    @Test public void rejectsPartialMalformedStaleAndOversizedClaims(){
        NativePerpsCloseIntent intent=intent("SOL",1);byte[] good=core(true,intent.priceLimit.longValueExact());
        for(int offset:new int[]{0,32,33}){byte[] changed=good.clone();changed[offset]^=1;assertThrows(IllegalArgumentException.class,()->intent.checkCore(changed,NOW));}
        for(int length:new int[]{0,7,41,43,49,51})assertThrows(IllegalArgumentException.class,()->intent.checkCore(Arrays.copyOf(good,length),NOW));
        for(int offset:new int[]{8,16,34}){byte[] changed=good.clone();Arrays.fill(changed,offset,offset+8,(byte)255);assertThrows(IllegalArgumentException.class,()->intent.checkCore(changed,NOW));}
        assertThrows(IllegalArgumentException.class,()->intent.checkCore(good,NOW+31));
        assertThrows(IllegalArgumentException.class,()->intent.checkCore(good,NOW-3));
        assertThrows(IllegalArgumentException.class,()->intent.checkCore(good,Long.MAX_VALUE));
        intent.checkCore(good,NOW+30);intent.checkCore(good,NOW-2);
    }
    @Test public void rejectsForeignPositionSideMarketAndUnboundedTolerance(){
        NativePerpsPosition observed=position("SOL",1);
        for(String asset:new String[]{"BTC","ETH"})assertThrows(IllegalArgumentException.class,()->new NativePerpsCloseIntent(OWNER,asset,1,observed,"103",50));
        assertThrows(IllegalArgumentException.class,()->new NativePerpsCloseIntent(OWNER,"SOL",2,observed,"103",50));
        assertThrows(IllegalArgumentException.class,()->new NativePerpsCloseIntent("11111111111111111111111111111111","SOL",1,observed,"103",50));
        for(int bps:new int[]{0,101,Integer.MAX_VALUE})assertThrows(IllegalArgumentException.class,()->new NativePerpsCloseIntent(OWNER,"SOL",1,observed,"103",bps));
    }
}
