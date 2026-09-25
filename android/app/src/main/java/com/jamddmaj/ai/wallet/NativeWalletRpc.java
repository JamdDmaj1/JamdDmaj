package com.jamddmaj.ai.wallet;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import javax.net.ssl.HttpsURLConnection;
import org.json.JSONArray;
import org.json.JSONObject;

/** Package-private native chain transport. Fixed TLS hosts, bounded responses, no redirects or retries. */
final class NativeWalletRpc {
    interface Transport { Object request(String method, JSONArray params) throws Exception; }
    private final WalletNetwork network;
    private final Transport fixture;
    NativeWalletRpc(WalletNetwork network) { this(network, null); }
    NativeWalletRpc(WalletNetwork network, Transport fixture) {
        if (network == null) throw new IllegalArgumentException("Network required");
        this.network = network; this.fixture = fixture;
    }
    void verifyNetwork() throws Exception { network.verifyIdentity(request(network.identityMethod, new JSONArray())); }
    private String endpoint() {
        switch (network) {
            case SOLANA_MAINNET: return "https://api.mainnet-beta.solana.com";
            case SOLANA_DEVNET: return "https://api.devnet.solana.com";
            case BNB_MAINNET: return "https://bsc-dataseed.bnbchain.org";
            case BNB_TESTNET: return "https://data-seed-prebsc-1-s1.bnbchain.org:8545";
            default: throw new IllegalArgumentException("Unsupported network");
        }
    }
    Object request(String method, JSONArray params) throws Exception {
        if (fixture != null) return fixture.request(method, params);
        HttpsURLConnection connection = (HttpsURLConnection) new URL(endpoint()).openConnection();
        connection.setInstanceFollowRedirects(false);
        connection.setConnectTimeout(10000); connection.setReadTimeout(10000);
        connection.setRequestMethod("POST"); connection.setRequestProperty("Content-Type", "application/json");
        connection.setDoOutput(true);
        try {
            byte[] body = new JSONObject().put("jsonrpc", "2.0").put("id", 1).put("method", method)
                .put("params", params).toString().getBytes(StandardCharsets.UTF_8);
            try (OutputStream output = connection.getOutputStream()) { output.write(body); }
            if (connection.getResponseCode() != 200) throw new IOException("Network provider unavailable");
            JSONObject response;
            try (InputStream input = connection.getInputStream()) {
                response = new JSONObject(new String(DevnetWalletService.readBounded(input, 524288), StandardCharsets.UTF_8));
            }
            Object id = response.opt("id");
            if (!(id instanceof Integer || id instanceof Long) || ((Number) id).longValue() != 1 ||
                !"2.0".equals(response.optString("jsonrpc")) || response.has("error") || !response.has("result"))
                throw new IOException("Network provider rejected request");
            return response.get("result");
        } finally { connection.disconnect(); }
    }
}
