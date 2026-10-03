package com.jamddmaj.ai.wallet;

import java.io.IOException;
import java.math.BigDecimal;
import java.math.BigInteger;
import java.util.Arrays;

/** Immutable display snapshot. It does not itself grant permission to sign or submit. */
final class NativeSwapReview {
    final String payer,inputMint,outputMint,inputAmount,minimumOutput,simulatedOutput,feeSol,rentSol;
    final int slippageBps;
    private final byte[] message;
    private final NativeSwapService.Clock clock;
    private final long started,expiresAt,wallAtCreation;
    NativeSwapReview(NativeSwapService.Preview preview,NativeSwapService.Clock clock) throws IOException {
        if(preview==null || clock==null || preview.simulation.effects==null
                || !preview.simulation.matches(preview.candidate.message)) throw new IOException("Incomplete swap review evidence");
        var preparation=preview.candidate.preparation;
        payer=preparation.intent.payer; inputMint=preparation.intent.inputMint; outputMint=preparation.intent.outputMint;
        inputAmount=decimal(new BigInteger(preparation.intent.amount),preview.balances.inputDecimals);
        minimumOutput=decimal(preparation.minimumOut,preview.balances.outputDecimals);
        simulatedOutput=decimal(preview.simulation.effects.output,preview.balances.outputDecimals);
        feeSol=decimal(preview.simulation.fee,9); rentSol=decimal(preview.simulation.effects.rentLocked,9);
        slippageBps=preparation.intent.slippageBps;
        message=preview.candidate.message.bytes(); this.clock=clock; started=clock.elapsed();
        wallAtCreation=clock.wall(); expiresAt=preparation.expiresAt;
        requireCurrent(payer,preview.candidate.message);
    }
    void requireCurrent(String selectedPayer,SolanaMessage candidate) throws IOException {
        long elapsed=clock.elapsed()-started,wall=clock.wall();
        if(!payer.equals(selectedPayer) || candidate==null || !Arrays.equals(message,candidate.bytes())
                || elapsed<0 || elapsed>=15000 || wall<wallAtCreation || wall>=expiresAt
                || elapsed>=expiresAt-wallAtCreation) throw new IOException("Swap review changed or expired; review again");
    }
    String description(boolean spanish) {
        return "Solana MAINNET\n\n"+(spanish?"Billetera: ":"Wallet: ")+payer+
            "\n\n"+(spanish?"Token entregado: ":"Input token: ")+inputMint+
            "\n"+(spanish?"Cantidad exacta: ":"Exact amount: ")+inputAmount+
            "\n\n"+(spanish?"Token recibido: ":"Output token: ")+outputMint+
            "\n"+(spanish?"Mínimo recibido: ":"Minimum received: ")+minimumOutput+
            "\n"+(spanish?"Resultado simulado (no garantizado): ":"Simulated output (not guaranteed): ")+simulatedOutput+
            "\n\n"+(spanish?"Comisión SOL: ":"SOL fee: ")+feeSol+
            "\n"+(spanish?"SOL reservado en cuentas de tokens: ":"SOL reserved in token accounts: ")+rentSol+
            "\n"+(spanish?"Deslizamiento máximo: ":"Maximum slippage: ")+decimal(BigInteger.valueOf(slippageBps),2)+"%";
    }
    private static String decimal(BigInteger units,int decimals) { return new BigDecimal(units,decimals).toPlainString(); }
}
