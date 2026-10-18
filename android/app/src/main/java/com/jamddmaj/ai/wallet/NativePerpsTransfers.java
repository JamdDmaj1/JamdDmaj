package com.jamddmaj.ai.wallet;

import android.content.Context;
import java.io.IOException;
import java.util.Arrays;
import java.util.function.BooleanSupplier;

/** Manual lifecycle. UI must invoke signing only inside a bound biometric callback.
 * Not exposed through the WebView bridge or connected to submission buttons yet. */
final class NativePerpsTransfers {
    private final NativeWalletProfiles.Profile owner;
    private final NativePerpsService service;
    private final NativeTransferJournal journal;
    private final NativePerpsBroadcast broadcaster;
    private Draft current;
    static final class Draft {
        final NativePerpsService.Review review;
        private boolean signed,consumed;
        private Draft(NativePerpsService.Review review){this.review=review;}
    }
    NativePerpsTransfers(Context context,NativeWalletProfiles.Profile owner)throws Exception{
        this(context,owner,new NativePerpsService(),NativePerpsBroadcast.live());
    }
    NativePerpsTransfers(Context context,NativeWalletProfiles.Profile owner,NativePerpsService service,NativePerpsBroadcast.Transport transport)throws Exception{
        if(owner==null||service==null)throw new IllegalArgumentException("Missing perps wallet");
        this.owner=owner;this.service=service;journal=new NativeTransferJournal(context,owner,WalletNetwork.SOLANA_MAINNET);
        broadcaster=new NativePerpsBroadcast(journal,transport);
    }
    synchronized Draft prepare(NativePerpsOrderIntent intent)throws Exception{
        journal.requireNoPending();current=new Draft(service.review(owner.solanaAddress,intent));return current;
    }
    void invalidate(){service.invalidate();}
    void requireReview(Draft draft,BooleanSupplier foreground)throws Exception{
        if(draft==null||draft!=current||draft.consumed||foreground==null||!foreground.getAsBoolean())throw new IOException("Perps authorization unavailable");
        service.requireCurrentReview(draft.review);
    }
    byte[] signReviewed(Draft draft,byte[] entropy,SolanaNativeTransfers.Signer signer,BooleanSupplier foreground)throws Exception{
        if(draft==null)throw new IOException("Missing perps draft");
        synchronized(draft){
            requireReview(draft,foreground);if(draft.signed||signer==null)throw new IOException("Perps signing already used or unavailable");
            journal.requireNoPending();service.revalidate(draft.review);requireReview(draft,foreground);
            if(!owner.solanaAddress.equals(signer.address(entropy)))throw new IOException("Unlocked wallet differs from perps review");
            byte[] signature=null;
            try{
                // A failed/uncertain signer cannot be invoked again on this draft.
                draft.signed=true;signature=signer.sign(entropy,draft.review.analysis.transaction.message.bytes());
                NativePerpsSignedEnvelope.attach(draft.review.analysis.transaction,signature);requireReview(draft,foreground);
                byte[] result=signature;signature=null;return result;
            }finally{if(signature!=null)Arrays.fill(signature,(byte)0);}
        }
    }
    String submit(Draft draft,byte[] signature,BooleanSupplier foreground)throws Exception{
        if(draft==null)throw new IOException("Missing perps draft");
        synchronized(draft){
            requireReview(draft,foreground);if(!draft.signed)throw new IOException("Perps draft was not authorized");
            NativePerpsSignedEnvelope envelope=NativePerpsSignedEnvelope.attach(draft.review.analysis.transaction,signature);
            journal.requireNoPending();service.revalidate(draft.review);requireReview(draft,foreground);
            draft.consumed=true;
            return broadcaster.submit(envelope,draft.review.analysis.intent,draft.review.amounts.networkFeeLamports,foreground);
        }
    }
}
