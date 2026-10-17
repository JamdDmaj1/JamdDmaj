package com.jamddmaj.ai.wallet;

import java.nio.ByteBuffer;
import java.util.Arrays;
import org.bouncycastle.math.ec.rfc8032.Ed25519;
import org.junit.Test;
import static org.junit.Assert.*;

public class NativePerpsTransactionTest {
    static byte[] seed(int value){byte[] seed=new byte[32];Arrays.fill(seed,(byte)value);return seed;}
    static byte[] publicKey(int value){byte[] key=new byte[32];Ed25519.generatePublicKey(seed(value),0,key,0);return key;}
    static String payer(){return DevnetSolana.encode(publicKey(1));}
    static byte[] fixture() { return fixture(1); }
    static byte[] fixture(int readonlySigners) {
        byte[] data=NativePerpsInstructionDataTest.increase(true);
        ByteBuffer b=ByteBuffer.allocate(4+128+32+1+6+data.length);
        b.put(new byte[]{3,(byte)readonlySigners,1,4}).put(publicKey(1)).put(publicKey(2)).put(publicKey(3)).put(publicKey(4));
        b.put(new byte[32]).put(new byte[]{1,3,3,0,1,2,(byte)data.length}).put(data);
        byte[] message=b.array(),wire=new byte[193+message.length];wire[0]=3;
        Ed25519.sign(seed(3),0,message,0,message.length,wire,129);
        System.arraycopy(message,0,wire,193,message.length);return wire;
    }
    @Test public void preservesExactMessageAndExistingCosignatureWithoutGivingSigningAuthority() {
        byte[] input=fixture();NativePerpsTransaction decoded=NativePerpsTransaction.decode(input,payer());
        assertArrayEquals(input,decoded.bytes());
        assertEquals(3,decoded.message.signatures);
        assertEquals(2,decoded.message.instructions.get(0).accounts()[2]);
        assertArrayEquals(Arrays.copyOfRange(input,129,193),decoded.signature(2));
        byte[] expected=decoded.bytes();input[1]=1;decoded.bytes()[129]^=1;decoded.signature(2)[0]^=1;
        assertArrayEquals(expected,decoded.bytes());
    }
    @Test public void rejectsPayerMismatchMissingOrCorruptProviderSignature() {
        assertThrows(IllegalArgumentException.class,()->NativePerpsTransaction.decode(fixture(),DevnetSolana.encode(publicKey(5))));
        for(int offset:new int[]{129,200}) {
            byte[] bad=fixture();bad[offset]^=1;
            assertThrows(IllegalArgumentException.class,()->NativePerpsTransaction.decode(bad,payer()));
        }
        byte[] absent=fixture();Arrays.fill(absent,129,193,(byte)0);
        assertThrows(IllegalArgumentException.class,()->NativePerpsTransaction.decode(absent,payer()));
    }
    @Test public void acceptsReadonlyKeeperWhenNoOracleUpdateNeedsItsWritableAccount() {
        assertEquals(2,NativePerpsTransaction.decode(fixture(2),payer()).message.readonlySigned);
        assertThrows(IllegalArgumentException.class,()->NativePerpsTransaction.decode(fixture(0),payer()));
    }
    @Test public void rejectsAlreadySignedOwnerOrKeeperAndNoncanonicalCount() {
        for(int offset:new int[]{0,1,65}) {
            byte[] bad=fixture();bad[offset]=1;
            assertThrows(IllegalArgumentException.class,()->NativePerpsTransaction.decode(bad,payer()));
        }
        byte[] bad=fixture();bad[0]=(byte)131;
        assertThrows(IllegalArgumentException.class,()->NativePerpsTransaction.decode(bad,payer()));
    }
    @Test public void rejectsTruncationTrailingBytesAndOversizeBeforeAnySignerCanRun() {
        byte[] valid=fixture();
        for(int length=0;length<valid.length;length++) {
            byte[] bad=Arrays.copyOf(valid,length);
            assertThrows(IllegalArgumentException.class,()->NativePerpsTransaction.decode(bad,payer()));
        }
        assertThrows(IllegalArgumentException.class,()->NativePerpsTransaction.decode(Arrays.copyOf(valid,1233),payer()));
        assertThrows(IllegalArgumentException.class,()->NativePerpsTransaction.decode(Arrays.copyOf(valid,valid.length+1),payer()));
        assertThrows(IllegalArgumentException.class,()->NativePerpsTransaction.decode(null,payer()));
    }
}
