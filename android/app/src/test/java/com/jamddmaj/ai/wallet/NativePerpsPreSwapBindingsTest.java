package com.jamddmaj.ai.wallet;

import org.junit.Test;
import static org.junit.Assert.*;

public class NativePerpsPreSwapBindingsTest {
    private static byte[] key(int value){byte[] key=new byte[32];key[0]=(byte)value;return key;}
    private static byte[] address(String value){return DevnetSolana.decode(value,32);}
    private static NativePerpsCustody custody(String asset){
        byte[] bytes=NativePerpsCustodyTest.fixture();
        System.arraycopy(address(NativePerpsCustody.mint(asset)),0,bytes,40,32);
        bytes[104]=(byte)(asset.equals("SOL")?9:6);bytes[105]=(byte)(asset.equals("USDC")?1:0);
        // Deliberately distinct synthetic vault/oracle: no live-account claim.
        if(asset.equals("USDC")){System.arraycopy(key(90),0,bytes,72,32);System.arraycopy(key(91),0,bytes,384,32);}
        return NativePerpsCustody.decode(asset,NativePerpsCustody.address(asset),NativePerpsCustody.PROGRAM,false,bytes);
    }
    static final class Fixture {
        final NativePerpsCustody input=custody("USDC"),output=custody("SOL");
        final byte[][] swap=new byte[16][],ledger=new byte[3][],opening=new byte[20][];
        Fixture(){this(null,null,null);}
        Fixture(byte[] owner,byte[] keeper,byte[] api){
            for(int i=0;i<20;i++)opening[i]=key(i+10);
            if(owner!=null){opening[2]=owner;opening[0]=keeper;opening[1]=api;}
            swap[0]=opening[2];swap[1]=NativePerpsTokenBoundary.associated(swap[0],input.mint);
            swap[2]=NativePerpsTokenBoundary.associated(swap[0],output.mint);
            swap[3]=NativePerpsAddresses.transferAuthority();swap[4]=NativePerpsAddresses.perpetuals();
            swap[5]=address(NativePerpsCustody.POOL);swap[6]=address(input.address);swap[7]=address(input.dovesAgOracle);swap[8]=address(input.tokenAccount);
            swap[9]=address(output.address);swap[10]=address(output.dovesAgOracle);swap[11]=address(output.tokenAccount);
            swap[12]=address(SplTokenAccount.PROGRAM);swap[13]=address("Sysvar1nstructions1111111111111111111111111");
            swap[14]=NativePerpsAddresses.eventAuthority();swap[15]=address(NativePerpsCustody.PROGRAM);
            for(int[] pair:new int[][]{{3,2},{4,4},{5,5},{10,9},{11,10},{13,11},{16,12},{18,14},{19,15}})opening[pair[0]]=swap[pair[1]];
            ledger[0]=opening[14];ledger[1]=swap[2];ledger[2]=swap[12];
        }
        void check(){NativePerpsPreSwapBindings.check(swap,ledger,opening,input,output);}
    }
    @Test public void bindsEveryRouteRoleToNativeCustodyAndSameOpening(){new Fixture().check();}
    @Test public void rejectsEverySubstitutedRouteAndLedgerRole(){
        for(int i=0;i<16;i++){Fixture fixture=new Fixture();fixture.swap[i]=key(100+i);assertThrows(IllegalArgumentException.class,fixture::check);}
        for(int i=0;i<3;i++){Fixture fixture=new Fixture();fixture.ledger[i]=key(120+i);assertThrows(IllegalArgumentException.class,fixture::check);}
    }
    @Test public void rejectsDifferentOpeningDestinationCustodyOrLedger(){
        for(int role:new int[]{2,3,4,5,10,11,13,14,16,18,19}){
            Fixture fixture=new Fixture();fixture.opening[role]=key(150+role);assertThrows(IllegalArgumentException.class,fixture::check);
        }
    }
    @Test public void rejectsLedgerAliasingAndSameCustody(){
        Fixture fixture=new Fixture();fixture.ledger[0]=fixture.opening[14]=fixture.swap[1];assertThrows(IllegalArgumentException.class,fixture::check);
        Fixture other=new Fixture();assertThrows(IllegalArgumentException.class,()->NativePerpsPreSwapBindings.check(other.swap,other.ledger,other.opening,other.input,other.input));
    }
    @Test public void honorsOnChainSwapPause(){
        Fixture fixture=new Fixture();byte[] bytes=NativePerpsCustodyTest.fixture();bytes[199]=0;
        NativePerpsCustody paused=NativePerpsCustody.decode("SOL",NativePerpsCustody.address("SOL"),NativePerpsCustody.PROGRAM,false,bytes);
        assertFalse(paused.allowSwap);
        assertThrows(IllegalArgumentException.class,()->NativePerpsPreSwapBindings.check(fixture.swap,fixture.ledger,fixture.opening,fixture.input,paused));
    }
}
