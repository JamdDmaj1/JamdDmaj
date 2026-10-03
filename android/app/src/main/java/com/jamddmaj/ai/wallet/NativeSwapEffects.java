package com.jamddmaj.ai.wallet;

import java.io.IOException;
import java.math.BigInteger;
import org.json.JSONArray;
import org.json.JSONObject;

/** Verifies simulated wallet changes against the exact reviewed input and minimum output. */
final class NativeSwapEffects {
    final BigInteger output, solChange, rentLocked;
    private NativeSwapEffects(BigInteger output,BigInteger solChange,BigInteger rentLocked) {
        this.output=output; this.solChange=solChange; this.rentLocked=rentLocked;
    }
    static NativeSwapEffects inspect(NativeSwapPreparation preparation,NativeSwapChainState.Result before,
            JSONArray after,BigInteger fee,BigInteger rentMinimum) throws Exception {
        if(after==null || after.length()!=3 || after.isNull(0) || fee.signum()<0 || rentMinimum.signum()<=0) throw invalid();
        JSONObject payer=after.getJSONObject(0),source=after.isNull(1)?null:after.getJSONObject(1),destination=after.isNull(2)?null:after.getJSONObject(2);
        if(!NativeSwapSetup.SYSTEM.equals(payer.get("owner")) || !Boolean.FALSE.equals(payer.get("executable"))
                || NativeSwapChainState.data(payer).length!=0) throw invalid();
        BigInteger sol=NativeSwapChainState.lamports(payer),input=new BigInteger(preparation.intent.amount);
        boolean nativeInput=NativeSwapSetup.SOL.equals(preparation.intent.inputMint),nativeOutput=NativeSwapSetup.SOL.equals(preparation.intent.outputMint);
        BigInteger sourceRent=BigInteger.ZERO,destinationRent=BigInteger.ZERO;
        if(nativeInput) { if(source!=null) throw invalid(); }
        else {
            BigInteger remaining=NativeSwapChainState.token(source,preparation.intent.payer,preparation.intent.inputMint,false);
            if(!before.sourceBalance.subtract(remaining).equals(input)) throw invalid();
            sourceRent=rent(before.sourceLamports,NativeSwapChainState.lamports(source),rentMinimum);
        }
        BigInteger received;
        if(nativeOutput) {
            if(destination!=null) throw invalid();
            received=sol.subtract(before.solBalance).add(fee).add(sourceRent).subtract(before.destinationLamports);
        } else {
            received=NativeSwapChainState.token(destination,preparation.intent.payer,preparation.intent.outputMint,false).subtract(before.destinationBalance);
            destinationRent=rent(before.destinationLamports,NativeSwapChainState.lamports(destination),rentMinimum);
            BigInteger expected=before.solBalance.subtract(fee).subtract(sourceRent).subtract(destinationRent);
            if(nativeInput) expected=expected.subtract(input).add(before.sourceLamports);
            if(!sol.equals(expected)) throw invalid();
        }
        if(received.compareTo(preparation.minimumOut)<0) throw invalid();
        return new NativeSwapEffects(received,sol.subtract(before.solBalance),sourceRent.add(destinationRent));
    }
    private static BigInteger rent(BigInteger before,BigInteger after,BigInteger minimum) throws IOException {
        if(before.signum()==0) { if(!after.equals(minimum)) throw invalid(); return after; }
        if(!before.equals(after)) throw invalid();
        return BigInteger.ZERO;
    }
    private static IOException invalid() { return new IOException("Simulated wallet changes differ from swap intent"); }
}
