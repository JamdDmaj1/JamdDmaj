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
    /** One native bank before requesting a builder. Never replaces simulation. */
    void requirePerpsInitialFunds(String payer,BigInteger margin)throws Exception{
        byte[] wallet=DevnetSolana.decode(payer,32),mint=DevnetSolana.decode(NativePerpsFunding.USDC,32);
        String source=DevnetSolana.encode(SolanaProgramAddress.find("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
            java.util.Arrays.asList(wallet,DevnetSolana.decode(SplTokenAccount.PROGRAM,32),mint)).key());
        rpc.verifyNetwork();
        BigInteger minimum=NativeWalletBalances.solanaUnits(rpc.request("getSlot",new JSONArray().put(new JSONObject().put("commitment","confirmed"))));
        JSONObject reply=(JSONObject)rpc.request("getMultipleAccounts",new JSONArray().put(new JSONArray().put(payer).put(source))
            .put(new JSONObject().put("commitment","confirmed").put("encoding","base64").put("minContextSlot",minimum)));
        BigInteger slot=NativeWalletBalances.solanaUnits(reply.getJSONObject("context").get("slot"));
        JSONArray values=reply.getJSONArray("value");if(slot.compareTo(minimum)<0||values.length()!=2)throw new IOException("PERPS_BALANCE_UNVERIFIED");
        NativePerpsFundsPreflight.Account owner=fundsAccount(values,0),funding=fundsAccount(values,1);
        rpc.verifyNetwork();NativePerpsFundsPreflight.check(wallet,mint,margin,owner,funding);
    }
    private static NativePerpsFundsPreflight.Account fundsAccount(JSONArray values,int index)throws Exception{
        if(values.isNull(index))return null;JSONObject value=values.getJSONObject(index);JSONArray encoded=value.getJSONArray("data");
        if(!(value.get("owner") instanceof String)||!(value.get("executable") instanceof Boolean)||encoded.length()!=2||!"base64".equals(encoded.get(1))
            ||!(encoded.get(0) instanceof String)||encoded.getString(0).length()>220)throw new IOException("PERPS_BALANCE_UNVERIFIED");
        String text=encoded.getString(0);byte[] data=Base64.decode(text,Base64.NO_WRAP);
        if(!Base64.encodeToString(data,Base64.NO_WRAP).equals(text))throw new IOException("PERPS_BALANCE_UNVERIFIED");
        return new NativePerpsFundsPreflight.Account(value.getString("owner"),value.getBoolean("executable"),NativeWalletBalances.solanaUnits(value.get("lamports")),data);
    }
    /** Market-account checks only. Funding, PDAs, remaining instructions and
     * simulated effects must still pass before any signing review can exist. */
    void verifyPerpsOrderAccounts(NativePerpsTransaction transaction,NativePerpsOrderIntent intent,long trustedNowSeconds)throws Exception{
        if(transaction==null||intent==null)
            throw new IllegalArgumentException("Invalid perps market intent");
        NativePerpsComputeBudget.check(transaction.message);
        requireNoPositionRequests(DevnetSolana.encode(transaction.message.staticKey(0)),intent.asset,intent.side);
        NativePerpsOracleBoundary.check(transaction.message);
        String asset=intent.asset;int side=intent.side;
        List<NativePerpsInstructionData> orderData=new ArrayList<>();
        for(SolanaMessage.Instruction instruction:transaction.message.instructions)
            if(NativePerpsCustody.PROGRAM.equals(DevnetSolana.encode(transaction.message.staticKey(instruction.program)))
                    &&!NativePerpsPreSwapData.recognizes(instruction.data()))
                orderData.add(NativePerpsInstructionData.parse(instruction.data()));
        intent.checkInstructions(orderData,trustedNowSeconds);
        SolanaLookupTables.Resolved resolved=resolve(transaction.message);
        NativePerpsTokenBoundary.check(transaction.message,resolved,asset,side);
        transaction.checkOpeningAccountBindings(resolved);
        NativePerpsCustody market=readPerpsCustody(asset);
        NativePerpsCustody usdc=readPerpsCustody("USDC");
        NativePerpsCustody collateral=side==1?market:usdc;
        NativePerpsPreSwapPlan.LedgerRequirement ledger=NativePerpsPreSwapPlan.inspect(transaction.message,resolved,intent,usdc,collateral);
        NativePerpsInstructionPolicy.check(transaction.message,resolved,intent);
        if(ledger!=null)verifyPerpsTokenLedger(ledger.address);
        market.checkLeverage(intent.leverageTenths);
        collateral.checkLeverage(intent.leverageTenths);
        byte[] expectedPosition=NativePerpsAddresses.position(DevnetSolana.encode(resolved.key(0)),asset,side);
        for(SolanaMessage.Instruction instruction:transaction.message.instructions){
            if(!NativePerpsCustody.PROGRAM.equals(DevnetSolana.encode(transaction.message.staticKey(instruction.program))))continue;
            if(NativePerpsPreSwapData.recognizes(instruction.data()))continue;
            NativePerpsInstructionData data=NativePerpsInstructionData.parse(instruction.data());
            byte[] indexes=instruction.accounts();byte[][] keys=new byte[indexes.length][];
            for(int i=0;i<indexes.length;i++)keys[i]=resolved.key(indexes[i]&255);
            if(!java.util.Arrays.equals(keys[6],expectedPosition))throw new IllegalArgumentException("Perps position differs from owner and market intent");
            if(data.kind==NativePerpsInstructionData.Kind.INCREASE){
                if(data.side!=side)throw new IllegalArgumentException("Perps side differs from intent");
                market.checkIncreaseAccounts(keys,collateral);
            }else if(data.kind==NativePerpsInstructionData.Kind.TPSL){
                if(!java.util.Arrays.equals(keys[7],NativePerpsAddresses.exitRequest(expectedPosition,data.counter)))
                    throw new IllegalArgumentException("Perps exit request differs from position and counter");
            }
        }
    }
    /** An old TP/SL must not silently attach to exposure reopened at the same
     * position PDA. Refuse any remaining request until separately resolved. */
    private void requireNoPositionRequests(String payer,String asset,int side)throws Exception{
        String position=DevnetSolana.encode(NativePerpsAddresses.position(payer,asset,side));rpc.verifyNetwork();
        BigInteger minimum=NativeWalletBalances.solanaUnits(rpc.request("getSlot",new JSONArray().put(new JSONObject().put("commitment","confirmed"))));
        JSONArray filters=new JSONArray().put(new JSONObject().put("memcmp",new JSONObject().put("offset",0).put("bytes","32tkJosYU3Z")))
            .put(new JSONObject().put("memcmp",new JSONObject().put("offset",8).put("bytes",payer)))
            .put(new JSONObject().put("memcmp",new JSONObject().put("offset",104).put("bytes",position)));
        JSONObject response=(JSONObject)rpc.request("getProgramAccounts",new JSONArray().put(NativePerpsCustody.PROGRAM)
            .put(new JSONObject().put("commitment","confirmed").put("encoding","base64").put("withContext",true).put("minContextSlot",minimum)
                .put("dataSlice",new JSONObject().put("offset",0).put("length",0)).put("filters",filters)));
        if(NativeWalletBalances.solanaUnits(response.getJSONObject("context").get("slot")).compareTo(minimum)<0)throw new IOException("PERPS_POSITION_REQUESTS_UNVERIFIED");
        if(response.getJSONArray("value").length()!=0)throw new IOException("PERPS_POSITION_REQUESTS_REQUIRE_REVIEW");rpc.verifyNetwork();
    }
    private void verifyPerpsTokenLedger(String address)throws Exception{
        DevnetSolana.decode(address,32);rpc.verifyNetwork();
        BigInteger minimum=NativeWalletBalances.solanaUnits(rpc.request("getSlot",new JSONArray().put(new JSONObject().put("commitment","confirmed"))));
        JSONObject result=(JSONObject)rpc.request("getAccountInfo",new JSONArray().put(address)
            .put(new JSONObject().put("commitment","confirmed").put("encoding","base64").put("minContextSlot",minimum)));
        if(NativeWalletBalances.solanaUnits(result.getJSONObject("context").get("slot")).compareTo(minimum)<0)throw new IOException("Stale perps ledger snapshot");
        JSONObject value=result.getJSONObject("value");
        if(!(value.get("executable") instanceof Boolean))throw new IOException("Invalid ledger flags");
        JSONArray encoded=value.getJSONArray("data");
        if(encoded.length()!=2||!"base64".equals(encoded.get(1))||!(encoded.get(0) instanceof String))throw new IOException("Invalid ledger encoding");
        String text=encoded.getString(0);
        if(text.length()!=64)throw new IOException("Invalid ledger length");
        byte[] bytes=Base64.decode(text,Base64.NO_WRAP);
        if(!Base64.encodeToString(bytes,Base64.NO_WRAP).equals(text))throw new IOException("Noncanonical ledger data");
        NativePerpsTokenLedger.decode(value.getString("owner"),value.getBoolean("executable"),bytes);
        rpc.verifyNetwork();
    }
    NativePerpsCustody readPerpsCustody(String asset) throws Exception {
        String address=NativePerpsCustody.address(asset);
        rpc.verifyNetwork();
        BigInteger minimum=NativeWalletBalances.solanaUnits(rpc.request("getSlot",new JSONArray().put(new JSONObject().put("commitment","confirmed"))));
        JSONObject result=(JSONObject)rpc.request("getAccountInfo",new JSONArray().put(address)
            .put(new JSONObject().put("commitment","confirmed").put("encoding","base64").put("minContextSlot",minimum)));
        BigInteger slot=NativeWalletBalances.solanaUnits(result.getJSONObject("context").get("slot"));
        if(slot.compareTo(minimum)<0)throw new IOException("Stale custody snapshot");
        JSONObject value=result.getJSONObject("value");
        if(!(value.get("executable") instanceof Boolean))throw new IOException("Invalid custody flags");
        JSONArray encoded=value.getJSONArray("data");
        if(encoded.length()!=2||!"base64".equals(encoded.get(1))||!(encoded.get(0) instanceof String))throw new IOException("Invalid custody encoding");
        String text=encoded.getString(0);
        if(text.length()>10924)throw new IOException("Oversized custody account");
        byte[] bytes=Base64.decode(text,Base64.NO_WRAP);
        if(!Base64.encodeToString(bytes,Base64.NO_WRAP).equals(text))throw new IOException("Noncanonical custody encoding");
        NativePerpsCustody custody=NativePerpsCustody.decode(asset,address,value.getString("owner"),value.getBoolean("executable"),bytes);
        rpc.verifyNetwork();
        return custody;
    }
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
