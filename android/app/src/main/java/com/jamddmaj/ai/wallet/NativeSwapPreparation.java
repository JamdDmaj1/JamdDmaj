package com.jamddmaj.ai.wallet;

import android.util.Base64;
import java.math.BigInteger;
import java.util.*;
import org.json.*;

/** Native decoding of untrusted server material, NOT permission to sign it. */
final class NativeSwapPreparation {
    static final class Intent {
        final String payer, inputMint, outputMint, amount;
        final int slippageBps;
        Intent(String payer, String inputMint, String outputMint, String amount, int slippageBps) {
            address(payer); address(inputMint); address(outputMint); units(amount);
            if (inputMint.equals(outputMint) || slippageBps < 1 || slippageBps > 500) throw invalid();
            this.payer=payer; this.inputMint=inputMint; this.outputMint=outputMint;
            this.amount=amount; this.slippageBps=slippageBps;
        }
    }
    final Intent intent;
    final BigInteger outAmount, minimumOut, lastValidBlockHeight;
    final long expiresAt;
    private final byte[] blockhash;
    private final List<byte[]> lookupKeys;
    private final List<SolanaMessageCompiler.Instruction> instructions;

    private NativeSwapPreparation(Intent intent, BigInteger outAmount, BigInteger minimumOut,
            BigInteger height, long expiresAt, byte[] blockhash, List<byte[]> keys,
            List<SolanaMessageCompiler.Instruction> instructions) {
        this.intent=intent; this.outAmount=outAmount; this.minimumOut=minimumOut;
        this.lastValidBlockHeight=height; this.expiresAt=expiresAt;
        this.blockhash=blockhash; this.lookupKeys=keys; this.instructions=instructions;
    }
    static NativeSwapPreparation parse(JSONObject envelope, Intent intent, long now) throws JSONException {
        if (envelope == null || intent == null || now < 0 || !Boolean.TRUE.equals(envelope.opt("ok"))) throw invalid();
        JSONObject body=envelope.getJSONObject("preparation");
        if (!"solana-mainnet-beta".equals(body.opt("network")) || !Boolean.FALSE.equals(body.opt("executable"))
                || !Boolean.TRUE.equals(body.opt("requiresNativeValidation")) || body.has("transaction") || body.has("signature")
                || !intent.payer.equals(body.opt("taker")) || !intent.inputMint.equals(body.opt("inputMint"))
                || !intent.outputMint.equals(body.opt("outputMint")) || !intent.amount.equals(body.opt("inAmount"))
                || integer(body.get("slippageBps")) != intent.slippageBps) throw invalid();
        long received=integer(body.get("receivedAt")), expires=integer(body.get("expiresAt"));
        // Fail closed on stale material or a device clock inconsistent with the server.
        if (received < 0 || received > now || expires <= now || expires - received != 15000) throw invalid();
        BigInteger output=units(body.get("outAmount")), minimum=units(body.get("minimumOut"));
        BigInteger floor=output.multiply(BigInteger.valueOf(10000-intent.slippageBps))
            .add(BigInteger.valueOf(9999)).divide(BigInteger.valueOf(10000));
        if (minimum.compareTo(floor)<0 || minimum.compareTo(output)>0) throw invalid();
        byte[] hash=address(body.get("blockhash"));
        BigInteger height=units(body.get("lastValidBlockHeight"));
        JSONArray rawKeys=body.getJSONArray("lookupTableAddresses");
        if (rawKeys.length()>32) throw invalid();
        List<byte[]> keys=new ArrayList<>(); Set<String> seen=new HashSet<>();
        for (int i=0;i<rawKeys.length();i++) {
            byte[] key=address(rawKeys.get(i));
            if (!seen.add(DevnetSolana.encode(key))) throw invalid();
            keys.add(key);
        }
        JSONArray raw=body.getJSONArray("instructions");
        if (raw.length()<1 || raw.length()>64) throw invalid();
        List<SolanaMessageCompiler.Instruction> instructions=new ArrayList<>();
        for (int i=0;i<raw.length();i++) {
            JSONObject instruction=raw.getJSONObject(i);
            byte[] program=address(instruction.get("programId"));
            Object encoded=instruction.get("data");
            if (!(encoded instanceof String) || ((String)encoded).length()>1560) throw invalid();
            byte[] data=Base64.decode((String)encoded,Base64.NO_WRAP);
            if (!Base64.encodeToString(data,Base64.NO_WRAP).equals(encoded)) throw invalid();
            JSONArray rawAccounts=instruction.getJSONArray("accounts");
            if (rawAccounts.length()>256) throw invalid();
            List<SolanaMessageCompiler.Meta> metas=new ArrayList<>();
            for (int j=0;j<rawAccounts.length();j++) {
                JSONObject account=rawAccounts.getJSONObject(j);
                byte[] key=address(account.get("pubkey"));
                Object signer=account.get("isSigner"), writable=account.get("isWritable");
                if (!(signer instanceof Boolean) || !(writable instanceof Boolean)
                        || ((Boolean)signer && !intent.payer.equals(account.get("pubkey")))) throw invalid();
                metas.add(new SolanaMessageCompiler.Meta(key,(Boolean)signer,(Boolean)writable));
            }
            instructions.add(new SolanaMessageCompiler.Instruction(program,metas,data));
        }
        return new NativeSwapPreparation(intent,output,minimum,height,expires,hash,keys,instructions);
    }
    SolanaMessage compile(NativeSolanaAccounts accounts, long now) throws Exception {
        if (now<0 || now>=expiresAt) throw invalid();
        return accounts.compile(address(intent.payer),blockhash,instructions,lookupKeys);
    }
    private static byte[] address(Object value) {
        if (!(value instanceof String) || ((String)value).length()>44) throw invalid();
        byte[] bytes=DevnetSolana.decode((String)value,32);
        if (!DevnetSolana.encode(bytes).equals(value)) throw invalid();
        return bytes;
    }
    private static BigInteger units(Object value) {
        if (!(value instanceof String) || !((String)value).matches("[1-9][0-9]{0,19}")) throw invalid();
        BigInteger amount=new BigInteger((String)value);
        if (amount.bitLength()>64) throw invalid();
        return amount;
    }
    private static long integer(Object value) {
        if (!(value instanceof Integer || value instanceof Long)) throw invalid();
        return ((Number)value).longValue();
    }
    private static IllegalArgumentException invalid() { return new IllegalArgumentException("Invalid or expired swap preparation"); }
}
