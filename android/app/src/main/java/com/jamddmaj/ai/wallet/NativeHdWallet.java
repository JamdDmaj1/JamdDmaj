package com.jamddmaj.ai.wallet;

import android.os.Build;
import java.util.Arrays;
import wallet.core.jni.CoinType;
import wallet.core.jni.Curve;
import wallet.core.jni.HDWallet;
import wallet.core.jni.PrivateKey;

/** Native-only derivation adapter. No storage, network, WebView bridge or automatic signing. */
public final class NativeHdWallet {
    private static final class Library {
        static { System.loadLibrary("TrustWalletCore"); }
        static void load() {}
    }
    static HDWallet open(byte[] entropy) {
        if (Build.VERSION.SDK_INT < 30) throw new UnsupportedOperationException("Android 11 or later required");
        WalletRecoveryProfile.validateEntropy(entropy);
        Library.load();
        byte[] temporary = entropy.clone();
        try { return new HDWallet(temporary, WalletRecoveryProfile.BIP39_PASSPHRASE); }
        finally { Arrays.fill(temporary, (byte) 0); }
    }
    public static final class Addresses {
        public final String solana, bnb;
        private Addresses(String solana, String bnb) { this.solana = solana; this.bnb = bnb; }
    }
    public static Addresses addresses(byte[] unlockedEntropy) {
        HDWallet wallet = open(unlockedEntropy);
        return new Addresses(
            CoinType.SOLANA.deriveAddress(wallet.getKey(CoinType.SOLANA, WalletRecoveryProfile.SOLANA_PATH)),
            CoinType.ETHEREUM.deriveAddress(wallet.getKey(CoinType.ETHEREUM, WalletRecoveryProfile.EVM_PATH)));
    }
    /** Caller must hold a native reviewed draft and freshly authorized vault access. */
    static byte[] signSolana(byte[] unlockedEntropy, byte[] reviewedMessage) {
        if (reviewedMessage == null || reviewedMessage.length == 0 || reviewedMessage.length > 1232)
            throw new IllegalArgumentException("Invalid Solana message");
        PrivateKey key = open(unlockedEntropy).getKey(CoinType.SOLANA, WalletRecoveryProfile.SOLANA_PATH);
        byte[] message = reviewedMessage.clone();
        try { return key.sign(message, Curve.ED25519); }
        finally { Arrays.fill(message, (byte) 0); }
    }
    private NativeHdWallet() {}
}
