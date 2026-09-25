package com.jamddmaj.ai.wallet;

import java.nio.charset.StandardCharsets;
import java.util.Arrays;

/** Native-only storage identity. A namespace is isolation, not proof of user authentication. */
public final class WalletVaultDomain {
    public static final int SIZE = 64;
    public final String directory, walletId, alias;
    private final String authenticatedDomain;
    private final byte[] magic;

    private WalletVaultDomain(String directory, String id, String alias, String suffix, byte[] magic) {
        this.directory = directory;
        this.walletId = id;
        this.alias = alias;
        this.authenticatedDomain = alias + suffix;
        this.magic = magic;
    }

    private static void validate(String packageName, String id) {
        if (packageName == null || !packageName.matches("[A-Za-z][A-Za-z0-9_.]+") ||
            id == null || !id.matches("[a-f0-9]{32}")) throw new IllegalArgumentException("Invalid native wallet identity");
    }

    public static WalletVaultDomain devnet(String packageName, String id) {
        validate(packageName, id);
        return new WalletVaultDomain("jamddmaj-test-vaults", id, packageName + ".test-vault.v1." + id,
            ":solana:devnet:test-only", new byte[]{'J','T','V',1});
    }

    public static WalletVaultDomain production(String packageName, String nativeOwnerId, String id) {
        validate(packageName, id);
        validate(packageName, nativeOwnerId);
        return new WalletVaultDomain("jamddmaj-wallet-vaults/" + nativeOwnerId, id,
            packageName + ".wallet-vault.v1." + nativeOwnerId + "." + id,
            ":" + WalletRecoveryProfile.ID, new byte[]{'J','W','V',1});
    }

    public byte[] aad() { return authenticatedDomain.getBytes(StandardCharsets.UTF_8); }

    public byte[] encode(byte[] iv, byte[] ciphertext) {
        if (iv == null || iv.length != 12 || ciphertext == null || ciphertext.length != 48)
            throw new IllegalArgumentException("Invalid encrypted wallet envelope");
        byte[] result = new byte[SIZE];
        System.arraycopy(magic, 0, result, 0, 4);
        System.arraycopy(iv, 0, result, 4, 12);
        System.arraycopy(ciphertext, 0, result, 16, 48);
        return result;
    }

    public void validate(byte[] encoded) {
        if (encoded == null || encoded.length != SIZE || !Arrays.equals(magic, Arrays.copyOf(encoded, 4)))
            throw new IllegalArgumentException("Wrong wallet domain or damaged encrypted vault");
    }
    public byte[] iv(byte[] encoded) { validate(encoded); return Arrays.copyOfRange(encoded, 4, 16); }
    public byte[] ciphertext(byte[] encoded) { validate(encoded); return Arrays.copyOfRange(encoded, 16, SIZE); }
}
