package com.jamddmaj.ai.wallet;

import java.io.ByteArrayOutputStream;
import java.math.BigInteger;
import java.util.Arrays;
import org.bouncycastle.asn1.sec.SECNamedCurves;
import org.bouncycastle.math.ec.ECAlgorithms;

/** Independent bounded RLP/EIP-155 verification of the SDK's native BNB output. */
final class BnbSignedTransaction {
    private static final BigInteger CHAIN=BigInteger.valueOf(56);
    static String verify(byte[] encoded,String owner,String recipient,BigInteger amount,BigInteger nonce,BigInteger price,BigInteger gas){
        if(encoded==null||encoded.length>512||encoded.length<9)throw bad();
        Cursor cursor=new Cursor(encoded);int end=cursor.listEnd();if(end!=encoded.length)throw bad();
        byte[][] values=new byte[9][];for(int i=0;i<9;i++)values[i]=cursor.bytes();if(cursor.position!=end)throw bad();
        if(!number(values[0]).equals(nonce)||!number(values[1]).equals(price)||!number(values[2]).equals(gas)||
           !NativeEvmAddress.hex(values[3]).equalsIgnoreCase(NativeEvmAddress.recipient(recipient))||
           !number(values[4]).equals(amount)||values[5].length!=0)throw bad();
        BigInteger v=number(values[6]),r=number(values[7]),s=number(values[8]);
        int recovery=v.subtract(CHAIN.multiply(BigInteger.valueOf(2)).add(BigInteger.valueOf(35))).intValueExact();
        if(recovery<0||recovery>1)throw bad();
        var curve=SECNamedCurves.getByName("secp256k1");BigInteger n=curve.getN();
        if(r.signum()<=0||r.compareTo(n)>=0||s.signum()<=0||s.compareTo(n.shiftRight(1))>0)throw bad();
        byte[][] unsigned={values[0],values[1],values[2],values[3],values[4],values[5],new byte[]{56},new byte[0],new byte[0]};
        BigInteger hash=new BigInteger(1,NativeEvmAddress.keccak(list(unsigned)));
        byte[] compressed=new byte[33];compressed[0]=(byte)(2+recovery);
        byte[] x=r.toByteArray();System.arraycopy(x,Math.max(0,x.length-32),compressed,33-Math.min(32,x.length),Math.min(32,x.length));
        var point=curve.getCurve().decodePoint(compressed);
        if(!point.multiply(n).isInfinity())throw bad();
        BigInteger inverse=r.modInverse(n);
        var publicPoint=ECAlgorithms.sumOfTwoMultiplies(curve.getG(),hash.negate().mod(n).multiply(inverse).mod(n),point,s.multiply(inverse).mod(n)).normalize();
        if(publicPoint.isInfinity())throw bad();
        byte[] publicKey=publicPoint.getEncoded(false);
        byte[] digest=NativeEvmAddress.keccak(Arrays.copyOfRange(publicKey,1,publicKey.length));
        String recovered=NativeEvmAddress.hex(Arrays.copyOfRange(digest,12,32));
        if(!recovered.equalsIgnoreCase(NativeEvmAddress.validate(owner)))throw bad();
        return NativeEvmAddress.hex(NativeEvmAddress.keccak(encoded));
    }
    private static BigInteger number(byte[] value){if(value.length>32||(value.length>0&&value[0]==0))throw bad();return new BigInteger(1,value);}
    private static IllegalArgumentException bad(){return new IllegalArgumentException("Signed BNB transaction differs from review or is noncanonical");}
    private static byte[] list(byte[][] fields){
        ByteArrayOutputStream payload=new ByteArrayOutputStream();for(byte[] field:fields){
            if(field.length==1&&(field[0]&255)<128)payload.write(field[0]);
            else{prefix(payload,field.length,128);payload.write(field,0,field.length);}
        }
        byte[] body=payload.toByteArray();ByteArrayOutputStream result=new ByteArrayOutputStream();prefix(result,body.length,192);result.write(body,0,body.length);return result.toByteArray();
    }
    private static void prefix(ByteArrayOutputStream out,int length,int base){
        if(length<56){out.write(base+length);return;}
        byte[] bytes=BigInteger.valueOf(length).toByteArray();if(bytes[0]==0)bytes=Arrays.copyOfRange(bytes,1,bytes.length);
        out.write(base+55+bytes.length);out.write(bytes,0,bytes.length);
    }
    private static final class Cursor {
        final byte[] data;int position;
        Cursor(byte[] data){this.data=data;}
        int read(){if(position>=data.length)throw bad();return data[position++]&255;}
        int length(int count){if(count<1||count>2)throw bad();int value=read();if(value==0)throw bad();for(int i=1;i<count;i++)value=(value<<8)|read();if(value<56)throw bad();return value;}
        int listEnd(){int first=read();if(first<192)throw bad();int size=first<=247?first-192:length(first-247);if(size>data.length-position)throw bad();return position+size;}
        byte[] bytes(){int first=read();if(first<128)return new byte[]{(byte)first};if(first>=192)throw bad();int size=first<=183?first-128:length(first-183);if(size>data.length-position)throw bad();byte[] value=Arrays.copyOfRange(data,position,position+size);position+=size;if(size==1&&(value[0]&255)<128)throw bad();return value;}
    }
    private BnbSignedTransaction(){}
}
