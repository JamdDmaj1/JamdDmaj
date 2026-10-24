package com.jamddmaj.ai.wallet;

import java.io.ByteArrayOutputStream;
import java.math.BigInteger;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import org.bouncycastle.math.ec.rfc8032.Ed25519;
import org.junit.Test;
import static org.junit.Assert.*;

public class NativePerpsCloseBindingsTest {
    private static final long NOW=1792279214;
    private static final String OWNER=NativePerpsTransactionTest.payer();
    static NativePerpsCustody custody(){return NativePerpsCustody.decode("SOL",NativePerpsCustody.address("SOL"),NativePerpsCustody.PROGRAM,false,NativePerpsCustodyTest.fixture());}
    static NativePerpsCloseIntent intent(){
        byte[] data=NativePerpsPositionTest.fixture();System.arraycopy(DevnetSolana.decode(OWNER,32),0,data,8,32);
        data[209]=(byte)NativePerpsAddresses.positionDerivation(OWNER,"SOL",1).bump;
        NativePerpsPosition position=NativePerpsPosition.decode(DevnetSolana.encode(NativePerpsAddresses.position(OWNER,"SOL",1)),NativePerpsCustody.PROGRAM,false,data,OWNER,"SOL",1);
        return new NativePerpsCloseIntent(OWNER,"SOL",1,position,"103",50);
    }
    static byte[] core(boolean v2){
        ByteBuffer b=ByteBuffer.allocate(v2?50:42).order(ByteOrder.LITTLE_ENDIAN);
        b.put(v2?new byte[]{(byte)162,(byte)191,(byte)200,62,(byte)139,62,(byte)176,17}:new byte[]{46,23,(byte)240,44,30,(byte)138,94,(byte)140});
        b.putLong(0).putLong(0).putLong(103000000).put((byte)1).put((byte)1).putLong(NOW);if(v2)b.putLong(7);return b.array();
    }
    // Entirely synthetic API signing key; no wallet or production signatures.
    static NativePerpsTransaction transaction(boolean v2,int changedRole,boolean duplicate){
        NativePerpsCustody c=custody();NativePerpsCloseIntent intent=intent();
        String keeper=DevnetSolana.encode(NativePerpsTransactionTest.publicKey(2)),api=DevnetSolana.encode(NativePerpsTransactionTest.publicKey(3));
        String recipient=DevnetSolana.encode(NativePerpsTokenBoundary.associated(DevnetSolana.decode(OWNER,32),c.mint));
        String transfer=DevnetSolana.encode(NativePerpsAddresses.transferAuthority()),perpetuals=DevnetSolana.encode(NativePerpsAddresses.perpetuals()),event=DevnetSolana.encode(NativePerpsAddresses.eventAuthority());
        String request=DevnetSolana.encode(NativePerpsAddresses.exitRequest(DevnetSolana.decode(intent.positionAddress,32),BigInteger.valueOf(7)));
        String requestAta=DevnetSolana.encode(NativePerpsTokenBoundary.associated(DevnetSolana.decode(request,32),c.mint));
        String ata="ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",system="11111111111111111111111111111111";
        String[] roles=v2?new String[]{keeper,api,OWNER,recipient,transfer,perpetuals,NativePerpsCustody.POOL,intent.positionAddress,c.address,c.dovesAgOracle,c.address,c.dovesAgOracle,c.tokenAccount,c.mint,NativePerpsCustody.PROGRAM,request,requestAta,SplTokenAccount.PROGRAM,ata,system,event,NativePerpsCustody.PROGRAM}
            :new String[]{keeper,api,OWNER,recipient,transfer,perpetuals,NativePerpsCustody.POOL,intent.positionAddress,c.address,c.dovesAgOracle,c.oracle,c.address,c.dovesAgOracle,c.oracle,c.tokenAccount,c.mint,NativePerpsCustody.PROGRAM,SplTokenAccount.PROGRAM,ata,system,event,NativePerpsCustody.PROGRAM};
        if(changedRole>=0)roles[changedRole]=DevnetSolana.encode(NativePerpsTransactionTest.publicKey(5));
        List<String> mutable=new ArrayList<>(),readonly=new ArrayList<>();
        int[] mut=v2?new int[]{2,3,6,7,8,10,12,15,16}:new int[]{2,3,6,7,8,11,14};
        for(int role:mut)if(!roles[role].equals(OWNER)&&!mutable.contains(roles[role]))mutable.add(roles[role]);
        List<String> keys=new ArrayList<>(Arrays.asList(OWNER,keeper,api));keys.addAll(mutable);
        for(String role:roles)if(!keys.contains(role)&&!readonly.contains(role))readonly.add(role);keys.addAll(readonly);
        ByteArrayOutputStream out=new ByteArrayOutputStream();out.writeBytes(new byte[]{3,2,(byte)readonly.size(),(byte)keys.size()});
        for(String key:keys)out.writeBytes(DevnetSolana.decode(key,32));out.writeBytes(new byte[32]);out.write(duplicate?2:1);
        for(int repeat=0;repeat<(duplicate?2:1);repeat++){
            out.write(keys.indexOf(NativePerpsCustody.PROGRAM));out.write(22);for(String role:roles)out.write(keys.indexOf(role));byte[] data=core(v2);out.write(data.length);out.writeBytes(data);
        }
        byte[] message=out.toByteArray(),wire=new byte[193+message.length];wire[0]=3;
        Ed25519.sign(NativePerpsTransactionTest.seed(3),0,message,0,message.length,wire,129);System.arraycopy(message,0,wire,193,message.length);
        return NativePerpsTransaction.decode(wire,OWNER);
    }
    private static NativePerpsCloseBindings check(NativePerpsTransaction tx){return NativePerpsCloseBindings.check(tx,SolanaLookupTables.resolve(tx.message,java.util.Collections.emptyList(),BigInteger.ZERO),intent(),custody(),custody(),NOW);}
    @Test public void acceptsBothCollateralFirstAccountLayouts(){
        for(boolean v2:new boolean[]{false,true}){NativePerpsCloseBindings result=check(transaction(v2,-1,false));assertEquals(v2,result.core.variant2);assertEquals(v2,result.requestAddress!=null);}
    }
    @Test public void rejectsEverySubstitutedDestinationCustodyOracleAndProgramRole(){
        for(boolean v2:new boolean[]{false,true})for(int role=2;role<22;role++){
            final int changed=role;assertThrows("role "+role,IllegalArgumentException.class,()->check(transaction(v2,changed,false)));
        }
    }
    @Test public void rejectsTwoCloseInstructions(){assertThrows(IllegalArgumentException.class,()->check(transaction(true,-1,true)));}
}
