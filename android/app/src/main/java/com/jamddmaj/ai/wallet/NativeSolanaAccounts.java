package com.jamddmaj.ai.wallet;

import android.util.Base64;
import java.io.IOException;
import java.math.BigInteger;
import java.util.ArrayList;
import java.util.List;
import java.util.HashSet;
import java.util.Set;
import org.json.JSONArray;
import org.json.JSONObject;

/** Read-only mainnet account resolution at one confirmed RPC snapshot. */
final class NativeSolanaAccounts {
    private final NativeWalletRpc rpc;
    NativeSolanaAccounts() { this(null); }
    NativeSolanaAccounts(NativeWalletRpc.Transport fixture) { rpc = new NativeWalletRpc(WalletNetwork.SOLANA_MAINNET,fixture); }
    SolanaLookupTables.Resolved resolve(SolanaMessage message) throws Exception {
        if (message == null) throw new IllegalArgumentException("Message required");
        List<byte[]> keys = new ArrayList<>();
        for (SolanaMessage.Lookup lookup : message.lookups) keys.add(lookup.key());
        Snapshot snapshot = read(keys);
        return SolanaLookupTables.resolve(message,snapshot.accounts,snapshot.minimum);
    }
    /** Preparation only: the result still needs native instruction-policy approval. */
    SolanaMessage compile(byte[] payer, byte[] blockhash, List<SolanaMessageCompiler.Instruction> instructions,
            List<byte[]> lookupKeys) throws Exception {
        Snapshot snapshot = read(lookupKeys);
        return SolanaMessageCompiler.compile(payer,blockhash,instructions,snapshot.accounts,snapshot.minimum);
    }
    private static final class Snapshot {
        final List<SolanaLookupTables.Account> accounts;
        final BigInteger minimum;
        Snapshot(List<SolanaLookupTables.Account> accounts, BigInteger minimum) { this.accounts=accounts; this.minimum=minimum; }
    }
    private Snapshot read(List<byte[]> lookupKeys) throws Exception {
        if (lookupKeys == null || lookupKeys.size() > 32) throw new IllegalArgumentException("Invalid lookup keys");
        List<byte[]> keys = new ArrayList<>();
        Set<String> unique = new HashSet<>();
        for (byte[] key : lookupKeys) {
            if (key == null || key.length != 32 || !unique.add(DevnetSolana.encode(key)))
                throw new IllegalArgumentException("Invalid lookup keys");
            keys.add(key.clone());
        }
        rpc.verifyNetwork();
        JSONObject commitment = new JSONObject().put("commitment","confirmed");
        BigInteger minimum = NativeWalletBalances.solanaUnits(rpc.request("getSlot",new JSONArray().put(commitment)));
        List<SolanaLookupTables.Account> accounts = new ArrayList<>();
        if (!keys.isEmpty()) {
            JSONArray addresses = new JSONArray();
            for (byte[] key : keys) addresses.put(DevnetSolana.encode(key));
            JSONObject result = (JSONObject) rpc.request("getMultipleAccounts", new JSONArray().put(addresses)
                .put(new JSONObject().put("commitment","confirmed").put("encoding","base64").put("minContextSlot",minimum)));
            BigInteger slot = NativeWalletBalances.solanaUnits(result.getJSONObject("context").get("slot"));
            JSONArray values = result.getJSONArray("value");
            if (values.length() != addresses.length()) throw new IOException("Incomplete lookup accounts");
            for (int i = 0; i < values.length(); i++) {
                JSONObject value = values.getJSONObject(i);
                if (!(value.get("executable") instanceof Boolean)) throw new IOException("Invalid account flags");
                JSONArray encoded = value.getJSONArray("data");
                if (encoded.length() != 2 || !"base64".equals(encoded.get(1)) || !(encoded.get(0) instanceof String))
                    throw new IOException("Invalid lookup encoding");
                String text = encoded.getString(0);
                if (text.length() > 11000) throw new IOException("Oversized lookup account");
                byte[] bytes = Base64.decode(text,Base64.NO_WRAP);
                if (!Base64.encodeToString(bytes,Base64.NO_WRAP).equals(text)) throw new IOException("Noncanonical lookup encoding");
                accounts.add(new SolanaLookupTables.Account(keys.get(i),value.getString("owner"),value.getBoolean("executable"),bytes,slot));
            }
        }
        rpc.verifyNetwork();
        return new Snapshot(accounts,minimum);
    }
}
