package com.jamddmaj.ai.wallet;

import android.os.SystemClock;
import android.util.Base64;
import java.io.IOException;
import java.math.BigInteger;
import java.util.Arrays;
import org.json.JSONArray;
import org.json.JSONObject;

/** Read-only fee and simulation evidence. Successful simulation does not authorize signing. */
final class NativeSwapSimulation {
    private final NativeWalletRpc rpc;
    NativeSwapSimulation() { this(null); }
    NativeSwapSimulation(NativeWalletRpc.Transport fixture) { rpc=new NativeWalletRpc(WalletNetwork.SOLANA_MAINNET,fixture); }
    static final class Result {
        final BigInteger fee, unitsConsumed, slot;
        private final byte[] message;
        private Result(BigInteger fee, BigInteger unitsConsumed, BigInteger slot, byte[] message) {
            this.fee=fee; this.unitsConsumed=unitsConsumed; this.slot=slot; this.message=message.clone();
        }
        boolean matches(SolanaMessage value) { return value!=null && Arrays.equals(message,value.bytes()); }
    }
    Result inspect(SolanaMessage message, String payer, BigInteger lastValidBlockHeight) throws Exception {
        if (message==null || message.signatures!=1 || !Arrays.equals(message.staticKey(0),DevnetSolana.decode(payer,32))
                || lastValidBlockHeight==null || lastValidBlockHeight.signum()<=0 || lastValidBlockHeight.bitLength()>64)
            throw new IllegalArgumentException("Invalid swap simulation request");
        long started=SystemClock.elapsedRealtime();
        rpc.verifyNetwork();
        BigInteger minimum=NativeWalletBalances.solanaUnits(rpc.request("getSlot",new JSONArray().put(confirmed())));
        BigInteger height=NativeWalletBalances.solanaUnits(rpc.request("getBlockHeight",new JSONArray().put(confirmed().put("minContextSlot",minimum))));
        if (height.compareTo(lastValidBlockHeight)>0) throw new IOException("Swap blockhash expired");
        byte[] bytes=message.bytes();
        JSONObject feeResponse=(JSONObject)rpc.request("getFeeForMessage",new JSONArray().put(b64(bytes))
            .put(confirmed().put("minContextSlot",minimum)));
        context(feeResponse,minimum);
        BigInteger fee=NativeWalletBalances.solanaUnits(feeResponse.get("value"));
        if (fee.signum()<=0 || fee.compareTo(BigInteger.valueOf(1000000))>0) throw new IOException("Swap fee outside supported limit");
        // One empty signature, followed by exactly the candidate message. This is never broadcast.
        byte[] wire=new byte[65+bytes.length]; wire[0]=1; System.arraycopy(bytes,0,wire,65,bytes.length);
        JSONObject response=(JSONObject)rpc.request("simulateTransaction",new JSONArray().put(b64(wire))
            .put(confirmed().put("encoding","base64").put("sigVerify",false).put("replaceRecentBlockhash",false).put("minContextSlot",minimum)));
        BigInteger slot=context(response,minimum);
        JSONObject value=response.getJSONObject("value");
        if (!value.has("err") || !value.isNull("err")) throw new IOException("Swap simulation failed");
        BigInteger units=NativeWalletBalances.solanaUnits(value.get("unitsConsumed"));
        if (units.signum()<=0 || units.compareTo(BigInteger.valueOf(1400000))>0) throw new IOException("Invalid swap compute usage");
        rpc.verifyNetwork();
        long age=SystemClock.elapsedRealtime()-started;
        if (age<0 || age>30000) throw new IOException("Swap simulation expired");
        return new Result(fee,units,slot,bytes);
    }
    private static BigInteger context(JSONObject response, BigInteger minimum) throws Exception {
        BigInteger slot=NativeWalletBalances.solanaUnits(response.getJSONObject("context").get("slot"));
        if (slot.compareTo(minimum)<0) throw new IOException("Stale swap simulation context");
        return slot;
    }
    private static JSONObject confirmed() throws Exception { return new JSONObject().put("commitment","confirmed"); }
    private static String b64(byte[] bytes) { return Base64.encodeToString(bytes,Base64.NO_WRAP); }
}
