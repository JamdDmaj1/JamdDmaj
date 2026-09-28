package com.jamddmaj.ai.wallet;

import java.math.BigInteger;
import java.util.Arrays;

/** Exact legacy SPL account decoder. Token-2022 accounts require separate extension policy. */
public final class SplTokenAccount {
    public static final String PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
    private final byte[] mint, owner, delegate, closeAuthority;
    public final BigInteger amount, delegatedAmount, nativeReserve;
    public final boolean frozen;
    private SplTokenAccount(byte[] bytes) {
        mint = Arrays.copyOfRange(bytes,0,32); owner = Arrays.copyOfRange(bytes,32,64);
        amount = u64(bytes,64); delegatedAmount = u64(bytes,121);
        delegate = option(bytes,72) ? Arrays.copyOfRange(bytes,76,108) : null;
        nativeReserve = option(bytes,109) ? u64(bytes,113) : null;
        closeAuthority = option(bytes,129) ? Arrays.copyOfRange(bytes,133,165) : null;
        if (bytes[108] != 1 && bytes[108] != 2) throw invalid();
        frozen = bytes[108] == 2;
    }
    public static SplTokenAccount decode(String programOwner, boolean executable, byte[] data) {
        if (!PROGRAM.equals(programOwner) || executable || data == null || data.length != 165) throw invalid();
        return new SplTokenAccount(data.clone());
    }
    public byte[] mint() { return mint.clone(); }
    public byte[] owner() { return owner.clone(); }
    public byte[] delegate() { return delegate == null ? null : delegate.clone(); }
    public byte[] closeAuthority() { return closeAuthority == null ? null : closeAuthority.clone(); }
    public boolean hasDelegate() { return delegate != null; }
    private static boolean option(byte[] data,int offset) {
        if ((data[offset] != 0 && data[offset] != 1) || data[offset+1] != 0 || data[offset+2] != 0 || data[offset+3] != 0) throw invalid();
        return data[offset] == 1;
    }
    private static BigInteger u64(byte[] data,int offset) {
        byte[] reversed = new byte[8];
        for (int i=0;i<8;i++) reversed[7-i] = data[offset+i];
        return new BigInteger(1,reversed);
    }
    private static IllegalArgumentException invalid() { return new IllegalArgumentException("Invalid SPL token account"); }
}
