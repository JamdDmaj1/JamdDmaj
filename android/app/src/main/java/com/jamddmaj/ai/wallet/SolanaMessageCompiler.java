package com.jamddmaj.ai.wallet;

import java.io.ByteArrayOutputStream;
import java.math.BigInteger;
import java.util.*;

/** Compiles untrusted instructions; does not approve, sign or submit them. */
public final class SolanaMessageCompiler {
    public static final class Meta {
        private final byte[] key;
        public final boolean signer, writable;
        public Meta(byte[] key, boolean signer, boolean writable) {
            this.key = key(key); this.signer = signer; this.writable = writable;
        }
    }
    public static final class Instruction {
        private final byte[] program, data;
        private final List<Meta> accounts;
        public Instruction(byte[] program, List<Meta> accounts, byte[] data) {
            this.program = key(program);
            if (accounts == null || accounts.size() > 256
                    || data == null || data.length > 1167) throw invalid();
            this.accounts = Collections.unmodifiableList(new ArrayList<>(accounts));
            for (Meta meta : this.accounts) if (meta == null) throw invalid();
            this.data = data.clone();
        }
    }
    private static final class Entry {
        final byte[] key; boolean writable, program, loaded;
        Entry(byte[] key) { this.key = key; }
    }
    private static final class Table {
        final SolanaLookupTables.Account account;
        final ByteArrayOutputStream writable = new ByteArrayOutputStream(), readonly = new ByteArrayOutputStream();
        Table(SolanaLookupTables.Account account) { this.account = account; }
    }
    public static SolanaMessage compile(byte[] payer, byte[] blockhash, List<Instruction> instructions,
            List<SolanaLookupTables.Account> accounts, BigInteger minimumSlot) {
        payer = key(payer); blockhash = key(blockhash);
        if (instructions == null || instructions.isEmpty() || instructions.size() > 64
                || accounts == null || accounts.size() > 32 || minimumSlot == null
                || minimumSlot.signum() < 0 || minimumSlot.bitLength() > 64) throw invalid();
        LinkedHashMap<String, Entry> entries = new LinkedHashMap<>();
        Entry owner = add(entries,payer); owner.writable = true;
        for (Instruction instruction : instructions) {
            if (instruction == null) throw invalid();
            add(entries,instruction.program).program = true;
            for (Meta meta : instruction.accounts) {
                if (meta.signer && !Arrays.equals(meta.key,payer)) throw invalid();
                add(entries,meta.key).writable |= meta.writable;
            }
        }
        if (entries.size() > 256) throw invalid();
        for (Entry entry : entries.values()) if (entry.program && (entry.writable || entry == owner)) throw invalid();
        List<Table> tables = new ArrayList<>();
        Set<String> seen = new HashSet<>(); BigInteger slot = null;
        for (SolanaLookupTables.Account account : accounts) {
            if (account == null || account.slot.compareTo(minimumSlot) < 0
                    || (slot != null && !slot.equals(account.slot)) || !seen.add(id(account.address()))) throw invalid();
            slot = account.slot;
            Table table = new Table(account);
            int count = account.usableCount();
            for (int i = 0; i < count; i++) {
                Entry entry = entries.get(id(account.at(i)));
                if (entry != null && entry != owner && !entry.program && !entry.loaded) {
                    entry.loaded = true;
                    (entry.writable ? table.writable : table.readonly).write(i);
                }
            }
            if (table.writable.size() + table.readonly.size() > 0) tables.add(table);
        }
        List<Entry> ordered = new ArrayList<>(); ordered.add(owner);
        for (Entry entry : entries.values()) if (entry != owner && !entry.loaded && entry.writable) ordered.add(entry);
        int readonly = 0;
        for (Entry entry : entries.values()) if (entry != owner && !entry.loaded && !entry.writable) { ordered.add(entry); readonly++; }
        int staticCount = ordered.size();
        for (Table table : tables) for (byte index : table.writable.toByteArray()) ordered.add(entries.get(id(table.account.at(index & 255))));
        for (Table table : tables) for (byte index : table.readonly.toByteArray()) ordered.add(entries.get(id(table.account.at(index & 255))));
        Map<String,Integer> indexes = new HashMap<>();
        for (int i = 0; i < ordered.size(); i++) indexes.put(id(ordered.get(i).key),i);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        if (!tables.isEmpty()) out.write(128);
        out.write(1); out.write(0); out.write(readonly); vector(out,staticCount);
        for (int i = 0; i < staticCount; i++) out.writeBytes(ordered.get(i).key);
        out.writeBytes(blockhash); vector(out,instructions.size());
        for (Instruction instruction : instructions) {
            out.write(indexes.get(id(instruction.program))); vector(out,instruction.accounts.size());
            for (Meta meta : instruction.accounts) out.write(indexes.get(id(meta.key)));
            vector(out,instruction.data.length); out.writeBytes(instruction.data);
        }
        List<SolanaLookupTables.Account> used = new ArrayList<>();
        if (!tables.isEmpty()) {
            vector(out,tables.size());
            for (Table table : tables) {
                used.add(table.account); out.writeBytes(table.account.address());
                vector(out,table.writable.size()); out.writeBytes(table.writable.toByteArray());
                vector(out,table.readonly.size()); out.writeBytes(table.readonly.toByteArray());
            }
        }
        SolanaMessage message = SolanaMessage.parse(out.toByteArray());
        SolanaLookupTables.Resolved resolved = SolanaLookupTables.resolve(message,used,minimumSlot);
        for (int i = 0; i < ordered.size(); i++)
            if (!Arrays.equals(resolved.key(i),ordered.get(i).key) || message.isWritable(i) != ordered.get(i).writable
                    || message.isSigner(i) != (i == 0)) throw invalid();
        return message;
    }
    private static Entry add(Map<String,Entry> entries, byte[] key) { return entries.computeIfAbsent(id(key),ignored -> new Entry(key)); }
    private static String id(byte[] key) { return Base64.getEncoder().encodeToString(key); }
    private static byte[] key(byte[] key) { if (key == null || key.length != 32) throw invalid(); return key.clone(); }
    private static void vector(ByteArrayOutputStream out, int value) {
        do { int next = value & 127; value >>>= 7; out.write(next | (value == 0 ? 0 : 128)); } while (value != 0);
    }
    private static IllegalArgumentException invalid() { return new IllegalArgumentException("Invalid swap compilation material"); }
    private SolanaMessageCompiler() {}
}
