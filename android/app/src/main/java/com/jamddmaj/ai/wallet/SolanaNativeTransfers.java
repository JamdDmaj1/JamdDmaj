package com.jamddmaj.ai.wallet;

import android.content.Context;
import android.os.SystemClock;
import android.util.Base64;
import java.io.IOException;
import java.math.BigInteger;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.Arrays;
import java.util.function.BooleanSupplier;
import org.bouncycastle.math.ec.rfc8032.Ed25519;
import org.json.JSONArray;
import org.json.JSONObject;

/** Native SOL only. Preparing never signs or sends; submission requires an immutable reviewed draft. */
public final class SolanaNativeTransfers {
    public interface Signer {
        String address(byte[] temporaryEntropy) throws Exception;
        byte[] sign(byte[] temporaryEntropy, byte[] message) throws Exception;
    }
    private final NativeWalletProfiles.Profile owner;
    private final NativeWalletRpc rpc;
    private final NativeTransferJournal journal;
    public SolanaNativeTransfers(Context context, NativeWalletProfiles.Profile owner) throws Exception { this(context, owner, null); }
    SolanaNativeTransfers(Context context, NativeWalletProfiles.Profile owner, NativeWalletRpc.Transport fixture) throws Exception {
        this.owner = owner;
        rpc = new NativeWalletRpc(WalletNetwork.SOLANA_MAINNET, fixture);
        journal = new NativeTransferJournal(context, owner, WalletNetwork.SOLANA_MAINNET);
    }
    public static final class Draft {
        public final String from, recipient;
        public final BigInteger units, fee;
        private final byte[] message;
        private final BigInteger lastValidBlockHeight;
        private final long started = SystemClock.elapsedRealtime();
        private boolean consumed;
        private Draft(String from, String recipient, BigInteger units, BigInteger fee, byte[] message, BigInteger height) {
            this.from = from; this.recipient = recipient; this.units = units; this.fee = fee;
            this.message = message.clone(); lastValidBlockHeight = height;
        }
        private void fresh() throws IOException {
            long age = SystemClock.elapsedRealtime() - started;
            if (consumed || age < 0 || age > 60000) throw new IOException("Review expired; prepare and review again");
        }
    }
    private static JSONObject confirmed() throws Exception { return new JSONObject().put("commitment", "confirmed"); }
    private static String b64(byte[] value) { return Base64.encodeToString(value, Base64.NO_WRAP); }
    private BigInteger balance() throws Exception {
        JSONObject result = (JSONObject) rpc.request("getBalance", new JSONArray().put(owner.solanaAddress).put(confirmed()));
        return NativeWalletBalances.solanaUnits(result.get("value"));
    }
    private BigInteger fee(byte[] message) throws Exception {
        JSONObject result = (JSONObject) rpc.request("getFeeForMessage", new JSONArray().put(b64(message)).put(confirmed()));
        BigInteger fee = NativeWalletBalances.solanaUnits(result.get("value"));
        if (fee.compareTo(BigInteger.valueOf(1000000)) > 0) throw new IOException("Unexpected native transfer fee");
        return fee;
    }
    private void simulate(byte[] message, byte[] signature, boolean verify) throws Exception {
        JSONObject result = (JSONObject) rpc.request("simulateTransaction", new JSONArray().put(b64(DevnetSolana.wire(message, signature)))
            .put(new JSONObject().put("encoding", "base64").put("sigVerify", verify).put("commitment", "confirmed")));
        JSONObject value = result.getJSONObject("value");
        if (!value.has("err") || !value.isNull("err")) throw new IOException("Transfer simulation failed");
    }
    static byte[] message(String from, String recipient, String blockhash, BigInteger units) {
        byte[] to = DevnetSolana.decode(recipient, 32);
        if (from.equals(recipient) || Arrays.equals(to, new byte[32]) || units == null || units.signum() <= 0 || units.bitLength() > 64)
            throw new IllegalArgumentException("Invalid native SOL transfer");
        ByteBuffer buffer = ByteBuffer.allocate(150).order(ByteOrder.LITTLE_ENDIAN);
        buffer.put(new byte[]{1,0,1,3}).put(DevnetSolana.decode(from, 32)).put(to).put(new byte[32]).put(DevnetSolana.decode(blockhash, 32));
        buffer.put(new byte[]{1,2,2,0,1,12}).putInt(2).putLong(units.longValue());
        return buffer.array();
    }
    public Draft prepare(String recipient, String amount) throws Exception {
        journal.requireNoPending();
        BigInteger units = WalletNetwork.SOLANA_MAINNET.parseNativeAmount(amount);
        // Validate destination before any network access, independent of the blockhash.
        message(owner.solanaAddress, recipient, "11111111111111111111111111111111", units);
        rpc.verifyNetwork();
        JSONObject latest = ((JSONObject) rpc.request("getLatestBlockhash", new JSONArray().put(confirmed()))).getJSONObject("value");
        byte[] message = message(owner.solanaAddress, recipient, latest.getString("blockhash"), units);
        BigInteger fee = fee(message), height = NativeWalletBalances.solanaUnits(latest.get("lastValidBlockHeight"));
        if (balance().compareTo(units.add(fee)) < 0) throw new IOException("Insufficient SOL including fee");
        simulate(message, new byte[64], false);
        rpc.verifyNetwork();
        return new Draft(owner.solanaAddress, recipient, units, fee, message, height);
    }
    public byte[] signReviewed(Draft draft, byte[] temporaryEntropy, Signer signer) throws Exception {
        synchronized (draft) {
            draft.fresh();
            if (!owner.solanaAddress.equals(draft.from) || !draft.from.equals(signer.address(temporaryEntropy)))
                throw new IOException("Unlocked wallet does not match review");
            byte[] signature = signer.sign(temporaryEntropy, draft.message.clone());
            verifySignature(draft, signature); draft.fresh(); return signature;
        }
    }
    private static void verifySignature(Draft draft, byte[] signature) throws IOException {
        if (signature == null || signature.length != 64 || !Ed25519.verify(signature, 0, DevnetSolana.decode(draft.from, 32), 0,
            draft.message, 0, draft.message.length)) throw new IOException("Signature does not match reviewed transfer");
    }
    public String submit(Draft draft, byte[] signature, BooleanSupplier authorizedForeground) throws Exception {
        synchronized (draft) {
            byte[] approvedSignature = signature == null ? null : signature.clone();
            draft.fresh(); draft.consumed = true;
            if (!owner.solanaAddress.equals(draft.from) || !authorizedForeground.getAsBoolean()) throw new IOException("Wallet locked");
            verifySignature(draft, approvedSignature); journal.requireNoPending(); rpc.verifyNetwork();
            BigInteger height = NativeWalletBalances.solanaUnits(rpc.request("getBlockHeight", new JSONArray().put(confirmed())));
            if (height.compareTo(draft.lastValidBlockHeight) > 0) throw new IOException("Blockhash expired");
            if (!draft.fee.equals(fee(draft.message)) || balance().compareTo(draft.units.add(draft.fee)) < 0)
                throw new IOException("Balance or fee changed; review again");
            simulate(draft.message, approvedSignature, true);
            long age = SystemClock.elapsedRealtime() - draft.started;
            if (age < 0 || age > 60000 || !authorizedForeground.getAsBoolean()) throw new IOException("Authorization expired");
            String expected = DevnetSolana.encode(approvedSignature);
            journal.begin(expected, draft.recipient, draft.units, draft.fee);
            if (!authorizedForeground.getAsBoolean()) throw new IOException("Wallet locked; check transaction status");
            Object response = rpc.request("sendTransaction", new JSONArray().put(b64(DevnetSolana.wire(draft.message, approvedSignature)))
                .put(new JSONObject().put("encoding", "base64").put("skipPreflight", false).put("preflightCommitment", "confirmed").put("maxRetries", 0)));
            if (!expected.equals(response)) throw new IOException("Unknown broadcast result; do not resend");
            journal.submitted(expected); return expected;
        }
    }
    public NativeTransferJournal.Record checkLatest() throws Exception {
        NativeTransferJournal.Record record = journal.latest();
        if (record == null || !record.pending()) return record;
        rpc.verifyNetwork();
        JSONObject response = (JSONObject) rpc.request("getSignatureStatuses", new JSONArray().put(new JSONArray().put(record.transactionId))
            .put(new JSONObject().put("searchTransactionHistory", true)));
        JSONArray values = response.getJSONArray("value");
        if (values.length() != 1) throw new IOException("Invalid transaction status response");
        if (!values.isNull(0)) {
            JSONObject result = values.getJSONObject(0);
            String state = result.optString("confirmationStatus");
            if ((state.equals("confirmed") || state.equals("finalized")) && result.has("err"))
                journal.settled(record.transactionId, result.isNull("err"));
        }
        return journal.latest();
    }
}
