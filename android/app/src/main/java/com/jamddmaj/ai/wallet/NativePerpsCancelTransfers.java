package com.jamddmaj.ai.wallet;

import android.content.Context;
import java.io.IOException;
import java.math.BigInteger;
import java.util.Arrays;
import java.util.function.BooleanSupplier;

/** One explicit native biometric authorization for exactly one cancellation. */
final class NativePerpsCancelTransfers {
    static final class Draft {final NativePerpsCancelService.Review review;private boolean signed,consumed;private Draft(NativePerpsCancelService.Review r){review=r;}}
    private final NativeWalletProfiles.Profile owner;private final NativePerpsCancelService service;private final NativeTransferJournal journal;private final NativePerpsBroadcast broadcaster;private Draft current;
    NativePerpsCancelTransfers(Context c,NativeWalletProfiles.Profile p)throws Exception{this(c,p,new NativePerpsCancelService(),NativePerpsBroadcast.live());}
    NativePerpsCancelTransfers(Context c,NativeWalletProfiles.Profile p,NativePerpsCancelService s,NativePerpsBroadcast.Transport t)throws Exception{
        if(p==null||s==null)throw new IllegalArgumentException("Missing cancellation owner");owner=p;service=s;journal=new NativeTransferJournal(c,p,WalletNetwork.SOLANA_MAINNET);broadcaster=new NativePerpsBroadcast(journal,t);
    }
    synchronized Draft prepare(NativePerpsCancelIntent intent)throws Exception{if(intent==null||!owner.solanaAddress.equals(intent.payer))throw new IOException("Wrong cancellation wallet");journal.requireNoPending();current=new Draft(service.review(intent));return current;}
    void invalidate(){service.invalidate();}
    void requireReview(Draft d,BooleanSupplier foreground)throws Exception{if(d==null||d!=current||d.consumed||foreground==null||!foreground.getAsBoolean())throw new IOException("Cancellation authorization unavailable");service.requireCurrentReview(d.review);}
    byte[] signReviewed(Draft d,byte[] entropy,SolanaNativeTransfers.Signer signer,BooleanSupplier foreground)throws Exception{
        if(d==null)throw new IOException("Missing cancellation draft");synchronized(d){requireReview(d,foreground);if(d.signed||signer==null)throw new IOException("Cancellation signer already used");
            journal.requireNoPending();service.revalidate(d.review);requireReview(d,foreground);if(!owner.solanaAddress.equals(signer.address(entropy)))throw new IOException("Unlocked wallet differs from cancellation");byte[] signature=null;
            try{d.signed=true;signature=signer.sign(entropy,d.review.transaction.message.bytes());NativePerpsSignedEnvelope.attach(d.review.transaction,signature);requireReview(d,foreground);byte[] result=signature;signature=null;return result;}
            finally{if(signature!=null)Arrays.fill(signature,(byte)0);}}
    }
    String submit(Draft d,byte[] signature,BooleanSupplier foreground)throws Exception{
        if(d==null)throw new IOException("Missing cancellation draft");synchronized(d){requireReview(d,foreground);if(!d.signed)throw new IOException("Cancellation not authorized");NativePerpsSignedEnvelope envelope=NativePerpsSignedEnvelope.attach(d.review.transaction,signature);
            journal.requireNoPending();BigInteger slot=service.revalidate(d.review);requireReview(d,foreground);d.consumed=true;return broadcaster.submitCancellation(envelope,d.review.intent,d.review.amounts.fee,slot,foreground);}
    }
}
