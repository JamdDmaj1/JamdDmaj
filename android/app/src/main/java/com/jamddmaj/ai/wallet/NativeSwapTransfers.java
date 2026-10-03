package com.jamddmaj.ai.wallet;

import android.content.Context;
import android.util.Base64;
import java.io.IOException;
import java.util.function.BooleanSupplier;
import org.bouncycastle.math.ec.rfc8032.Ed25519;
import org.json.JSONArray;
import org.json.JSONObject;

/** Manual native swap lifecycle. Not connected to the launcher until acceptance testing. */
final class NativeSwapTransfers {
    private final NativeWalletProfiles.Profile owner;
    private final NativeSwapService service;
    private final NativeTransferJournal journal;
    private final NativeWalletRpc rpc;
    NativeSwapTransfers(Context context,NativeWalletProfiles.Profile owner) throws Exception {
        this(context,owner,new NativeSwapService(),null);
    }
    NativeSwapTransfers(Context context,NativeWalletProfiles.Profile owner,NativeSwapService service,NativeWalletRpc.Transport fixture) throws Exception {
        this.owner=owner; this.service=service;
        journal=new NativeTransferJournal(context,owner,WalletNetwork.SOLANA_MAINNET);
        rpc=new NativeWalletRpc(WalletNetwork.SOLANA_MAINNET,fixture);
    }
    static final class Draft {
        final NativeSwapReview review;
        private final NativeSwapService.Preview preview;
        private boolean consumed;
        private Draft(NativeSwapService.Preview preview,NativeSwapReview review){this.preview=preview;this.review=review;}
    }
    Draft prepare(NativeSwapPreparation.Intent intent) throws Exception {
        if(!owner.solanaAddress.equals(intent.payer)) throw new IOException("Swap wallet mismatch");
        journal.requireNoPending();
        var preview=service.preview(intent);
        return new Draft(preview,service.review(preview));
    }
    byte[] signReviewed(Draft draft,byte[] entropy,SolanaNativeTransfers.Signer signer,BooleanSupplier foreground) throws Exception {
        synchronized(draft) {
            require(draft,foreground); journal.requireNoPending();
            if(!owner.solanaAddress.equals(signer.address(entropy))) throw new IOException("Unlocked wallet differs from review");
            byte[] signature=signer.sign(entropy,draft.preview.candidate.message.bytes());
            verify(draft,signature); require(draft,foreground); return signature;
        }
    }
    String submit(Draft draft,byte[] signature,BooleanSupplier foreground) throws Exception {
        synchronized(draft) {
            require(draft,foreground);
            byte[] approved=signature==null?null:signature.clone(); verify(draft,approved);
            journal.requireNoPending();
            var current=service.revalidate(draft.preview,draft.review,owner.solanaAddress);
            rpc.verifyNetwork();
            String wire=Base64.encodeToString(DevnetSolana.wire(current.candidate.message.bytes(),approved),Base64.NO_WRAP);
            JSONObject simulation=(JSONObject)rpc.request("simulateTransaction",new JSONArray().put(wire)
                .put(new JSONObject().put("encoding","base64").put("sigVerify",true).put("replaceRecentBlockhash",false)
                    .put("commitment","confirmed").put("minContextSlot",current.simulation.slot)));
            JSONObject result=simulation.getJSONObject("value");
            if(!result.has("err") || !result.isNull("err")) throw new IOException("Signed swap simulation failed");
            require(draft,foreground); draft.consumed=true;
            String expected=DevnetSolana.encode(approved);
            journal.beginSwap(expected,current);
            if(!foreground.getAsBoolean()) throw new IOException("Wallet locked; check transaction status");
            Object response=rpc.request("sendTransaction",new JSONArray().put(wire).put(new JSONObject()
                .put("encoding","base64").put("skipPreflight",false).put("preflightCommitment","confirmed").put("maxRetries",0)));
            if(!expected.equals(response)) throw new IOException("Unknown submission result; do not resend");
            journal.submitted(expected); return expected;
        }
    }
    private void require(Draft draft,BooleanSupplier foreground) throws IOException {
        if(draft.consumed || !foreground.getAsBoolean()) throw new IOException("Swap authorization unavailable");
        draft.review.requireCurrent(owner.solanaAddress,draft.preview.candidate.message);
    }
    private void verify(Draft draft,byte[] signature) throws IOException {
        byte[] message=draft.preview.candidate.message.bytes();
        if(signature==null || signature.length!=64 || !Ed25519.verify(signature,0,DevnetSolana.decode(owner.solanaAddress,32),0,message,0,message.length))
            throw new IOException("Signature differs from reviewed swap");
    }
}
