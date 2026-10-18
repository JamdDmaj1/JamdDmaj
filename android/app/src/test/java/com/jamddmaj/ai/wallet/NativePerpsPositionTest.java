package com.jamddmaj.ai.wallet;

import java.math.BigInteger;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import org.junit.Test;
import static org.junit.Assert.*;

public class NativePerpsPositionTest {
    private static final String OWNER="4vJ9JU1bJJE96FWSJKvHsmmFADCg4gpZQff4P3bkLKi";
    static byte[] fixture(){
        ByteBuffer b=ByteBuffer.allocate(210).order(ByteOrder.LITTLE_ENDIAN);
        b.put(new byte[]{(byte)170,(byte)188,(byte)143,(byte)228,122,64,(byte)247,(byte)208});
        b.put(DevnetSolana.decode(OWNER,32)).put(DevnetSolana.decode(NativePerpsCustody.POOL,32));
        b.put(DevnetSolana.decode(NativePerpsCustody.address("SOL"),32)).put(DevnetSolana.decode(NativePerpsCustody.address("SOL"),32));
        b.putLong(1792279214).putLong(1792279214).put((byte)1).putLong(103137009).putLong(20598154).putLong(10299077);
        b.putLong(0).put(new byte[16]).putLong(199720000).put((byte)NativePerpsAddresses.positionDerivation(OWNER,"SOL",1).bump);
        return b.array();
    }
    static NativePerpsPosition decode(byte[] data){return NativePerpsPosition.decode(DevnetSolana.encode(NativePerpsAddresses.position(OWNER,"SOL",1)),NativePerpsCustody.PROGRAM,false,data,OWNER,"SOL",1);}
    @Test public void decodesConfirmedLayoutAndZeroFilledAllocation(){
        NativePerpsPosition position=decode(fixture());assertEquals(BigInteger.valueOf(20598154),position.sizeUsd);assertEquals(BigInteger.valueOf(10299077),position.collateralUsd);
        assertEquals(position.openTime,position.updateTime);assertEquals(position.sizeUsd,decode(java.util.Arrays.copyOf(fixture(),256)).sizeUsd);
    }
    @Test public void rejectsSubstitutedIdentityDiscriminatorSideAndBump(){
        for(int offset:new int[]{0,8,40,72,104,152,209}){byte[] bytes=fixture();bytes[offset]^=1;assertThrows(IllegalArgumentException.class,()->decode(bytes));}
        assertThrows(IllegalArgumentException.class,()->NativePerpsPosition.decode("11111111111111111111111111111111",NativePerpsCustody.PROGRAM,false,fixture(),OWNER,"SOL",1));
        assertThrows(IllegalArgumentException.class,()->NativePerpsPosition.decode(DevnetSolana.encode(NativePerpsAddresses.position(OWNER,"SOL",1)),NativePerpsCustody.PROGRAM,true,fixture(),OWNER,"SOL",1));
    }
    @Test public void rejectsTruncationUnknownExtensionAndInvalidOpenPosition(){
        for(int length=0;length<210;length++){byte[] bytes=java.util.Arrays.copyOf(fixture(),length);assertThrows(IllegalArgumentException.class,()->decode(bytes));}
        byte[] extension=java.util.Arrays.copyOf(fixture(),211);extension[210]=1;assertThrows(IllegalArgumentException.class,()->decode(extension));
        for(int offset:new int[]{136,153,169}){byte[] bytes=fixture();java.util.Arrays.fill(bytes,offset,offset+8,(byte)0);assertThrows(IllegalArgumentException.class,()->decode(bytes));}
    }
    private static NativePerpsOrderIntent intent(){return new NativePerpsOrderIntent("SOL",1,"10.304152","2",50,"103.041520",null,null);}
    private static byte[] number(byte[] input,int offset,long value){byte[] bytes=input.clone();ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN).putLong(offset,value);return bytes;}
    private static NativePerpsInstructionData opening(long size){return NativePerpsInstructionData.parse(number(NativePerpsInstructionDataTest.increase(true),8,size));}
    @Test public void checksOnlyNewExposureAndAllowsBoundedOracleRounding(){
        NativePerpsPosition.checkIncrease(null,decode(fixture()),opening(20598154),intent());
        byte[] rounded=number(number(fixture(),161,20588930),169,10294454);
        NativePerpsPosition.checkIncrease(null,decode(rounded),opening(20588930),intent());
        NativePerpsPosition previous=decode(number(number(fixture(),161,1000000),169,1000000));
        NativePerpsPosition increased=decode(number(number(fixture(),161,21598154),169,11299077));
        NativePerpsPosition.checkIncrease(previous,increased,opening(20598154),intent());
    }
    @Test public void rejectsChangedSizeExcessMarginOrExcessEffectiveLeverage(){
        assertThrows(IllegalArgumentException.class,()->NativePerpsPosition.checkIncrease(null,decode(fixture()),opening(1),intent()));
        assertThrows(IllegalArgumentException.class,()->NativePerpsPosition.checkIncrease(null,decode(number(fixture(),169,11000000)),opening(20598154),intent()));
        assertThrows(IllegalArgumentException.class,()->NativePerpsPosition.checkIncrease(null,decode(number(fixture(),169,1000000)),opening(20598154),intent()));
        assertThrows(IllegalArgumentException.class,()->NativePerpsPosition.checkIncrease(null,decode(fixture()),opening(20598154),new NativePerpsOrderIntent("ETH",1,"10.304152","2",50,"103",null,null)));
    }
    @Test public void rejectsUnderLeveragedExposureButMeasuresNetCollateralAfterFees(){
        assertThrows(IllegalArgumentException.class,()->NativePerpsPosition.checkIncrease(null,
            decode(number(fixture(),161,1000000)),opening(1000000),intent()));
        // Protocol costs can reduce credited collateral. Compare leverage to
        // that actual credit, not to the gross wallet debit.
        NativePerpsPosition.checkIncrease(null,decode(number(number(fixture(),161,19400000),169,9700000)),
            opening(19400000),intent());
    }
}
