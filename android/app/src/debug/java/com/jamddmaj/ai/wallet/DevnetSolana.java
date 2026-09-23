package com.jamddmaj.ai.wallet;

import java.math.BigInteger;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.Arrays;
import org.bouncycastle.math.ec.rfc8032.Ed25519;

/** Only single-instruction native-SOL messages for isolated devnet tests. */
public final class DevnetSolana {
    private static final String ALPHABET="123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    private static final BigInteger BASE=BigInteger.valueOf(58);
    public static String encode(byte[] input){
        BigInteger value=new BigInteger(1,input);StringBuilder out=new StringBuilder();
        while(value.signum()>0){BigInteger[] parts=value.divideAndRemainder(BASE);out.append(ALPHABET.charAt(parts[1].intValue()));value=parts[0];}
        for(byte b:input){if(b!=0)break;out.append('1');}return out.reverse().toString();
    }
    public static byte[] decode(String text,int length){
        if(text==null||text.length()>length*2||text.isEmpty())throw new IllegalArgumentException("Invalid base58");
        BigInteger value=BigInteger.ZERO;int zeros=0;while(zeros<text.length()&&text.charAt(zeros)=='1')zeros++;
        for(char c:text.toCharArray()){int digit=ALPHABET.indexOf(c);if(digit<0)throw new IllegalArgumentException("Invalid base58");value=value.multiply(BASE).add(BigInteger.valueOf(digit));}
        byte[] bytes=value.toByteArray();int start=bytes.length>0&&bytes[0]==0?1:0;
        int size=value.signum()==0?0:bytes.length-start;
        if(zeros+size!=length)throw new IllegalArgumentException("Invalid address length");
        byte[] result=new byte[length];if(size>0)System.arraycopy(bytes,start,result,zeros,size);
        if(!encode(result).equals(text))throw new IllegalArgumentException("Noncanonical base58");return result;
    }
    public static String address(byte[] seed){if(seed.length!=32)throw new IllegalArgumentException("Invalid seed");byte[] pub=new byte[32];Ed25519.generatePublicKey(seed,0,pub,0);return encode(pub);}
    public static long lamports(String amount){
        if(amount==null||amount.length()>20||!amount.matches("(0|[1-9][0-9]*)(\\.[0-9]{1,9})?"))throw new IllegalArgumentException("Invalid amount");
        long value=new java.math.BigDecimal(amount).movePointRight(9).longValueExact();if(value<1||value>100000000)throw new IllegalArgumentException("Limit 0.1 test SOL");return value;
    }
    public static byte[] message(String owner,String recipient,String blockhash,long amount){
        if(amount<1||amount>100000000||owner.equals(recipient))throw new IllegalArgumentException("Invalid transfer");
        byte[] to=decode(recipient,32);if(Arrays.equals(to,new byte[32]))throw new IllegalArgumentException("Invalid recipient");
        ByteBuffer buffer=ByteBuffer.allocate(150).order(ByteOrder.LITTLE_ENDIAN);
        buffer.put(new byte[]{1,0,1,3});buffer.put(decode(owner,32));buffer.put(to);buffer.put(new byte[32]);buffer.put(decode(blockhash,32));
        buffer.put(new byte[]{1,2,2,0,1,12});buffer.putInt(2);buffer.putLong(amount);return buffer.array();
    }
    public static byte[] sign(byte[] seed,byte[] message){byte[] signature=new byte[64];Ed25519.sign(seed,0,message,0,message.length,signature,0);return signature;}
    public static byte[] wire(byte[] message,byte[] signature){if(message.length!=150||signature.length!=64)throw new IllegalArgumentException("Invalid transaction");byte[] wire=new byte[215];wire[0]=1;System.arraycopy(signature,0,wire,1,64);System.arraycopy(message,0,wire,65,150);return wire;}
    private DevnetSolana(){}
}
