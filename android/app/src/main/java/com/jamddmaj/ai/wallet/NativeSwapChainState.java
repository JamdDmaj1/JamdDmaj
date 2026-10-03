package com.jamddmaj.ai.wallet;

import android.util.Base64;
import java.io.IOException;
import java.math.BigInteger;
import java.util.*;
import org.json.*;

/** Checks confirmed token ownership and excludes unrelated wallet assets from writable accounts. */
final class NativeSwapChainState {
    private final NativeWalletRpc rpc;
    NativeSwapChainState() { this(null); }
    NativeSwapChainState(NativeWalletRpc.Transport fixture) { rpc=new NativeWalletRpc(WalletNetwork.SOLANA_MAINNET,fixture); }
    static final class Result {
        final BigInteger solBalance, sourceBalance, destinationBalance, sourceLamports, destinationLamports, slot;
        final int inputDecimals, outputDecimals;
        private Result(BigInteger sol,BigInteger input,BigInteger output,BigInteger sourceLamports,BigInteger destinationLamports,BigInteger slot,int inputDecimals,int outputDecimals) {
            solBalance=sol; sourceBalance=input; destinationBalance=output; this.slot=slot;
            this.inputDecimals=inputDecimals; this.outputDecimals=outputDecimals;
            this.sourceLamports=sourceLamports; this.destinationLamports=destinationLamports;
        }
    }
    Result inspect(SolanaMessage message,SolanaLookupTables.Resolved keys,NativeSwapPreparation preparation,
            NativeJupiterRoute route,NativeSwapSetup setup) throws Exception {
        // Extension-specific transfers require their own mint/account policy before support is enabled.
        if(!NativeJupiterRoute.TOKEN.equals(route.sourceTokenProgram) || !NativeJupiterRoute.TOKEN.equals(route.destinationTokenProgram))
            throw new IOException("Token extensions are not yet supported for native swaps");
        LinkedHashSet<String> requested=new LinkedHashSet<>();
        for(int i=0;i<message.accountCount;i++) if(message.isWritable(i)) requested.add(DevnetSolana.encode(keys.key(i)));
        requested.add(preparation.intent.inputMint); requested.add(preparation.intent.outputMint);
        rpc.verifyNetwork();
        BigInteger minimum=NativeWalletBalances.solanaUnits(rpc.request("getSlot",new JSONArray().put(confirmed())));
        List<String> addresses=new ArrayList<>(requested); Map<String,JSONObject> values=new HashMap<>();
        for(int offset=0;offset<addresses.size();offset+=100) {
            JSONArray batch=new JSONArray(); int end=Math.min(offset+100,addresses.size());
            for(int i=offset;i<end;i++) batch.put(addresses.get(i));
            JSONObject response=(JSONObject)rpc.request("getMultipleAccounts",new JSONArray().put(batch).put(confirmed()
                .put("encoding","base64").put("minContextSlot",minimum).put("dataSlice",new JSONObject().put("offset",0).put("length",166))));
            BigInteger slot=NativeWalletBalances.solanaUnits(response.getJSONObject("context").get("slot"));
            if(slot.compareTo(minimum)<0) throw new IOException("Stale token account state");
            minimum=slot;
            JSONArray accounts=response.getJSONArray("value"); if(accounts.length()!=batch.length()) throw new IOException("Incomplete account state");
            for(int i=0;i<accounts.length();i++) values.put(addresses.get(offset+i),accounts.isNull(i)?null:accounts.getJSONObject(i));
        }
        String payer=preparation.intent.payer;
        JSONObject payerAccount=values.get(payer);
        if(payerAccount==null || !NativeSwapSetup.SYSTEM.equals(payerAccount.get("owner"))
                || !Boolean.FALSE.equals(payerAccount.get("executable")) || data(payerAccount).length!=0) throw new IOException("Invalid fee payer account");
        BigInteger sol=NativeWalletBalances.solanaUnits(payerAccount.get("lamports"));
        for(Map.Entry<String,JSONObject> entry:values.entrySet()) {
            JSONObject value=entry.getValue();
            if(value==null || entry.getKey().equals(route.source) || entry.getKey().equals(route.destination)) continue;
            Object program=value.get("owner");
            if(NativeJupiterRoute.TOKEN.equals(program) || NativeJupiterRoute.TOKEN_2022.equals(program)) {
                byte[] bytes=data(value);
                byte[] wallet=DevnetSolana.decode(payer,32);
                if(bytes.length>=165 && (Arrays.equals(Arrays.copyOfRange(bytes,32,64),wallet)
                        || (bytes[72]==1 && Arrays.equals(Arrays.copyOfRange(bytes,76,108),wallet))
                        || (bytes[129]==1 && Arrays.equals(Arrays.copyOfRange(bytes,133,165),wallet))))
                    throw new IOException("Unrelated wallet token account in swap");
            }
        }
        BigInteger source=token(values.get(route.source),payer,preparation.intent.inputMint,setup.createsSource);
        BigInteger destination=token(values.get(route.destination),payer,preparation.intent.outputMint,setup.createsDestination);
        if(!NativeSwapSetup.SOL.equals(preparation.intent.inputMint) && source.compareTo(new BigInteger(preparation.intent.amount))<0)
            throw new IOException("Insufficient input token balance");
        if(sol.compareTo(setup.wrappedSol)<0) throw new IOException("Insufficient SOL to fund swap");
        int inputDecimals=mint(values.get(preparation.intent.inputMint)),outputDecimals=mint(values.get(preparation.intent.outputMint));
        rpc.verifyNetwork();
        return new Result(sol,source,destination,lamports(values.get(route.source)),lamports(values.get(route.destination)),minimum,inputDecimals,outputDecimals);
    }
    static BigInteger token(JSONObject value,String owner,String mint,boolean creating) throws Exception {
        if(value==null) {
            if(!creating) throw new IOException("Required token account missing");
            return BigInteger.ZERO;
        }
        if(!Boolean.FALSE.equals(value.get("executable"))) throw new IOException("Invalid token account flags");
        SplTokenAccount token=SplTokenAccount.decode(value.getString("owner"),false,data(value));
        byte[] expected=DevnetSolana.decode(owner,32), close=token.closeAuthority();
        if(!Arrays.equals(expected,token.owner()) || !Arrays.equals(DevnetSolana.decode(mint,32),token.mint())
                || token.frozen || token.hasDelegate() || (close!=null && !Arrays.equals(close,expected)))
            throw new IOException("Token account ownership or permissions differ");
        if(NativeSwapSetup.SOL.equals(mint)!=(token.nativeReserve!=null)) throw new IOException("Invalid wrapped SOL account");
        return token.amount;
    }
    private static int mint(JSONObject value) throws Exception {
        if(value==null || !NativeJupiterRoute.TOKEN.equals(value.get("owner")) || !Boolean.FALSE.equals(value.get("executable")))
            throw new IOException("Invalid mint program");
        byte[] bytes=data(value);
        if(bytes.length!=82 || bytes[45]!=1) throw new IOException("Uninitialized or invalid mint");
        return bytes[44]&255;
    }
    static BigInteger lamports(JSONObject value) throws Exception { return value==null?BigInteger.ZERO:NativeWalletBalances.solanaUnits(value.get("lamports")); }
    static byte[] data(JSONObject value) throws Exception {
        JSONArray encoded=value.getJSONArray("data");
        if(encoded.length()!=2 || !"base64".equals(encoded.get(1)) || !(encoded.get(0) instanceof String)) throw new IOException("Invalid account encoding");
        String text=encoded.getString(0); if(text.length()>224) throw new IOException("Oversized account prefix");
        byte[] bytes=Base64.decode(text,Base64.NO_WRAP);
        if(bytes.length>166 || !Base64.encodeToString(bytes,Base64.NO_WRAP).equals(text)) throw new IOException("Noncanonical account encoding");
        return bytes;
    }
    private static JSONObject confirmed() throws Exception { return new JSONObject().put("commitment","confirmed"); }
}
