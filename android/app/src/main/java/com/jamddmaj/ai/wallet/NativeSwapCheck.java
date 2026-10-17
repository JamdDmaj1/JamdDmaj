package com.jamddmaj.ai.wallet;

import java.io.IOException;

/** Fixed diagnostic codes only; never display provider errors or wallet data. */
final class NativeSwapCheck extends IOException {
    enum Stage { INTENT, AMOUNT, PENDING, NETWORK, MINT, QUOTE, DECODE, COMPILE, ROUTE, BALANCE, SIMULATION }
    final Stage stage;
    private NativeSwapCheck(Stage stage,Exception cause) {
        super("SWAP_CHECK_"+stage.name(),cause); this.stage=stage;
    }
    interface Operation<T> { T run() throws Exception; }
    static <T> T at(Stage stage,Operation<T> operation) throws Exception {
        try { return operation.run(); }
        catch(NativeSwapCheck alreadyClassified) { throw alreadyClassified; }
        catch(Exception failure) { throw new NativeSwapCheck(stage,failure); }
    }
    static String publicCode(Exception failure) {
        return failure instanceof NativeSwapCheck?failure.getMessage():"SWAP_CHECK_PREPARATION";
    }
}
