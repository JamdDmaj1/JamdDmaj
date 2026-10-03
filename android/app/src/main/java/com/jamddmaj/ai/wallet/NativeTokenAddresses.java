package com.jamddmaj.ai.wallet;

import wallet.core.jni.SolanaAddress;

/** Public-address derivation through the pinned native SDK; no keys or signing. */
final class NativeTokenAddresses {
    private static final class Library {
        static { System.loadLibrary("TrustWalletCore"); }
        static void load() {}
    }
    static String associated(String owner,String mint,String program) {
        canonical(owner); canonical(mint);
        if (!NativeJupiterRoute.TOKEN.equals(program) && !NativeJupiterRoute.TOKEN_2022.equals(program))
            throw new IllegalArgumentException("Unsupported token program");
        Library.load();
        SolanaAddress address=new SolanaAddress(owner);
        String result=NativeJupiterRoute.TOKEN.equals(program)?address.defaultTokenAddress(mint):address.token2022Address(mint);
        canonical(result);
        return result;
    }
    private static void canonical(String value) {
        byte[] key=DevnetSolana.decode(value,32);
        if (!DevnetSolana.encode(key).equals(value)) throw new IllegalArgumentException("Invalid token address");
    }
    private NativeTokenAddresses() {}
}
