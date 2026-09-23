package com.jamddmaj.ai.wallet;

import java.util.Arrays;

/** Fixed-size test-only ciphertext format. No plaintext, addresses or metadata. */
public final class TestVaultEnvelope {
    private static final byte[] MAGIC = {'J', 'T', 'V', 1};
    public static final int SIZE = 64; // 4 version + 12 nonce + 32 encrypted bytes + 16 tag
    private TestVaultEnvelope() {}

    public static byte[] encode(byte[] iv, byte[] ciphertext) {
        if (iv == null || iv.length != 12 || ciphertext == null || ciphertext.length != 48)
            throw new IllegalArgumentException("Invalid test vault envelope");
        byte[] result = new byte[SIZE];
        System.arraycopy(MAGIC, 0, result, 0, 4);
        System.arraycopy(iv, 0, result, 4, 12);
        System.arraycopy(ciphertext, 0, result, 16, 48);
        return result;
    }

    public static void validate(byte[] data) {
        if (data == null || data.length != SIZE || !Arrays.equals(MAGIC, Arrays.copyOf(data, 4)))
            throw new IllegalArgumentException("Unsupported or damaged test vault");
    }

    public static byte[] iv(byte[] data) { validate(data); return Arrays.copyOfRange(data, 4, 16); }
    public static byte[] ciphertext(byte[] data) { validate(data); return Arrays.copyOfRange(data, 16, SIZE); }
}
