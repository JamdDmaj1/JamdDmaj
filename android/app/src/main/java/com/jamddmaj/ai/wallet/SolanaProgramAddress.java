package com.jamddmaj.ai.wallet;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.List;
import org.bouncycastle.math.ec.rfc7748.X25519Field;

/** Public-address derivation only; no private keys or signing capabilities.
 * Matches Solana Pubkey::try_find_program_address and Dalek decompression.
 * Field arithmetic uses the already pinned Bouncy Castle implementation.
 */
final class SolanaProgramAddress {
    private static final byte[] MARKER="ProgramDerivedAddress".getBytes(StandardCharsets.US_ASCII);
    // Edwards d = -121665/121666 mod (2^255-19), little endian.
    private static final byte[] D={ (byte)0xa3,0x78,0x59,0x13,(byte)0xca,0x4d,(byte)0xeb,0x75,(byte)0xab,(byte)0xd8,0x41,0x41,0x4d,0x0a,0x70,0x00,(byte)0x98,(byte)0xe8,0x79,0x77,0x79,0x40,(byte)0xc7,(byte)0x8c,0x73,(byte)0xfe,0x6f,0x2b,(byte)0xee,0x6c,0x03,0x52 };
    static final class Derived {
        final int bump;
        private final byte[] key;
        private Derived(byte[] key,int bump){this.key=key.clone();this.bump=bump;}
        byte[] key(){return key.clone();}
        String address(){return DevnetSolana.encode(key);}
    }
    private SolanaProgramAddress(){}
    static Derived find(String program,List<byte[]> input){
        byte[] programKey=DevnetSolana.decode(program,32);
        if(input==null||input.size()>15)throw invalid();
        List<byte[]> seeds=new ArrayList<>();
        for(byte[] seed:input){if(seed==null||seed.length>32)throw invalid();seeds.add(seed.clone());}
        try{
            for(int bump=255;bump>0;bump--){
                MessageDigest sha=MessageDigest.getInstance("SHA-256");
                for(byte[] seed:seeds)sha.update(seed);
                sha.update((byte)bump);sha.update(programKey);sha.update(MARKER);
                byte[] address=sha.digest();
                if(!isCurvePoint(address))return new Derived(address,bump);
            }
        }catch(java.security.NoSuchAlgorithmException impossible){throw new IllegalStateException("SHA-256 unavailable",impossible);}
        throw invalid();
    }
    static boolean isCurvePoint(byte[] compressed){
        if(compressed==null||compressed.length!=32)throw invalid();
        int[] y=X25519Field.create(),yy=X25519Field.create(),u=X25519Field.create(),v=X25519Field.create(),d=X25519Field.create(),x=X25519Field.create();
        // Dalek masks the sign bit, reduces noncanonical y, and accepts either
        // sign even when x=0. Do not substitute an Ed25519 key-validity check:
        // low-order points are still ON curve and invalid PDA candidates.
        X25519Field.decode(compressed,0,y);X25519Field.normalize(y);
        X25519Field.decode(D,0,d);X25519Field.sqr(y,yy);
        X25519Field.copy(yy,0,u,0);X25519Field.subOne(u);X25519Field.normalize(u);
        X25519Field.mul(yy,d,v);X25519Field.addOne(v);X25519Field.normalize(v);
        return X25519Field.sqrtRatioVar(u,v,x);
    }
    private static IllegalArgumentException invalid(){return new IllegalArgumentException("Invalid program address seeds");}
}
