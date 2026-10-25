package com.jamddmaj.ai.wallet;

import android.content.Context;
import android.util.Base64;
import java.io.IOException;
import java.util.function.BooleanSupplier;
import org.bouncycastle.math.ec.rfc8032.Ed25519;
import org.json.JSONArray;
import org.json.JSONObject;

/** Manual native exact-wire swap lifecycle; no automatic authorization or resend. */
final class NativeSwapTransfers {
    interface BeforeBroadcast {void record(String signature,NativeSwapService.Preview preview)throws Exception;}
    private volatile boolean invalidated;
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
        private boolean signed,consumed;
        private java.math.BigInteger settlementSlot;
        private Draft(NativeSwapService.Preview preview,NativeSwapReview review){this.preview=preview;this.review=review;}
    }
    Draft prepare(NativeSwapPreparation.Intent intent) throws Exception {
        if(!owner.solanaAddress.equals(intent.payer)) throw new IOException("Swap wallet mismatch");
        journal.requireNoPending();
        var preview=service.preview(intent);
        return new Draft(preview,service.review(preview));
    }
    Draft prepareSettlement(NativeSwapPreparation.Intent intent,java.math.BigInteger minimumSlot)throws Exception{
        if(minimumSlot==null||minimumSlot.signum()<=0||minimumSlot.bitLength()>64)throw new IOException("Missing finalized receipt bank");
        Draft draft=prepare(intent);draft.settlementSlot=minimumSlot;requireSettlement(draft,draft.preview);return draft;
    }
    private void requireSettlement(Draft draft,NativeSwapService.Preview evidence)throws IOException{
        if(draft.settlementSlot==null)return;
        if(evidence.balances.slot.compareTo(draft.settlementSlot)<0)throw new IOException("Swap balance predates the finalized close");
        if(NativeSwapSetup.SOL.equals(evidence.candidate.preparation.intent.inputMint)&&evidence.candidate.preparation.intent.wrapAndUnwrapSol&&evidence.balances.sourceBalance.signum()!=0)
            throw new IOException("Native conversion would also unwrap pre-existing WSOL; review that balance separately");
    }
    Draft prepareAmount(String inputMint,String outputMint,String amount,int slippageBps) throws Exception {
        // Validate addresses and limits before RPC; fetch precision from the chain, not the UI/provider.
        NativeSwapCheck.at(NativeSwapCheck.Stage.INTENT,()->new NativeSwapPreparation.Intent(owner.solanaAddress,inputMint,outputMint,"1",slippageBps));
        // Reject empty/invalid decimal input before any network access. Actual mint precision is checked below.
        NativeSwapCheck.at(NativeSwapCheck.Stage.AMOUNT,()->{NativeSwapAmounts.requirePositive(amount);return null;});
        NativeSwapCheck.at(NativeSwapCheck.Stage.PENDING,()->{journal.requireNoPending();return null;});
        NativeSwapCheck.at(NativeSwapCheck.Stage.NETWORK,()->{rpc.verifyNetwork();return null;});
        JSONObject response=NativeSwapCheck.at(NativeSwapCheck.Stage.MINT,()->(JSONObject)rpc.request("getAccountInfo",new JSONArray().put(inputMint)
            .put(new JSONObject().put("commitment","confirmed").put("encoding","base64")
                .put("dataSlice",new JSONObject().put("offset",0).put("length",83)))));
        int decimals=NativeSwapCheck.at(NativeSwapCheck.Stage.MINT,()->NativeSwapChainState.mint(response.isNull("value")?null:response.getJSONObject("value")));
        String exact=NativeSwapCheck.at(NativeSwapCheck.Stage.AMOUNT,()->NativeSwapAmounts.units(amount,decimals));
        return prepare(new NativeSwapPreparation.Intent(owner.solanaAddress,inputMint,outputMint,exact,slippageBps));
    }
    byte[] signReviewed(Draft draft,byte[] entropy,SolanaNativeTransfers.Signer signer,BooleanSupplier foreground) throws Exception {
        synchronized(draft) {
            require(draft,foreground); if(draft.signed)throw new IOException("Swap already signed");journal.requireNoPending();
            requireSettlement(draft,service.revalidate(draft.preview,draft.review,owner.solanaAddress));require(draft,foreground);
            if(!owner.solanaAddress.equals(signer.address(entropy))) throw new IOException("Unlocked wallet differs from review");
            draft.signed=true;byte[] signature=signer.sign(entropy,draft.preview.candidate.message.bytes());
            verify(draft,signature); require(draft,foreground); return signature;
        }
    }
    String submit(Draft draft,byte[] signature,BooleanSupplier foreground) throws Exception {
        return submit(draft,signature,foreground,(id,preview)->{});
    }
    String submit(Draft draft,byte[] signature,BooleanSupplier foreground,BeforeBroadcast beforeBroadcast) throws Exception {
        synchronized(draft) {
            require(draft,foreground);if(!draft.signed||beforeBroadcast==null)throw new IOException("Swap was not authorized");
            byte[] approved=signature==null?null:signature.clone(); verify(draft,approved);
            journal.requireNoPending();
            var current=service.revalidate(draft.preview,draft.review,owner.solanaAddress);
            requireSettlement(draft,current);
            rpc.verifyNetwork();
            String wire=Base64.encodeToString(wire(current.candidate.message,approved),Base64.NO_WRAP);
            JSONObject simulation=(JSONObject)rpc.request("simulateTransaction",new JSONArray().put(wire)
                .put(new JSONObject().put("encoding","base64").put("sigVerify",true).put("replaceRecentBlockhash",false)
                    .put("commitment","confirmed").put("minContextSlot",current.simulation.slot)));
            NativeSwapSimulation.validateResponse(simulation,current.simulation.slot);
            require(draft,foreground); draft.consumed=true;
            String expected=DevnetSolana.encode(approved);
            journal.beginSwap(expected,current);
            beforeBroadcast.record(expected,current);
            if(!foreground.getAsBoolean()) throw new IOException("Wallet locked; check transaction status");
            Object response=rpc.request("sendTransaction",new JSONArray().put(wire).put(new JSONObject()
                .put("encoding","base64").put("skipPreflight",false).put("preflightCommitment","confirmed").put("maxRetries",0)));
            if(!expected.equals(response)) throw new IOException("Unknown submission result; do not resend");
            journal.submitted(expected); return expected;
        }
    }
    private void require(Draft draft,BooleanSupplier foreground) throws IOException {
        if(invalidated||draft.consumed || !foreground.getAsBoolean()) throw new IOException("Swap authorization unavailable");
        draft.review.requireCurrent(owner.solanaAddress,draft.preview.candidate.message);
    }
    void requireReview(Draft draft,BooleanSupplier foreground) throws IOException { synchronized(draft){require(draft,foreground);} }
    void invalidate(){invalidated=true;}
    private void verify(Draft draft,byte[] signature) throws IOException {
        byte[] message=draft.preview.candidate.message.bytes();
        if(signature==null || signature.length!=64 || !Ed25519.verify(signature,0,DevnetSolana.decode(owner.solanaAddress,32),0,message,0,message.length))
            throw new IOException("Signature differs from reviewed swap");
    }
    private static byte[] wire(SolanaMessage message,byte[] signature) throws IOException {
        byte[] bytes=message.bytes();
        if(message.signatures!=1 || signature.length!=64 || bytes.length>1167) throw new IOException("Invalid swap wire size");
        byte[] wire=new byte[65+bytes.length]; wire[0]=1;
        System.arraycopy(signature,0,wire,1,64); System.arraycopy(bytes,0,wire,65,bytes.length);
        return wire;
    }
}
