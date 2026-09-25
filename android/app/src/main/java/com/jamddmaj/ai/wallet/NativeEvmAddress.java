package com.jamddmaj.ai.wallet;

import java.nio.charset.StandardCharsets;
import java.util.Locale;
import org.bouncycastle.crypto.digests.KeccakDigest;

/** ERC-55 public-address checking using Bouncy Castle Keccak, never SHA3-256. */
public final class NativeEvmAddress {
    public static String checksum(String address) {
        if (address == null || !address.matches("0x[0-9a-fA-F]{40}")) throw new IllegalArgumentException("Invalid EVM address");
        String lower = address.substring(2).toLowerCase(Locale.ROOT);
        byte[] digest = keccak(lower.getBytes(StandardCharsets.US_ASCII));
        StringBuilder output = new StringBuilder("0x");
        for (int i = 0; i < lower.length(); i++) {
            int nibble = i % 2 == 0 ? (digest[i / 2] & 255) >>> 4 : digest[i / 2] & 15;
            char c = lower.charAt(i); output.append(nibble >= 8 ? Character.toUpperCase(c) : c);
        }
        return output.toString();
    }
    public static String validate(String address) {
        String canonical = checksum(address), body = address.substring(2);
        if (!body.equals(body.toLowerCase(Locale.ROOT)) && !body.equals(body.toUpperCase(Locale.ROOT)) && !address.equals(canonical))
            throw new IllegalArgumentException("EVM address checksum mismatch");
        return canonical;
    }
    public static String recipient(String address) {
        String canonical = validate(address);
        if (canonical.equals("0x0000000000000000000000000000000000000000")) throw new IllegalArgumentException("Zero address cannot receive this transfer");
        return canonical;
    }
    static byte[] keccak(byte[] data) {
        KeccakDigest digest = new KeccakDigest(256); digest.update(data, 0, data.length);
        byte[] result = new byte[32]; digest.doFinal(result, 0); return result;
    }
    static String hex(byte[] data) {
        StringBuilder text = new StringBuilder("0x");
        for (byte b : data) text.append(Character.forDigit((b & 255) >>> 4, 16)).append(Character.forDigit(b & 15, 16));
        return text.toString();
    }
    private NativeEvmAddress() {}
}
