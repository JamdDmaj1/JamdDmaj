package com.jamddmaj.ai.wallet;

import org.junit.Test;
import static org.junit.Assert.fail;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertThrows;

public class NativePerpsAccountBindingsTest {
    private static byte[][] keys(){byte[][] keys=new byte[20][32];for(int i=0;i<20;i++)keys[i][0]=(byte)(i+1);return keys;}
    private static byte[][] exit(byte[][] open){
        byte[][] exit=keys();exit[7][0]=60;exit[8][0]=61;
        for(int i:new int[]{0,1,2,4,5,6,17,18,19})exit[i]=open[i].clone();
        for(int[] pair:new int[][]{{7,9},{8,10},{9,11},{10,12},{16,15}})exit[pair[1]]=open[pair[0]].clone();
        return exit;
    }
    private static void rejects(byte[][] open,byte[][] exit){try{NativePerpsAccountBindings.checkIncreaseAndExit(open,exit);fail("accepted mismatched accounts");}catch(IllegalArgumentException expected){}}
    @Test public void acceptsSamePositionAndMarket(){byte[][] open=keys();NativePerpsAccountBindings.checkIncreaseAndExit(open,exit(open));}
    @Test public void rejectsEachChangedSharedRole(){
        byte[][] open=keys();
        for(int role:new int[]{0,1,2,4,5,6,9,10,11,12,15,17,18,19}){byte[][] exit=exit(open);exit[role][1]=1;rejects(open,exit);}
    }
    @Test public void rejectsAliasedRequestAccounts(){
        byte[][] open=keys(),exit=exit(open);exit[7]=exit[8];rejects(open,exit);
        exit=exit(open);exit[7]=exit[6];rejects(open,exit);
        exit=exit(open);exit[8]=exit[6];rejects(open,exit);
    }
    @Test public void rejectsMalformedKeys(){
        byte[][] open=keys();rejects(open,null);rejects(open,new byte[19][32]);
        byte[][] exit=exit(open);exit[3]=new byte[31];rejects(open,exit);
    }
    static SolanaMessage transaction(boolean reverse,boolean wrongOwner,boolean wrongPosition,boolean duplicateOpen){
        java.io.ByteArrayOutputStream out=new java.io.ByteArrayOutputStream();
        out.writeBytes(new byte[]{3,2,1,25});
        for(int i=0;i<25;i++)out.writeBytes(i==19?DevnetSolana.decode("PERPHjGBqRHArX4DySjwM6UJHiR3sWAatqfdBS2qQJu",32):key(i));
        out.writeBytes(new byte[32]);out.write(2);
        byte[] open=new byte[20];for(int i=0;i<20;i++)open[i]=(byte)i;
        open[0]=1;open[1]=2;open[2]=0;
        byte[] exit=new byte[]{1,2,0,20,4,5,6,21,22,7,8,9,10,23,14,16,24,17,18,19};
        if(wrongOwner)exit[2]=1;if(wrongPosition)exit[6]=3;
        if(reverse){instruction(out,exit,NativePerpsInstructionDataTest.trigger(true));instruction(out,open,NativePerpsInstructionDataTest.increase(true));}
        else {instruction(out,open,NativePerpsInstructionDataTest.increase(true));instruction(out,duplicateOpen?open:exit,duplicateOpen?NativePerpsInstructionDataTest.increase(true):NativePerpsInstructionDataTest.trigger(true));}
        return SolanaMessage.parse(out.toByteArray());
    }
    private static byte[] key(int i){byte[] key=new byte[32];key[0]=(byte)(i+1);return key;}
    private static void instruction(java.io.ByteArrayOutputStream out,byte[] accounts,byte[] data){out.write(19);out.write(accounts.length);out.writeBytes(accounts);out.write(data.length);out.writeBytes(data);}
    private static int checkTransaction(SolanaMessage message){return NativePerpsAccountBindings.checkOpeningTransaction(message,SolanaLookupTables.resolve(message,java.util.Collections.emptyList(),java.math.BigInteger.ZERO));}
    @Test public void bindsDecodedTransactionAndRejectsRedirectedExit(){
        assertEquals(1,checkTransaction(transaction(false,false,false,false)));
        assertThrows(IllegalArgumentException.class,()->checkTransaction(transaction(false,true,false,false)));
        assertThrows(IllegalArgumentException.class,()->checkTransaction(transaction(false,false,true,false)));
        assertThrows(IllegalArgumentException.class,()->checkTransaction(transaction(true,false,false,false)));
        assertThrows(IllegalArgumentException.class,()->checkTransaction(transaction(false,false,false,true)));
    }
}
