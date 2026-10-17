package com.jamddmaj.ai.wallet;

import java.util.Arrays;
import org.bouncycastle.math.ec.rfc8032.Ed25519;

/** Low-level envelope assembly after a separate owner-signing authorization.
 * Does not sign, approve an order, contact a keeper or broadcast a transaction.
 * Instant Jupiter transactions retain the empty keeper slot for its executor. */
final class NativePerpsSignedEnvelope {
    private final byte[] wire;
    final String transactionId;
    private NativePerpsSignedEnvelope(byte[] wire,byte[] signature){this.wire=wire;transactionId=DevnetSolana.encode(signature);}
    static NativePerpsSignedEnvelope attach(NativePerpsTransaction prepared,byte[] ownerSignature){
        if(prepared==null||ownerSignature==null||ownerSignature.length!=64)throw invalid();
        byte[] signature=ownerSignature.clone(),message=prepared.message.bytes();
        if(!Ed25519.verify(signature,0,prepared.message.staticKey(0),0,message,0,message.length))throw invalid();
        byte[] wire=prepared.bytes();
        System.arraycopy(signature,0,wire,1,64);
        // Never recompile the message, collapse signatures or replace the
        // provider's cosignature while attaching the owner's signature.
        if(wire[0]!=3||!Arrays.equals(Arrays.copyOfRange(wire,65,129),new byte[64])
                ||!Arrays.equals(Arrays.copyOfRange(wire,129,193),prepared.signature(2))
                ||!Arrays.equals(Arrays.copyOfRange(wire,193,wire.length),message))throw invalid();
        return new NativePerpsSignedEnvelope(wire,signature);
    }
    byte[] bytes(){return wire.clone();}
    private static IllegalArgumentException invalid(){return new IllegalArgumentException("Owner signature does not match exact prepared perps message");}
}
