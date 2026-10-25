package com.jamddmaj.ai.wallet;

import android.content.Context;
import java.io.IOException;
import java.util.Arrays;
import java.util.function.BooleanSupplier;

/** Native biometric-bound full-close lifecycle; no WebView signing bridge. */
final class NativePerpsCloseTransfers {
    static final class Draft {
        final NativePerpsCloseService.Review review;private boolean signed,consumed;
        private Draft(NativePerpsCloseService.Review review){this.review=review;}
    }
    private final NativeWalletProfiles.Profile owner;private final NativePerpsCloseService service;private final NativeTransferJournal journal;private final NativePerpsBroadcast broadcaster;
    private Draft current;
    private final NativePerpsSettlementStore settlements;
    NativePerpsCloseTransfers(Context context,NativeWalletProfiles.Profile owner)throws Exception{this(context,owner,new NativePerpsCloseService(),NativePerpsBroadcast.live());}
    NativePerpsCloseTransfers(Context context,NativeWalletProfiles.Profile owner,NativePerpsCloseService service,NativePerpsBroadcast.Transport transport)throws Exception{
        if(owner==null||service==null)throw new IllegalArgumentException("Missing native close wallet");this.owner=owner;this.service=service;
        journal=new NativeTransferJournal(context,owner,WalletNetwork.SOLANA_MAINNET);broadcaster=new NativePerpsBroadcast(journal,transport);
        settlements=new NativePerpsSettlementStore(context,owner);
    }
    synchronized Draft prepare(String asset,int side,String price,int bps)throws Exception{journal.requireNoPending();current=new Draft(service.review(owner.solanaAddress,asset,side,price,bps));return current;}
    void invalidate(){service.invalidate();}
    void requireReview(Draft draft,BooleanSupplier foreground)throws Exception{
        if(draft==null||draft!=current||draft.consumed||foreground==null||!foreground.getAsBoolean())throw new IOException("Native close authorization unavailable");service.requireCurrentReview(draft.review);
    }
    byte[] signReviewed(Draft draft,byte[] entropy,SolanaNativeTransfers.Signer signer,BooleanSupplier foreground)throws Exception{
        if(draft==null)throw new IOException("Missing native close draft");synchronized(draft){
            requireReview(draft,foreground);if(draft.signed||signer==null)throw new IOException("Close signer already used or unavailable");
            journal.requireNoPending();service.revalidate(draft.review);requireReview(draft,foreground);
            if(!owner.solanaAddress.equals(signer.address(entropy)))throw new IOException("Unlocked wallet differs from close review");byte[] signature=null;
            try{draft.signed=true;signature=signer.sign(entropy,draft.review.transaction.message.bytes());NativePerpsSignedEnvelope.attach(draft.review.transaction,signature);
                requireReview(draft,foreground);byte[] result=signature;signature=null;return result;
            }finally{if(signature!=null)Arrays.fill(signature,(byte)0);}
        }
    }
    String submit(Draft draft,byte[] signature,BooleanSupplier foreground)throws Exception{
        if(draft==null)throw new IOException("Missing native close draft");synchronized(draft){
            requireReview(draft,foreground);if(!draft.signed)throw new IOException("Close was not authorized");NativePerpsSignedEnvelope envelope=NativePerpsSignedEnvelope.attach(draft.review.transaction,signature);
            journal.requireNoPending();java.math.BigInteger minimumSlot=service.revalidate(draft.review);requireReview(draft,foreground);draft.consumed=true;
            settlements.remember(envelope,draft.review.intent,draft.review.amounts,minimumSlot);
            requireReviewBeforeSend(foreground);
            return broadcaster.submitClose(envelope,draft.review.intent,draft.review.amounts.networkFee,minimumSlot,foreground);
        }
    }
    private void requireReviewBeforeSend(BooleanSupplier foreground)throws Exception{if(!foreground.getAsBoolean())throw new IOException("Wallet locked before close submission");}
}
