package com.jamddmaj.ai.wallet;

import android.os.SystemClock;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.math.BigDecimal;
import java.math.BigInteger;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import javax.net.ssl.HttpsURLConnection;
import org.json.JSONArray;
import org.json.JSONObject;

/** Native read-only balances. No credentials, signing, fallback balances or configurable RPC hosts. */
public final class NativeWalletBalances {
    interface Transport { Object request(WalletNetwork network, String method, JSONArray params) throws Exception; }
    private final Transport transport;
    public NativeWalletBalances() { transport = null; }
    NativeWalletBalances(Transport fixture) { transport = fixture; }

    public static final class Balance {
        public final WalletNetwork network;
        public final String address;
        public final BigInteger units;
        public final long fetchedAtMillis;
        private final long elapsed;
        private Balance(WalletNetwork network, String address, BigInteger units) {
            this.network = network; this.address = address; this.units = units;
            fetchedAtMillis = System.currentTimeMillis(); elapsed = SystemClock.elapsedRealtime();
        }
        public String decimalAmount() { return new BigDecimal(units, network.decimals).toPlainString(); }
        public boolean isFresh() { long age = SystemClock.elapsedRealtime() - elapsed; return age >= 0 && age <= 30000; }
    }

    public Balance read(WalletNetwork network, String address) throws Exception {
        if (network == null) throw new IllegalArgumentException("Network required");
        boolean solana = network == WalletNetwork.SOLANA_MAINNET || network == WalletNetwork.SOLANA_DEVNET;
        if (solana) DevnetSolana.decode(address, 32); // canonical public-address codec only, no key use
        else if (address == null || !address.matches("0x[0-9a-fA-F]{40}")) throw new IllegalArgumentException("Invalid public EVM address");
        network.verifyIdentity(request(network, network.identityMethod, new JSONArray()));
        BigInteger value;
        if (solana) {
            Object result = request(network, "getBalance", new JSONArray().put(address).put(new JSONObject().put("commitment", "confirmed")));
            if (!(result instanceof JSONObject)) throw new IOException("Missing Solana balance");
            value = solanaUnits(((JSONObject) result).get("value"));
        } else {
            value = evmUnits(request(network, "eth_getBalance", new JSONArray().put(address).put("latest")));
        }
        network.verifyIdentity(request(network, network.identityMethod, new JSONArray()));
        return new Balance(network, address, value);
    }

    static BigInteger solanaUnits(Object result) throws IOException {
        if (!(result instanceof Integer) && !(result instanceof Long) && !(result instanceof BigInteger))
            throw new IOException("Inexact Solana balance");
        BigInteger value = new BigInteger(result.toString());
        if (value.signum() < 0 || value.bitLength() > 64) throw new IOException("Invalid Solana balance");
        return value;
    }

    static BigInteger evmUnits(Object result) throws IOException {
        if (!(result instanceof String) || !((String) result).matches("0x(0|[1-9a-fA-F][0-9a-fA-F]{0,63})"))
            throw new IOException("Invalid EVM balance");
        return new BigInteger(((String) result).substring(2), 16);
    }

    private static String endpoint(WalletNetwork network) {
        switch (network) {
            case SOLANA_MAINNET: return "https://api.mainnet-beta.solana.com";
            case SOLANA_DEVNET: return "https://api.devnet.solana.com";
            case BNB_MAINNET: return "https://bsc-dataseed.bnbchain.org";
            case BNB_TESTNET: return "https://data-seed-prebsc-1-s1.bnbchain.org:8545";
            default: throw new IllegalArgumentException("Unsupported network");
        }
    }

    private Object request(WalletNetwork network, String method, JSONArray params) throws Exception {
        if (transport != null) return transport.request(network, method, params);
        HttpsURLConnection connection = (HttpsURLConnection) new URL(endpoint(network)).openConnection();
        connection.setInstanceFollowRedirects(false);
        connection.setConnectTimeout(10000); connection.setReadTimeout(10000);
        connection.setRequestMethod("POST"); connection.setRequestProperty("Content-Type", "application/json");
        connection.setDoOutput(true);
        try {
            byte[] body = new JSONObject().put("jsonrpc", "2.0").put("id", 1).put("method", method)
                .put("params", params).toString().getBytes(StandardCharsets.UTF_8);
            try (OutputStream output = connection.getOutputStream()) { output.write(body); }
            if (connection.getResponseCode() != 200) throw new IOException("Balance provider unavailable");
            JSONObject response;
            try (InputStream input = connection.getInputStream()) {
                response = new JSONObject(new String(DevnetWalletService.readBounded(input, 16384), StandardCharsets.UTF_8));
            }
            Object id = response.opt("id");
            if (!(id instanceof Integer || id instanceof Long) || ((Number) id).longValue() != 1 ||
                !"2.0".equals(response.optString("jsonrpc")) || response.has("error") || response.isNull("result"))
                throw new IOException("Balance provider rejected request");
            return response.get("result");
        } finally { connection.disconnect(); }
    }
}
