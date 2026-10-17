package com.jamddmaj.ai.wallet;

import java.util.Arrays;
import org.bouncycastle.math.ec.rfc8032.Ed25519;

/** Structural decoding of Jupiter's partially signed instant transaction.
 * This is NOT an approved order. Signer identities must be checked against
 * verified program state and every instruction/effect against native intent.
 * No signing, broadcasting, or replacement of signatures is exposed here.
 */
final class NativePerpsTransaction {
    final SolanaMessage message;
    private final byte[] originalWire;
    private NativePerpsTransaction(SolanaMessage message,byte[] wire){this.message=message;this.originalWire=wire;}
    static NativePerpsTransaction decode(byte[] input,String payer) {
        // Supported live format: owner and keeper unsigned, API signature present.
        // Never reuse the single-signature swap serializer for this format.
        if(input==null||input.length<194||input.length>1232||input[0]!=3)throw invalid();
        byte[] wire=input.clone(),bytes=Arrays.copyOfRange(wire,193,wire.length);
        SolanaMessage message=SolanaMessage.parse(bytes);
        if(message.signatures!=3||(message.readonlySigned!=1&&message.readonlySigned!=2)||!message.isWritable(0)
                ||!Arrays.equals(message.staticKey(0),DevnetSolana.decode(payer,32)))throw invalid();
        if(!empty(wire,1)||!empty(wire,65)||empty(wire,129))throw invalid();
        if(!Ed25519.verify(wire,129,message.staticKey(2),0,bytes,0,bytes.length))throw invalid();
        return new NativePerpsTransaction(message,wire);
    }
    byte[] bytes(){return originalWire.clone();}
    int checkOpeningAccountBindings(SolanaLookupTables.Resolved chainResolvedKeys){
        return NativePerpsAccountBindings.checkOpeningTransaction(message,chainResolvedKeys);
    }
    byte[] signature(int index){
        if(index<0||index>=3)throw invalid();
        return Arrays.copyOfRange(originalWire,1+64*index,65+64*index);
    }
    private static boolean empty(byte[] wire,int offset){for(int i=offset;i<offset+64;i++)if(wire[i]!=0)return false;return true;}
    private static IllegalArgumentException invalid(){return new IllegalArgumentException("Invalid perps transaction envelope");}
}
