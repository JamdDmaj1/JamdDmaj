package com.jamddmaj.ai.wallet;

import android.util.Base64;
import java.io.IOException;
import java.math.BigInteger;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;

/** Read-only mainnet account resolution at one confirmed RPC snapshot. */
final class NativeSolanaAccounts {
    private final NativeWalletRpc rpc;
    NativeSolanaAccounts() { this(null); }
    NativeSolanaAccounts(NativeWalletRpc.Transport fixture) { rpc = new NativeWalletRpc(WalletNetwork.SOLANA_MAINNET,fixture); }
    SolanaLookupTables.Resolved resolve(SolanaMessage message) throws Exception {
        if (message == null) throw new IllegalArgumentException("Message required");
        rpc.verifyNetwork();
        JSONObject commitment = new JSONObject().put("commitment","confirmed");
        BigInteger minimum = NativeWalletBalances.solanaUnits(rpc.request("getSlot",new JSONArray().put(commitment)));
        List<SolanaLookupTables.Account> accounts = new ArrayList<>();
        if (!message.lookups.isEmpty()) {
            JSONArray addresses = new JSONArray();
            for (SolanaMessage.Lookup lookup : message.lookups) addresses.put(DevnetSolana.encode(lookup.key()));
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
                accounts.add(new SolanaLookupTables.Account(message.lookups.get(i).key(),value.getString("owner"),value.getBoolean("executable"),bytes,slot));
            }
        }
        SolanaLookupTables.Resolved result = SolanaLookupTables.resolve(message,accounts,minimum);
        rpc.verifyNetwork();
        return result;
    }
}
