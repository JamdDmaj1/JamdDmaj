package com.jamddmaj.ai.wallet;

import org.junit.Test;
import static org.junit.Assert.*;

public class NativePerpsCustodyTest {
    // Public SOL custody prefix read from confirmed mainnet, 2026-10-17.
    private static final String PREFIX="01b830515d833f913e1e2473c7340654eb87290035151c402bd0e3c97cb4244886e72034b30b4dfc069b8857feab8184fb687f634618c035dac439dc1aeb3b5598a0f000000000019bbc32a18d871c07355dd251612415c4204cab801db9eec292650351b166d26e090060314704340deddf371fd42472148f248e9d1a6d1a5eb2ac3acd8b7fd5d6b243023200000000000000050000000060e8e99a520d0000000000000000000000000000000000404b4c00000000000000bf5a47da0000f84ddc782166000001010101010101";
    static byte[] fixture(){byte[] data=new byte[PREFIX.length()/2];for(int i=0;i<data.length;i++)data[i]=(byte)Integer.parseInt(PREFIX.substring(i*2,i*2+2),16);return data;}
    private static NativePerpsCustody decode(byte[] data){return NativePerpsCustody.decode("SOL",NativePerpsCustody.address("SOL"),NativePerpsCustody.PROGRAM,false,data);}
    @Test public void readsPublicChainPrefixWithoutProviderIdentityOverrides(){
        NativePerpsCustody custody=decode(fixture());
        assertEquals("SOL",custody.asset);assertEquals(9,custody.decimals);assertFalse(custody.stable);
        assertEquals("So11111111111111111111111111111111111111112",custody.mint);
        assertEquals("BUvduFTd2sWFagCunBPLupG8fBTJqweLw9DuhruNFSCm",custody.tokenAccount);
        assertEquals(new java.math.BigInteger("5000000"),custody.maxLeverageBps);
        assertTrue(custody.allowIncrease);assertTrue(custody.allowDecrease);
    }
    @Test public void rejectsWrongMarketProgramPoolMintAndLayout(){
        assertThrows(IllegalArgumentException.class,()->NativePerpsCustody.decode("ETH",NativePerpsCustody.address("SOL"),NativePerpsCustody.PROGRAM,false,fixture()));
        assertThrows(IllegalArgumentException.class,()->NativePerpsCustody.decode("SOL",NativePerpsCustody.address("SOL"),"11111111111111111111111111111111",false,fixture()));
        assertThrows(IllegalArgumentException.class,()->NativePerpsCustody.decode("SOL",NativePerpsCustody.address("SOL"),NativePerpsCustody.PROGRAM,true,fixture()));
        for(int offset:new int[]{0,8,40,104,105,138}){byte[] data=fixture();data[offset]^=1;assertThrows(IllegalArgumentException.class,()->decode(data));}
        for(int offset=199;offset<206;offset++){byte[] data=fixture();data[offset]=2;assertThrows(IllegalArgumentException.class,()->decode(data));}
        assertThrows(IllegalArgumentException.class,()->NativePerpsCustody.address("DOGE"));
    }
    @Test public void preservesOnChainPausedPermissionsRatherThanAssumingEnabled(){
        byte[] data=fixture();data[202]=0;data[203]=0;
        NativePerpsCustody custody=decode(data);assertFalse(custody.allowIncrease);assertFalse(custody.allowDecrease);
        data[202]=1;assertFalse(custody.allowIncrease);
    }
    @Test public void rejectsTruncatedOrOversizedAndZeroLeverage(){
        for(int length=0;length<206;length++){byte[] data=java.util.Arrays.copyOf(fixture(),length);assertThrows(IllegalArgumentException.class,()->decode(data));}
        assertThrows(IllegalArgumentException.class,()->decode(new byte[8193]));
        byte[] data=fixture();java.util.Arrays.fill(data,175,183,(byte)0);assertThrows(IllegalArgumentException.class,()->decode(data));
    }
    private static byte[][] opening(NativePerpsCustody custody){
        byte[][] keys=new byte[20][32];
        keys[5]=DevnetSolana.decode(NativePerpsCustody.POOL,32);
        keys[7]=DevnetSolana.decode(custody.address,32);keys[9]=DevnetSolana.decode(custody.oracle,32);
        keys[10]=keys[7].clone();keys[12]=keys[9].clone();
        keys[13]=DevnetSolana.decode(custody.tokenAccount,32);keys[19]=DevnetSolana.decode(NativePerpsCustody.PROGRAM,32);
        return keys;
    }
    @Test public void rejectsSubstitutedCustodyOracleOrFundingVaultAndPausedMarket(){
        NativePerpsCustody custody=decode(fixture());custody.checkIncreaseAccounts(opening(custody),custody);
        for(int role:new int[]{5,7,9,10,12,13,19}){
            byte[][] keys=opening(custody);keys[role][0]^=1;
            assertThrows(IllegalArgumentException.class,()->custody.checkIncreaseAccounts(keys,custody));
        }
        byte[] paused=fixture();paused[202]=0;NativePerpsCustody disabled=decode(paused);
        assertThrows(IllegalArgumentException.class,()->disabled.checkIncreaseAccounts(opening(custody),custody));
        assertThrows(IllegalArgumentException.class,()->custody.checkIncreaseAccounts(opening(custody),disabled));
    }
}
