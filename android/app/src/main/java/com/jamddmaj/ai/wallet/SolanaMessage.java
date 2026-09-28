package com.jamddmaj.ai.wallet;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

/** Bounded structural decoder, NOT authorization to sign a swap.
 * Lookup keys must subsequently be resolved from verified RPC accounts and every
 * instruction must pass the native swap policy before a signing draft exists.
 */
public final class SolanaMessage {
    public final int version, signatures, readonlySigned, readonlyUnsigned;
    private final byte[] wire, blockhash;
    private final List<byte[]> keys;
    public final List<Instruction> instructions;
    public final List<Lookup> lookups;
    public final int accountCount;
    public static final class Instruction {
        public final int program;
        private final byte[] accounts, data;
        private Instruction(int program, byte[] accounts, byte[] data) {
            this.program = program; this.accounts = accounts; this.data = data;
        }
        public byte[] accounts() { return accounts.clone(); }
        public byte[] data() { return data.clone(); }
    }
    public static final class Lookup {
        private final byte[] key, writable, readonly;
        private Lookup(byte[] key, byte[] writable, byte[] readonly) {
            this.key = key; this.writable = writable; this.readonly = readonly;
        }
        public byte[] key() { return key.clone(); }
        public byte[] writable() { return writable.clone(); }
        public byte[] readonly() { return readonly.clone(); }
    }
    private SolanaMessage(byte[] source) {
        Cursor c = new Cursor(source);
        int prefix = c.u8();
        if ((prefix & 128) != 0) {
            if (prefix != 128) throw invalid();
            version = 0; signatures = c.u8();
        } else { version = -1; signatures = prefix; }
        readonlySigned = c.u8(); readonlyUnsigned = c.u8();
        int count = c.shortvec();
        if (signatures < 1 || signatures > 12 || count > 256 || count < signatures
                || readonlySigned >= signatures || readonlyUnsigned > count - signatures
                || source.length + 1 + signatures * 64 > 1232) throw invalid();
        keys = new ArrayList<>();
        for (int i = 0; i < count; i++) {
            byte[] key = c.take(32);
            for (byte[] existing : keys) if (Arrays.equals(key, existing)) throw invalid();
            keys.add(key);
        }
        blockhash = c.take(32);
        int instructionCount = c.shortvec();
        if (instructionCount < 1 || instructionCount > 64) throw invalid();
        List<Instruction> decoded = new ArrayList<>();
        for (int i = 0; i < instructionCount; i++) {
            int program = c.u8();
            byte[] accounts = c.take(c.shortvec());
            if (accounts.length > 256) throw invalid();
            decoded.add(new Instruction(program, accounts, c.take(c.shortvec())));
        }
        List<Lookup> tables = new ArrayList<>();
        int loaded = 0;
        if (version == 0) {
            int tableCount = c.shortvec();
            if (tableCount > 32) throw invalid();
            for (int i = 0; i < tableCount; i++) {
                byte[] key = c.take(32), writable = c.take(c.shortvec()), readonly = c.take(c.shortvec());
                if (writable.length + readonly.length == 0) throw invalid();
                for (Lookup existing : tables) if (Arrays.equals(key, existing.key)) throw invalid();
                boolean[] seen = new boolean[256];
                for (byte index : writable) { if (seen[index & 255]) throw invalid(); seen[index & 255] = true; }
                for (byte index : readonly) { if (seen[index & 255]) throw invalid(); seen[index & 255] = true; }
                loaded += writable.length + readonly.length;
                if (count + loaded > 256) throw invalid();
                tables.add(new Lookup(key, writable, readonly));
            }
        }
        if (c.position != source.length) throw invalid();
        accountCount = count + loaded;
        for (Instruction instruction : decoded) {
            // Solana program IDs must reside in the static account list.
            if (instruction.program == 0 || instruction.program >= count) throw invalid();
            for (byte index : instruction.accounts) if ((index & 255) >= accountCount) throw invalid();
        }
        wire = source;
        instructions = Collections.unmodifiableList(decoded);
        lookups = Collections.unmodifiableList(tables);
    }
    public static SolanaMessage parse(byte[] message) {
        if (message == null || message.length < 3 || message.length > 1167) throw invalid();
        return new SolanaMessage(message.clone());
    }
    public byte[] bytes() { return wire.clone(); }
    public byte[] blockhash() { return blockhash.clone(); }
    public int staticAccountCount() { return keys.size(); }
    public byte[] staticKey(int index) { return keys.get(index).clone(); }
    public boolean isSigner(int index) { checkIndex(index); return index < signatures; }
    public boolean isWritable(int index) {
        checkIndex(index);
        if (index < signatures) return index < signatures - readonlySigned;
        if (index < keys.size()) return index < keys.size() - readonlyUnsigned;
        int writableCount = 0;
        for (Lookup lookup : lookups) writableCount += lookup.writable.length;
        return index < keys.size() + writableCount;
    }
    private void checkIndex(int index) { if (index < 0 || index >= accountCount) throw invalid(); }
    private static IllegalArgumentException invalid() { return new IllegalArgumentException("Invalid Solana message"); }
    private static final class Cursor {
        final byte[] bytes; int position;
        Cursor(byte[] bytes) { this.bytes = bytes; }
        int u8() { if (position == bytes.length) throw invalid(); return bytes[position++] & 255; }
        byte[] take(int count) {
            if (count < 0 || count > bytes.length - position) throw invalid();
            byte[] value = Arrays.copyOfRange(bytes, position, position + count); position += count; return value;
        }
        int shortvec() {
            int value = 0;
            for (int i = 0; i < 3; i++) {
                int next = u8();
                if (i == 2 && (next & 252) != 0) throw invalid();
                value |= (next & 127) << (i * 7);
                if ((next & 128) == 0) {
                    if (i > 0 && (next & 127) == 0) throw invalid();
                    return value;
                }
            }
            throw invalid();
        }
    }
}
