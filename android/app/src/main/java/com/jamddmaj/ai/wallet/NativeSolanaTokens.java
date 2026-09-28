package com.jamddmaj.ai.wallet;

import android.os.SystemClock;
import android.util.Base64;
import java.io.IOException;
import java.math.BigDecimal;
import java.math.BigInteger;
import java.util.Arrays;
import java.util.HashSet;
import org.json.JSONArray;
import org.json.JSONObject;

/** Read-only exact USDC balance for the native Solana account, independent of Bitget. */
final class NativeSolanaTokens {
    static final String USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
    private final NativeWalletRpc rpc;
    NativeSolanaTokens() { this(null); }
    NativeSolanaTokens(NativeWalletRpc.Transport fixture) { rpc = new NativeWalletRpc(WalletNetwork.SOLANA_MAINNET,fixture); }
    static final class Balance {
        final BigInteger total, frozen;
        final boolean hasDelegatedAccounts;
        final long observedAt;
        Balance(BigInteger total, BigInteger frozen, boolean delegated) {
            this.total=total; this.frozen=frozen; hasDelegatedAccounts=delegated; observedAt=SystemClock.elapsedRealtime();
        }
        String decimalAmount() { return new BigDecimal(total,6).toPlainString(); }
    }
    Balance readUsdc(String owner) throws Exception {
        byte[] ownerKey=DevnetSolana.decode(owner,32), mintKey=DevnetSolana.decode(USDC,32);
        rpc.verifyNetwork();
        long start=SystemClock.elapsedRealtime();
        BigInteger minimum=NativeWalletBalances.solanaUnits(rpc.request("getSlot",new JSONArray().put(new JSONObject().put("commitment","confirmed"))));
        JSONObject result=(JSONObject)rpc.request("getTokenAccountsByOwner",new JSONArray().put(owner).put(new JSONObject().put("mint",USDC))
            .put(new JSONObject().put("commitment","confirmed").put("encoding","base64").put("minContextSlot",minimum)));
        if(NativeWalletBalances.solanaUnits(result.getJSONObject("context").get("slot")).compareTo(minimum)<0)throw new IOException("Stale token accounts");
        JSONArray values=result.getJSONArray("value");
        if(values.length()>64)throw new IOException("Too many token accounts to verify");
        BigInteger total=BigInteger.ZERO,frozen=BigInteger.ZERO; boolean delegated=false;
        HashSet<String> seen=new HashSet<>();
        for(int i=0;i<values.length();i++){
            JSONObject item=values.getJSONObject(i);String address=item.getString("pubkey");DevnetSolana.decode(address,32);
            if(!seen.add(address))throw new IOException("Duplicate token account");
            JSONObject account=item.getJSONObject("account");
            if(!(account.get("executable") instanceof Boolean))throw new IOException("Invalid account flags");
            JSONArray encoded=account.getJSONArray("data");
            if(encoded.length()!=2||!"base64".equals(encoded.get(1))||!(encoded.get(0) instanceof String))throw new IOException("Invalid token encoding");
            String text=encoded.getString(0);if(text.length()!=220)throw new IOException("Invalid token account size");
            byte[] bytes=Base64.decode(text,Base64.NO_WRAP);
            if(!Base64.encodeToString(bytes,Base64.NO_WRAP).equals(text))throw new IOException("Noncanonical token encoding");
            SplTokenAccount token=SplTokenAccount.decode(account.getString("owner"),account.getBoolean("executable"),bytes);
            if(!Arrays.equals(token.owner(),ownerKey)||!Arrays.equals(token.mint(),mintKey)||token.nativeReserve!=null)throw new IOException("Token identity mismatch");
            total=total.add(token.amount);if(token.frozen)frozen=frozen.add(token.amount);delegated|=token.hasDelegate();
        }
        rpc.verifyNetwork();
        long age=SystemClock.elapsedRealtime()-start;if(age<0||age>30000)throw new IOException("Token balance expired during request");
        return new Balance(total,frozen,delegated);
    }
}
