package com.jamddmaj.ai.wallet;

import java.util.Arrays;
import org.bouncycastle.math.ec.rfc8032.Ed25519;
import org.junit.Test;
import static org.junit.Assert.*;

public class NativePerpsSignedEnvelopeTest {
    private static NativePerpsTransaction prepared(){return NativePerpsTransaction.decode(NativePerpsTransactionTest.fixture(),NativePerpsTransactionTest.payer());}
    private static byte[] signature(NativePerpsTransaction transaction,int seed){
        byte[] message=transaction.message.bytes(),signature=new byte[64];
        // Deterministic fixture keys only; never a real wallet or network send.
        Ed25519.sign(NativePerpsTransactionTest.seed(seed),0,message,0,message.length,signature,0);return signature;
    }
    @Test public void attachesOnlyOwnerSignatureAndPreservesPartialKeeperEnvelope(){
        NativePerpsTransaction transaction=prepared();byte[] signature=signature(transaction,1),original=transaction.bytes();
        NativePerpsSignedEnvelope signed=NativePerpsSignedEnvelope.attach(transaction,signature);byte[] wire=signed.bytes();
        assertEquals(3,wire[0]);assertEquals(DevnetSolana.encode(signature),signed.transactionId);
        assertArrayEquals(signature,Arrays.copyOfRange(wire,1,65));
        assertArrayEquals(Arrays.copyOfRange(original,65,original.length),Arrays.copyOfRange(wire,65,wire.length));
        assertArrayEquals(original,transaction.bytes());signature[0]^=1;wire[1]^=1;
        assertArrayEquals(Arrays.copyOfRange(signed.bytes(),1,65),DevnetSolana.decode(signed.transactionId,64));
    }
    @Test public void rejectsAnotherSignerChangedSignatureAndMissingInput(){
        NativePerpsTransaction transaction=prepared();
        assertThrows(IllegalArgumentException.class,()->NativePerpsSignedEnvelope.attach(transaction,signature(transaction,2)));
        byte[] changed=signature(transaction,1);changed[0]^=1;
        assertThrows(IllegalArgumentException.class,()->NativePerpsSignedEnvelope.attach(transaction,changed));
        for(byte[] bad:new byte[][]{null,new byte[0],new byte[63],new byte[64],new byte[65]})
            assertThrows(IllegalArgumentException.class,()->NativePerpsSignedEnvelope.attach(transaction,bad));
        assertThrows(IllegalArgumentException.class,()->NativePerpsSignedEnvelope.attach(null,new byte[64]));
    }
    @Test public void rejectsSignatureForDifferentMessage(){
        NativePerpsTransaction transaction=prepared();byte[] message=transaction.message.bytes();message[message.length-1]^=1;
        byte[] signature=new byte[64];Ed25519.sign(NativePerpsTransactionTest.seed(1),0,message,0,message.length,signature,0);
        assertThrows(IllegalArgumentException.class,()->NativePerpsSignedEnvelope.attach(transaction,signature));
    }
}
