package com.jamddmaj.ai.wallet;

import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Arrays;
import javax.crypto.Cipher;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.PBEKeySpec;
import javax.crypto.spec.SecretKeySpec;

/**
 * Native production recovery container for BIP39 entropy, NOT an Ed25519 private key.
 * Domain-separated from PortableTestBackup; it cannot import a devnet backup.
 * Caller must wipe returned plaintext and verify exported-file recovery before receive UI.
 */
public final class PortableWalletBackup {
    private static final byte[] HEADER = {'J','A','M','D','H','D',0,1};
    private static final byte[] AAD = ("JamdDmaj:wallet-backup:" + WalletRecoveryProfile.ID)
        .getBytes(StandardCharsets.UTF_8);
    public static final int SIZE = 84;
    public static final int ITERATIONS = 600000;

    private static SecretKeySpec key(char[] password, byte[] salt) throws Exception {
        if (password == null || password.length < 16 || password.length > 1024)
            throw new IllegalArgumentException("Use a password of 16 to 1024 characters");
        // Do not silently replace malformed UTF-16: recovery implementations must agree on UTF-8.
        for (int i = 0; i < password.length; i++) {
            char c = password[i];
            if (Character.isHighSurrogate(c)) {
                if (++i >= password.length || !Character.isLowSurrogate(password[i]))
                    throw new IllegalArgumentException("Invalid password encoding");
            } else if (Character.isLowSurrogate(c)) {
                throw new IllegalArgumentException("Invalid password encoding");
            }
        }
        PBEKeySpec spec = new PBEKeySpec(password, salt, ITERATIONS, 256);
        byte[] raw = null;
        try {
            raw = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).getEncoded();
            return new SecretKeySpec(raw, "AES");
        } finally {
            spec.clearPassword();
            if (raw != null) Arrays.fill(raw, (byte) 0);
        }
    }

    public static byte[] seal(byte[] entropy, char[] password) throws Exception {
        WalletRecoveryProfile.validateEntropy(entropy);
        byte[] salt = new byte[16], iv = new byte[12];
        SecureRandom random = new SecureRandom();
        random.nextBytes(salt);
        random.nextBytes(iv);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, key(password, salt), new GCMParameterSpec(128, iv));
        cipher.updateAAD(HEADER);
        cipher.updateAAD(AAD);
        byte[] result = new byte[SIZE];
        System.arraycopy(HEADER, 0, result, 0, 8);
        System.arraycopy(salt, 0, result, 8, 16);
        System.arraycopy(iv, 0, result, 24, 12);
        System.arraycopy(cipher.doFinal(entropy), 0, result, 36, 48);
        return result;
    }

    public static byte[] open(byte[] backup, char[] password) throws Exception {
        if (backup == null || backup.length != SIZE || !Arrays.equals(HEADER, Arrays.copyOf(backup, 8)))
            throw new IllegalArgumentException("Unsupported wallet backup; test backups are not production wallets");
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, key(password, Arrays.copyOfRange(backup, 8, 24)),
            new GCMParameterSpec(128, Arrays.copyOfRange(backup, 24, 36)));
        cipher.updateAAD(HEADER);
        cipher.updateAAD(AAD);
        return cipher.doFinal(backup, 36, 48);
    }

    private PortableWalletBackup() {}
}
