package com.jamddmaj.ai.wallet;

import java.io.IOException;

/** Fixed diagnostic codes only; never display provider errors or wallet data. */
final class NativeSwapCheck extends IOException {
    enum Stage { INTENT, AMOUNT, PENDING, NETWORK, MINT, QUOTE, DECODE, DECODE_TIME, COMPILE, ROUTE, BALANCE, SIMULATION }
    final Stage stage;
    private NativeSwapCheck(Stage stage,Exception cause) {
        super("SWAP_CHECK_"+stage.name(),cause); this.stage=stage;
    }
    interface Operation<T> { T run() throws Exception; }
    static <T> T at(Stage stage,Operation<T> operation) throws Exception {
        try { return operation.run(); }
        catch(NativeSwapCheck alreadyClassified) { throw alreadyClassified; }
        catch(Exception failure) {
            Stage classified=stage==Stage.DECODE && failure instanceof NativeSwapPreparation.TimeMismatch
                ?Stage.DECODE_TIME:stage;
            throw new NativeSwapCheck(classified,failure);
        }
    }
    static String publicCode(Exception failure) {
        return failure instanceof NativeSwapCheck?failure.getMessage():"SWAP_CHECK_PREPARATION";
    }
    static String describe(Exception failure,boolean es) {
        if(!(failure instanceof NativeSwapCheck))return es?"No se pudo preparar el intercambio. La cotización puede haber caducado. Revisa de nuevo.":"Could not prepare swap. The quote may have expired. Review again.";
        switch(((NativeSwapCheck)failure).stage) {
            case DECODE_TIME: return es?"La cotización caducó o la hora del teléfono no coincide. Activa fecha y hora automáticas y solicita una nueva revisión; no se reutilizará esta propuesta.":"The quote expired or the phone clock does not match. Enable automatic date and time and request a new review; this proposal will not be reused.";
            case AMOUNT: return es?"Introduce una cantidad positiva en el token que entregas, no dólares. Revisa sus decimales.":"Enter a positive amount in the input token, not dollars. Check its decimal precision.";
            case INTENT: return es?"Revisa las direcciones de los tokens: deben ser distintos y pertenecer a Solana.":"Check the token mint addresses: they must differ and belong to Solana.";
            case PENDING: return es?"Hay una operación pendiente o su registro no está disponible. Consulta la última operación de Solana antes de repetir.":"An operation is pending or its record is unavailable. Check the latest Solana operation before retrying.";
            case NETWORK: return es?"No se pudo verificar Solana mainnet. Comprueba tu conexión y vuelve a consultar.":"Could not verify Solana mainnet. Check your connection and try again.";
            case MINT: return es?"No se pudo verificar el token que entregas en Solana. Revisa su dirección o consulta de nuevo.":"Could not verify the input token on Solana. Check its mint address or try again.";
            case BALANCE: return es?"No se pudieron validar el saldo y las cuentas de esta billetera JamdDmaj. Necesitas saldo del token y SOL para los costes; el saldo de Phantom no se transfiere automáticamente.":"Could not validate this JamdDmaj wallet's balance and accounts. You need the input token and SOL for costs; Phantom's balance does not transfer automatically.";
            case QUOTE: return es?"El servicio de intercambio no devolvió una cotización. Vuelve a consultar más tarde.":"The swap service did not return a quote. Try again later.";
            default: return es?"No se pudo validar la operación propuesta. No se puede autorizar este intercambio; conserva el código de comprobación.":"The proposed operation could not be validated. This swap cannot be authorized; keep the check code.";
        }
    }
}
