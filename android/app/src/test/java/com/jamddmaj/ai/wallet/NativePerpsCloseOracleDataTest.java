package com.jamddmaj.ai.wallet;

import java.io.ByteArrayOutputStream;
import java.math.BigInteger;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.Arrays;
import java.util.Collections;
import java.util.Map;
import org.bouncycastle.math.ec.rfc8032.Ed25519;
import org.junit.Test;
import static org.junit.Assert.*;

public class NativePerpsCloseOracleDataTest {
    private static final long NOW=1792279214;
    private static final Map<Long,Integer> FEEDS=Map.of(1L,0);
    static byte[] storage(){
        byte[] data=new byte[381];ByteBuffer b=ByteBuffer.wrap(data).order(ByteOrder.LITTLE_ENDIAN);
        b.put(new byte[]{(byte)209,117,(byte)255,(byte)185,(byte)196,(byte)175,68,9});
        b.position(40);b.put(DevnetSolana.decode(NativePerpsCloseOracleData.TREASURY,32)).putLong(1).put((byte)1);
        b.put(NativePerpsTransactionTest.publicKey(3)).putLong(NOW+600);return data;
    }
    static NativePerpsCloseOracleData.Storage decoded(byte[] data){return NativePerpsCloseOracleData.storage(NativePerpsCloseOracleData.STORAGE,NativePerpsCloseOracleData.PYTH,false,data);}
    static byte[] payload(){
        ByteBuffer b=ByteBuffer.allocate(50).order(ByteOrder.LITTLE_ENDIAN);
        b.putInt((int)2479346549L).putLong(NOW*1000000L).put((byte)0).put((byte)1);
        b.putInt(1).put((byte)4).put((byte)0).putLong(103000000).put((byte)4).putShort((short)-6);
        b.put((byte)5).putLong(1000).put((byte)12).put((byte)1).putLong(NOW*1000000L);return b.array();
    }
    static byte[] update(byte[] payload){
        ByteBuffer b=ByteBuffer.allocate(118+payload.length).order(ByteOrder.LITTLE_ENDIAN);
        b.put(new byte[]{(byte)203,59,95,(byte)176,(byte)236,21,73,(byte)153}).putInt(102+payload.length).putInt((int)2182742457L);
        byte[] signature=new byte[64];Ed25519.sign(NativePerpsTransactionTest.seed(3),0,payload,0,payload.length,signature,0);
        b.put(signature).put(NativePerpsTransactionTest.publicKey(3)).putShort((short)payload.length).put(payload).putShort((short)0).put((byte)0).put((byte)0);return b.array();
    }
    static SolanaMessage message(byte[] update){
        ByteArrayOutputStream out=new ByteArrayOutputStream();out.writeBytes(new byte[]{3,2,2,5});
        for(int i=1;i<=3;i++)out.writeBytes(NativePerpsTransactionTest.publicKey(i));
        out.writeBytes(DevnetSolana.decode("Ed25519SigVerify111111111111111111111111111",32));
        out.writeBytes(DevnetSolana.decode("DoVEsk76QybCEHQGzkvYPWLQu9gzNoZZZt3TPiL597e",32));out.writeBytes(new byte[32]);out.write(2);
        ByteBuffer ed=ByteBuffer.allocate(16).order(ByteOrder.LITTLE_ENDIAN);ed.put((byte)1).put((byte)0).putShort((short)16).putShort((short)1).putShort((short)80).putShort((short)1).putShort((short)114).putShort((short)(update.length-118)).putShort((short)1);
        instruction(out,3,ed.array());instruction(out,4,update);return SolanaMessage.parse(out.toByteArray());
    }
    private static void instruction(ByteArrayOutputStream out,int program,byte[] data){out.write(program);out.write(0);int length=data.length;while(length>=128){out.write((length&127)|128);length>>>=7;}out.write(length);out.writeBytes(data);}
    private static void check(byte[] update,NativePerpsCloseOracleData.Storage storage,long now){
        SolanaMessage message=message(update);NativePerpsCloseOracleData.checkUpdate(message,SolanaLookupTables.resolve(message,Collections.emptyList(),BigInteger.ZERO),1,storage,FEEDS,now);
    }
    @Test public void verifiesSyntheticSignedPayloadBoundToDovesInstruction(){
        check(update(payload()),decoded(storage()),NOW);
        NativePerpsCloseOracleData.checkPayload(payload(),FEEDS,NOW);
    }
    @Test public void rejectsSubstitutionTruncationBadSignatureAndExpiredSigner(){
        byte[] good=update(payload());
        for(int offset:new int[]{0,8,12,16,80,112,114,good.length-4,good.length-2}){
            byte[] changed=good.clone();changed[offset]^=1;assertThrows("offset "+offset,IllegalArgumentException.class,()->check(changed,decoded(storage()),NOW));
        }
        byte[] badFlag=good.clone();badFlag[badFlag.length-1]=2;assertThrows(IllegalArgumentException.class,()->check(badFlag,decoded(storage()),NOW));
        for(int length=0;length<payload().length;length++){
            byte[] truncated=Arrays.copyOf(payload(),length);assertThrows(IllegalArgumentException.class,()->NativePerpsCloseOracleData.checkPayload(truncated,FEEDS,NOW));
        }
        byte[] expired=storage();ByteBuffer.wrap(expired).order(ByteOrder.LITTLE_ENDIAN).putLong(113,NOW);
        assertThrows(IllegalArgumentException.class,()->check(good,decoded(expired),NOW));
        assertThrows(IllegalArgumentException.class,()->NativePerpsCloseOracleData.storage(NativePerpsCloseOracleData.STORAGE,NativePerpsCloseOracleData.PYTH,true,storage()));
    }
    @Test public void rejectsWrongFeedChannelNegativePriceExponentConfidenceAndStaleObservation(){
        byte[] good=payload();
        assertThrows(IllegalArgumentException.class,()->NativePerpsCloseOracleData.checkPayload(good,Map.of(2L,0),NOW));
        assertThrows(IllegalArgumentException.class,()->NativePerpsCloseOracleData.checkPayload(good,Map.of(1L,1),NOW));
        for(int offset:new int[]{20,29,32}){
            byte[] changed=good.clone();if(offset==29)ByteBuffer.wrap(changed).order(ByteOrder.LITTLE_ENDIAN).putShort(offset,(short)1);
            else ByteBuffer.wrap(changed).order(ByteOrder.LITTLE_ENDIAN).putLong(offset,-1);
            assertThrows(IllegalArgumentException.class,()->NativePerpsCloseOracleData.checkPayload(changed,FEEDS,NOW));
        }
        byte[] old=good.clone();ByteBuffer.wrap(old).order(ByteOrder.LITTLE_ENDIAN).putLong(42,(NOW-31)*1000000L);
        assertThrows(IllegalArgumentException.class,()->NativePerpsCloseOracleData.checkPayload(old,FEEDS,NOW));
        assertThrows(IllegalArgumentException.class,()->check(update(good),decoded(storage()),NOW+31));
        assertThrows(IllegalArgumentException.class,()->check(update(good),decoded(storage()),NOW-3));
    }
    @Test public void rejectsNoncanonicalOrSubstitutedStorageAndCopiesInput(){
        byte[] original=storage();NativePerpsCloseOracleData.Storage decoded=decoded(original);original[81]^=1;
        check(update(payload()),decoded,NOW);
        for(int offset:new int[]{0,40,80,281}){byte[] changed=storage();changed[offset]=(byte)255;assertThrows(IllegalArgumentException.class,()->decoded(changed));}
        assertThrows(IllegalArgumentException.class,()->NativePerpsCloseOracleData.storage("11111111111111111111111111111111",NativePerpsCloseOracleData.PYTH,false,storage()));
    }
}
