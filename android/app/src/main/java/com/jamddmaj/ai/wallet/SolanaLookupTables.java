package com.jamddmaj.ai.wallet;

import java.math.BigInteger;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/** Resolves v0 account indexes from RPC table accounts, never aggregator-provided addresses.
 * Layout: solana-address-lookup-table-interface LookupTableMeta (56-byte prefix).
 * Decoding/resolution alone does not authorize a swap or expose a signing method.
 */
public final class SolanaLookupTables {
    public static final String PROGRAM = "AddressLookupTab1e1111111111111111111111111";
    private static final BigInteger ACTIVE = BigInteger.ONE.shiftLeft(64).subtract(BigInteger.ONE);
    public static final class Account {
        private final byte[] address, data;
        public final BigInteger slot;
        public Account(byte[] address, String owner, boolean executable, byte[] data, BigInteger slot) {
            if (address == null || address.length != 32 || !PROGRAM.equals(owner) || executable
                    || data == null || data.length < 56 || data.length > 8248 || (data.length - 56) % 32 != 0
                    || slot == null || slot.signum() < 0 || slot.bitLength() > 64) throw invalid();
            this.address = address.clone(); this.data = data.clone(); this.slot = slot;
        }
        byte[] address() { return address.clone(); }
        int usableCount() {
            if (data[0] != 1 || data[1] != 0 || data[2] != 0 || data[3] != 0
                    || !u64(data,4).equals(ACTIVE) || (data[21] != 0 && data[21] != 1)) throw invalid();
            int count = (data.length - 56) / 32, start = data[20] & 255;
            BigInteger extended = u64(data,12);
            if (start > count || extended.compareTo(slot) > 0) throw invalid();
            // Entries appended in the current bank slot are not yet usable.
            return extended.equals(slot) ? start : count;
        }
        byte[] at(int index) {
            int usable = usableCount();
            if (index < 0 || index >= usable) throw invalid();
            return Arrays.copyOfRange(data,56 + index * 32,88 + index * 32);
        }
    }
    public static final class Resolved {
        private final List<byte[]> keys;
        private Resolved(List<byte[]> keys) { this.keys = keys; }
        public int size() { return keys.size(); }
        public byte[] key(int index) { return keys.get(index).clone(); }
    }
    public static Resolved resolve(SolanaMessage message, List<Account> accounts, BigInteger minimumSlot) {
        if (message == null || accounts == null || accounts.size() != message.lookups.size()
                || minimumSlot == null || minimumSlot.signum() < 0 || minimumSlot.bitLength() > 64) throw invalid();
        List<byte[]> result = new ArrayList<>(), writable = new ArrayList<>(), readonly = new ArrayList<>();
        for (int i = 0; i < message.staticAccountCount(); i++) result.add(message.staticKey(i));
        BigInteger snapshotSlot = null;
        for (int i = 0; i < accounts.size(); i++) {
            Account account = accounts.get(i);
            SolanaMessage.Lookup lookup = message.lookups.get(i);
            if (account == null || !Arrays.equals(lookup.key(),account.address) || account.slot.compareTo(minimumSlot) < 0
                    || (snapshotSlot != null && !snapshotSlot.equals(account.slot))) throw invalid();
            snapshotSlot = account.slot;
            for (byte index : lookup.writable()) writable.add(account.at(index & 255));
            for (byte index : lookup.readonly()) readonly.add(account.at(index & 255));
        }
        result.addAll(writable); result.addAll(readonly);
        if (result.size() != message.accountCount) throw invalid();
        for (int i = 0; i < result.size(); i++) for (int j = 0; j < i; j++)
            if (Arrays.equals(result.get(i),result.get(j))) throw invalid();
        return new Resolved(result);
    }
    private static BigInteger u64(byte[] data, int offset) {
        byte[] bigEndian = new byte[8];
        for (int i = 0; i < 8; i++) bigEndian[7-i] = data[offset+i];
        return new BigInteger(1,bigEndian);
    }
    private static IllegalArgumentException invalid() { return new IllegalArgumentException("Invalid or unavailable address lookup table"); }
    private SolanaLookupTables() {}
}
