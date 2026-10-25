package com.jamddmaj.ai.wallet;

import android.content.Context;
import java.io.IOException;
import java.math.BigDecimal;
import java.math.BigInteger;
import java.util.function.BooleanSupplier;

/** Explicit second leg. A native close approval never authorizes this swap. */
final class NativePerpsConversionTransfers {
    static final class Draft {
        final NativeSwapReview review;
        final NativePerpsSettlementStore.Close close;
        final NativePerpsSettlementReader.Payout payout;
        private final NativeSwapTransfers.Draft swap;
        private Draft(NativeSwapTransfers.Draft swap,NativePerpsSettlementStore.Close close,NativePerpsSettlementReader.Payout payout){this.swap=swap;review=swap.review;this.close=close;this.payout=payout;}
        String description(boolean es){return close.asset+" · "+(close.side==1?"Long":"Short")+"\n"+(es?"Conversión independiente del cierre finalizado: ":"Separate conversion of finalized close: ")+close.signature+
            "\n"+(es?"No utiliza el resto de tu saldo ni autoriza una nueva posición.\n\n":"Does not use the rest of your balance or authorize a new position.\n\n")+review.description(es);}
    }
    private final NativeWalletProfiles.Profile owner;
    private final NativePerpsSettlementStore store;
    private final NativePerpsSettlementReader reader;
    private final NativeSwapTransfers swaps;
    private final NativeTransferJournal journal;
    private Draft current;
    NativePerpsConversionTransfers(Context context,NativeWalletProfiles.Profile owner)throws Exception{this(context,owner,new NativePerpsSettlementReader(),new NativeSwapTransfers(context,owner));}
    NativePerpsConversionTransfers(Context context,NativeWalletProfiles.Profile owner,NativePerpsSettlementReader reader,NativeSwapTransfers swaps)throws Exception{
        this.owner=owner;this.reader=reader;this.swaps=swaps;store=new NativePerpsSettlementStore(context,owner);journal=new NativeTransferJournal(context,owner,WalletNetwork.SOLANA_MAINNET);
    }
    Draft prepare(String asset,int side)throws Exception{
        journal.requireNoPending();NativePerpsSettlementStore.Close close=store.latest(asset,side);if(close==null)throw new IOException("No recorded native close for this market and direction");
        if(close.conversion!=null){if(!reader.conversionFailed(owner.solanaAddress,close))throw new IOException("Conversion already executed or unresolved");store.releaseFailed(close);close=store.latest(asset,side);}
        store.requireAvailable(close);
        NativePerpsSettlementReader.Payout payout=reader.close(owner.solanaAddress,close);
        if(NativeSolanaTokens.USDC.equals(payout.mint))throw new IOException("This finalized close already returned USDC; no conversion is required");
        if(payout.amount.signum()<=0)throw new IOException("This close returned no convertible collateral");
        // Exact units come only from the finalized first leg, never from a UI
        // amount, quote estimate, total wallet balance or a server instruction.
        NativeSwapPreparation.Intent intent=new NativeSwapPreparation.Intent(owner.solanaAddress,payout.mint,NativeSolanaTokens.USDC,payout.amount.toString(),50,
            !NativeSwapSetup.SOL.equals(payout.mint)||payout.nativeSol);
        NativeSwapTransfers.Draft swap=swaps.prepareSettlement(intent,payout.slot);
        if(!new BigDecimal(swap.review.inputAmount).equals(new BigDecimal(payout.amount,close.decimals()))
                ||new BigDecimal(swap.review.minimumOutput).signum()<=0)throw new IOException("Conversion quantity or minimum differs from receipt");
        current=new Draft(swap,close,payout);return current;
    }
    void requireReview(Draft draft,BooleanSupplier foreground)throws Exception{
        if(draft==null||draft!=current)throw new IOException("Conversion review is not current");swaps.requireReview(draft.swap,foreground);store.requireAvailable(draft.close);
    }
    private void revalidate(Draft draft,BooleanSupplier foreground)throws Exception{
        requireReview(draft,foreground);NativePerpsSettlementReader.Payout payout=reader.close(owner.solanaAddress,draft.close);
        if(!payout.amount.equals(draft.payout.amount)||!payout.mint.equals(draft.payout.mint)||payout.nativeSol!=draft.payout.nativeSol)throw new IOException("Finalized close receipt changed");requireReview(draft,foreground);
    }
    byte[] signReviewed(Draft draft,byte[] entropy,SolanaNativeTransfers.Signer signer,BooleanSupplier foreground)throws Exception{
        revalidate(draft,foreground);return swaps.signReviewed(draft.swap,entropy,signer,foreground);
    }
    String submit(Draft draft,byte[] signature,BooleanSupplier foreground)throws Exception{
        revalidate(draft,foreground);
        return swaps.submit(draft.swap,signature,foreground,(id,preview)->{if(!foreground.getAsBoolean())throw new IOException("Wallet locked");store.requireAvailable(draft.close);store.reserve(draft.close,id,preview);});
    }
    String status(String asset,int side,boolean es)throws Exception{
        NativePerpsSettlementStore.Close close=store.latest(asset,side);if(close==null)throw new IOException("No native close receipt recorded");
        if(close.conversion!=null){BigInteger received;try{received=reader.conversion(owner.solanaAddress,close);}catch(Exception unverified){
                if(reader.conversionFailed(owner.solanaAddress,close))return es?"La conversión falló de forma finalizada. Puede haber comisión de red. Consulta la última operación antes de solicitar una revisión nueva.":"Conversion failed with finality. A network fee may have been charged. Check the latest operation before requesting a new review.";throw unverified;}
            return (es?"Conversión finalizada. Recibido: ":"Conversion finalized. Received: ")+new BigDecimal(received,6).toPlainString()+" USDC\n"+close.conversion.getString("signature");}
        NativePerpsSettlementReader.Payout payout=reader.close(owner.solanaAddress,close);
        return (es?"Cierre finalizado. Recibido: ":"Close finalized. Received: ")+new BigDecimal(payout.amount,close.decimals()).toPlainString()+" · "+payout.mint+
            (NativeSolanaTokens.USDC.equals(payout.mint)?(es?"\nYa está en USDC; no requiere conversión.":"\nAlready USDC; no conversion required."):(es?"\nLa conversión requiere revisión y huella separadas.":"\nConversion requires a separate review and biometric approval."));
    }
    void invalidate(){swaps.invalidate();current=null;}
}
