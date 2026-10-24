package com.jamddmaj.ai.wallet;

import java.math.BigInteger;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import org.bouncycastle.math.ec.rfc8032.Ed25519;

/** Cryptographic and bounded Pyth payload checks only. Caller must independently
 * fetch program-owned Storage/feed configuration, bind instruction roles and
 * verify exact-wire simulation. This class never authorizes or signs a close. */
final class NativePerpsCloseOracleData {
    static final String PYTH="pytd2yyk641x7ak7mkaasSJVXh6YYZnC7wTmtgAyxPt";
    static final String STORAGE="3rdJbqfnagQ4yx9HXJViD4zc4xpiSqmFsKpPuSCQVyQL";
    static final String TREASURY="Gx4MBPb1vqZLJajZmsKLg8fGw9ErhoKsR8LeKcCKFyak";
    private static final String ED="Ed25519SigVerify111111111111111111111111111";
    private static final byte[] STORAGE_TAG={(byte)209,117,(byte)255,(byte)185,(byte)196,(byte)175,68,9};
    private static final byte[] UPDATE_TAG={(byte)203,59,95,(byte)176,(byte)236,21,73,(byte)153};
    static final class Storage {
        private final Map<String,Long> signers;
        final BigInteger updateFee;
        private Storage(Map<String,Long> signers,BigInteger fee){this.signers=new HashMap<>(signers);updateFee=fee;}
    }
    static final class Observation {
        final BigInteger price,confidence,published,updated;
        final int exponent,channel;
        private Observation(BigInteger price,int exponent,int channel,BigInteger confidence,BigInteger published,BigInteger updated){
            this.price=price;this.exponent=exponent;this.channel=channel;this.confidence=confidence;this.published=published;this.updated=updated;
        }
    }
    static Storage storage(String address,String owner,boolean executable,byte[] input){
        if(!STORAGE.equals(address)||!PYTH.equals(owner)||executable||input==null||input.length!=381)throw invalid();
        byte[] data=input.clone();
        if(!Arrays.equals(STORAGE_TAG,Arrays.copyOf(data,8))||!TREASURY.equals(DevnetSolana.encode(Arrays.copyOfRange(data,40,72)))
                ||(data[80]&255)>2||(data[281]&255)>2)throw invalid();
        Map<String,Long> signers=new HashMap<>();
        for(int i=0;i<(data[80]&255);i++){
            int at=81+40*i;byte[] key=Arrays.copyOfRange(data,at,at+32);BigInteger expiry=unsigned(data,at+32,8);
            String encoded=DevnetSolana.encode(key);
            if(Arrays.equals(key,new byte[32])||expiry.bitLength()>63||signers.put(encoded,expiry.longValueExact())!=null)throw invalid();
        }
        return new Storage(signers,unsigned(data,72,8));
    }
    static void checkSignatures(SolanaMessage message,SolanaLookupTables.Resolved keys,int index){
        if(message==null||keys==null||message.instructions.size()>64||index<0||index>=message.instructions.size())throw invalid();
        SolanaMessage.Instruction ix=message.instructions.get(index);byte[] data=ix.data();
        if(!ED.equals(DevnetSolana.encode(keys.key(ix.program)))||ix.accounts().length!=0||data.length<2||data[1]!=0
                ||(data[0]&255)<1||(data[0]&255)>8||data.length<2+14*(data[0]&255))throw invalid();
        for(int i=0;i<(data[0]&255);i++){
            int at=2+14*i;
            byte[] signature=slice(message,index,u16(data,at+2),u16(data,at),64);
            byte[] key=slice(message,index,u16(data,at+6),u16(data,at+4),32);
            byte[] payload=slice(message,index,u16(data,at+12),u16(data,at+8),u16(data,at+10));
            // Full public-key validation rejects neutral/small-order points.
            if(!Ed25519.validatePublicKeyFull(key,0)||!Ed25519.verify(signature,0,key,0,payload,0,payload.length))throw invalid();
        }
    }
    static Map<Long,Observation> checkUpdate(SolanaMessage message,SolanaLookupTables.Resolved keys,int index,Storage storage,
            Map<Long,Integer> expectedFeeds,long now){
        if(message==null||keys==null||storage==null||expectedFeeds==null||expectedFeeds.isEmpty()||expectedFeeds.size()>2
                ||now<30||now>Long.MAX_VALUE-2||index<0||index>=message.instructions.size())throw invalid();
        byte[] data=message.instructions.get(index).data();
        if(data.length<118||!Arrays.equals(Arrays.copyOf(data,8),UPDATE_TAG))throw invalid();
        long length=u32(data,8);if(length<102||length>1232||data.length!=16+length||u32(data,12)!=2182742457L)throw invalid();
        int end=(int)(12+length),payloadLength=u16(data,112),edIndex=u16(data,end),selected=data[end+2]&255;
        if(length!=102+payloadLength||(data[end+3]&255)>1||edIndex>=index)throw invalid();
        checkSignatures(message,keys,edIndex);byte[] ed=message.instructions.get(edIndex).data();
        if(selected>=(ed[0]&255))throw invalid();int at=2+14*selected;
        if(u16(ed,at)!=16||u16(ed,at+2)!=index||u16(ed,at+4)!=80||u16(ed,at+6)!=index
                ||u16(ed,at+8)!=114||u16(ed,at+10)!=payloadLength||u16(ed,at+12)!=index)throw invalid();
        Long expiry=storage.signers.get(DevnetSolana.encode(Arrays.copyOfRange(data,80,112)));
        if(expiry==null||expiry<=now)throw invalid();
        return checkPayload(Arrays.copyOfRange(data,114,114+payloadLength),expectedFeeds,now);
    }
    static Map<Long,Observation> checkPayload(byte[] input,Map<Long,Integer> expected,long now){
        if(input==null||input.length<14||input.length>1232||expected==null||expected.isEmpty()||expected.size()>2
                ||now<30||now>Long.MAX_VALUE-2)throw invalid();
        Cursor c=new Cursor(input);if(c.u32()!=2479346549L)throw invalid();BigInteger published=c.u64();
        BigInteger current=BigInteger.valueOf(now).multiply(BigInteger.valueOf(1000000));
        BigInteger minimum=current.subtract(BigInteger.valueOf(30000000));
        if(published.signum()<=0||published.compareTo(minimum)<0||published.compareTo(current.add(BigInteger.valueOf(2000000)))>0)throw invalid();
        int channel=c.u8(),count=c.u8();if(count<1||count>32)throw invalid();Set<Long> seen=new HashSet<>();Map<Long,Observation> result=new HashMap<>();
        for(int i=0;i<count;i++){
            long feed=c.u32();int properties=c.u8();if(feed==0||!seen.add(feed)||properties<1||properties>13)throw invalid();
            Set<Integer> tags=new HashSet<>();BigInteger price=null,confidence=null,updated=null;Integer exponent=null;
            for(int j=0;j<properties;j++){
                int tag=c.u8();if(tag>12||!tags.add(tag))throw invalid();
                if(tag==0||tag==1||tag==2||tag==5||tag==10||tag==11){BigInteger value=c.i64();if(tag==0)price=value;if(tag==5)confidence=value;}
                else if(tag==3)c.u16();
                else if(tag==4||tag==9){int value=(short)c.u16();if(tag==4)exponent=value;}
                else {int present=c.u8();if(present>1)throw invalid();BigInteger value=present==0?null:(tag==6?c.i64():c.u64());if(tag==12)updated=value;}
            }
            if(expected.containsKey(feed)){
                if(expected.get(feed)!=channel||price==null||price.signum()<=0||exponent==null||exponent< -18||exponent>0
                        ||confidence!=null&&confidence.signum()<0)throw invalid();
                if(tags.contains(12)&&(updated==null||updated.signum()<=0||updated.compareTo(published)>0||updated.compareTo(minimum)<0))throw invalid();
                result.put(feed,new Observation(price,exponent,channel,confidence,published,updated));
            }
        }
        if(c.at!=input.length||!seen.containsAll(expected.keySet()))throw invalid();return java.util.Collections.unmodifiableMap(result);
    }
    private static byte[] slice(SolanaMessage message,int current,int instruction,int offset,int size){
        int index=instruction==65535?current:instruction;if(index<0||index>=message.instructions.size())throw invalid();
        byte[] data=message.instructions.get(index).data();if(offset<0||size<0||offset>data.length-size)throw invalid();return Arrays.copyOfRange(data,offset,offset+size);
    }
    private static int u16(byte[] data,int at){return unsigned(data,at,2).intValueExact();}
    private static long u32(byte[] data,int at){return unsigned(data,at,4).longValueExact();}
    private static BigInteger unsigned(byte[] data,int at,int length){
        if(data==null||at<0||length<1||at>data.length-length)throw invalid();byte[] big=new byte[length];for(int i=0;i<length;i++)big[i]=data[at+length-1-i];return new BigInteger(1,big);
    }
    private static final class Cursor {
        final byte[] data;int at;Cursor(byte[] data){this.data=data.clone();}
        BigInteger take(int size){BigInteger value=unsigned(data,at,size);at+=size;return value;}
        int u8(){return take(1).intValueExact();}int u16(){return take(2).intValueExact();}long u32(){return take(4).longValueExact();}
        BigInteger u64(){return take(8);}BigInteger i64(){BigInteger value=u64();return value.testBit(63)?value.subtract(BigInteger.ONE.shiftLeft(64)):value;}
    }
    private static IllegalArgumentException invalid(){return new IllegalArgumentException("Unverified native close oracle signature or price payload");}
}
