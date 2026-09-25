package com.jamddmaj.ai.wallet;

/** Versioned interoperable derivation contract. Changes require a NEW profile, never reinterpretation. */
public final class WalletRecoveryProfile {
    public static final String ID = "bip39-256-sol501-evm60-v1";
    public static final int ENTROPY_BYTES = 32;
    public static final String SOLANA_PATH = "m/44'/501'/0'/0'";
    public static final String EVM_PATH = "m/44'/60'/0'/0/0";
    // The backup password encrypts the file. It is NOT an additional BIP39 passphrase.
    public static final String BIP39_PASSPHRASE = "";

    public static void validateEntropy(byte[] entropy) {
        if (entropy == null || entropy.length != ENTROPY_BYTES)
            throw new IllegalArgumentException("Expected 256-bit BIP39 entropy");
    }

    private WalletRecoveryProfile() {}
}
