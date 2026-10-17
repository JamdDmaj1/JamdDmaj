package com.jamddmaj.ai.wallet;

import android.os.SystemClock;
import android.util.Base64;
import java.io.IOException;
import java.math.BigInteger;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import org.json.JSONArray;
import org.json.JSONObject;

/** Read-only simulation of the EXACT partially signed transaction, not approval.
 * No one-signature swap serialization, signature attachment or send endpoint. */
final class NativePerpsSimulation {
    static final class Account {
        final String owner;
        final boolean executable;
        final BigInteger lamports;
        private final byte[] data;
        private Account(JSONObject value)throws Exception{
            owner=value.getString("owner");DevnetSolana.decode(owner,32);
            if(!(value.get("executable") instanceof Boolean))throw invalid("Invalid account flag");
            executable=value.getBoolean("executable");lamports=units(value.get("lamports"));
            JSONArray encoded=value.getJSONArray("data");
            if(encoded.length()!=2||!"base64".equals(encoded.get(1))||!(encoded.get(0) instanceof String))throw invalid("Invalid account encoding");
            String text=encoded.getString(0);if(text.length()>21848)throw invalid("Oversized account data");
            data=Base64.decode(text,Base64.NO_WRAP);
            if(data.length>16384||!Base64.encodeToString(data,Base64.NO_WRAP).equals(text))throw invalid("Noncanonical account data");
        }
        byte[] data(){return data.clone();}
    }
    static final class Result {
        final BigInteger fee,unitsConsumed,slot;
        final Map<String,Account> before,after;
        private final byte[] transaction;
        private Result(BigInteger fee,BigInteger units,BigInteger slot,Map<String,Account> before,Map<String,Account> after,byte[] transaction){
            this.fee=fee;unitsConsumed=units;this.slot=slot;this.before=Collections.unmodifiableMap(new LinkedHashMap<>(before));
            this.after=Collections.unmodifiableMap(new LinkedHashMap<>(after));this.transaction=transaction.clone();
        }
        boolean matches(NativePerpsTransaction candidate){return candidate!=null&&Arrays.equals(transaction,candidate.bytes());}
        NativePerpsPosition checkPositionChange(NativePerpsTransaction candidate,NativePerpsOrderIntent intent,String payer)throws Exception{
            if(!matches(candidate)||intent==null)throw invalid("Position evidence differs from transaction");
            String address=DevnetSolana.encode(NativePerpsAddresses.position(payer,intent.asset,intent.side));
            if(!before.containsKey(address)||!after.containsKey(address)||after.get(address)==null)throw invalid("Missing simulated perps position");
            Account previous=before.get(address),next=after.get(address);
            NativePerpsPosition pre=previous==null?null:NativePerpsPosition.decode(address,previous.owner,previous.executable,previous.data(),payer,intent.asset,intent.side);
            NativePerpsPosition post=NativePerpsPosition.decode(address,next.owner,next.executable,next.data(),payer,intent.asset,intent.side);
            NativePerpsInstructionData opening=null;
            for(SolanaMessage.Instruction instruction:candidate.message.instructions)
                if(NativePerpsCustody.PROGRAM.equals(DevnetSolana.encode(candidate.message.staticKey(instruction.program)))){
                    NativePerpsInstructionData data=NativePerpsInstructionData.parse(instruction.data());
                    if(data.kind==NativePerpsInstructionData.Kind.INCREASE){if(opening!=null)throw invalid("Multiple simulated openings");opening=data;}
                }
            NativePerpsPosition.checkIncrease(pre,post,opening,intent);
            return post;
        }
    }
    private final NativeWalletRpc rpc;
    private final NativeSolanaAccounts accounts;
    private final NativeSwapSetup.Deriver deriver;
    NativePerpsSimulation(){this(null,new NativeSolanaAccounts(),NativeTokenAddresses::associated);}
    NativePerpsSimulation(NativeWalletRpc.Transport fixture,NativeSolanaAccounts accounts,NativeSwapSetup.Deriver deriver){
        if(accounts==null||deriver==null)throw new IllegalArgumentException("Missing perps simulation dependencies");
        rpc=new NativeWalletRpc(WalletNetwork.SOLANA_MAINNET,fixture);this.accounts=accounts;this.deriver=deriver;
    }
    Result inspect(NativePerpsTransaction transaction,NativePerpsOrderIntent intent,String payer,BigInteger lastValidHeight)throws Exception{
        if(transaction==null||intent==null||lastValidHeight==null||lastValidHeight.signum()<=0||lastValidHeight.bitLength()>64
                ||!Arrays.equals(transaction.message.staticKey(0),DevnetSolana.decode(payer,32)))throw invalid("Invalid simulation intent");
        long started=SystemClock.elapsedRealtime();
        SolanaLookupTables.Resolved keys=accounts.resolve(transaction.message);
        transaction.checkOpeningAccountBindings(keys);
        LinkedHashSet<String> watched=new LinkedHashSet<>();
        for(int i=0;i<transaction.message.accountCount;i++)if(transaction.message.isWritable(i))watched.add(DevnetSolana.encode(keys.key(i)));
        watched.add(deriver.associated(payer,NativeSolanaTokens.USDC,SplTokenAccount.PROGRAM));
        if(watched.size()>100)throw invalid("Too many simulation accounts");
        List<String> addresses=new ArrayList<>(watched);JSONArray addressJson=new JSONArray();for(String address:addresses)addressJson.put(address);
        rpc.verifyNetwork();
        BigInteger minimum=units(rpc.request("getSlot",new JSONArray().put(confirmed())));
        requireHeight(lastValidHeight,minimum);
        JSONObject beforeResponse=(JSONObject)rpc.request("getMultipleAccounts",new JSONArray().put(addressJson)
            .put(confirmed().put("encoding","base64").put("minContextSlot",minimum)));
        minimum=context(beforeResponse,minimum);
        Map<String,Account> before=snapshot(addresses,beforeResponse.getJSONArray("value"));
        JSONObject feeResponse=(JSONObject)rpc.request("getFeeForMessage",new JSONArray().put(b64(transaction.message.bytes()))
            .put(confirmed().put("minContextSlot",minimum)));
        minimum=context(feeResponse,minimum);BigInteger fee=units(feeResponse.get("value"));
        if(fee.signum()<=0||fee.compareTo(BigInteger.valueOf(1000000))>0)throw invalid("Perps network fee outside supported limit");
        JSONObject options=confirmed().put("encoding","base64").put("sigVerify",false).put("replaceRecentBlockhash",false)
            .put("minContextSlot",minimum).put("accounts",new JSONObject().put("encoding","base64").put("addresses",addressJson));
        JSONObject response=(JSONObject)rpc.request("simulateTransaction",new JSONArray().put(b64(transaction.bytes())).put(options));
        BigInteger slot=context(response,minimum);JSONObject value=response.getJSONObject("value");
        if(!value.has("err")||!value.isNull("err"))throw invalid("Perps simulation failed; no order was sent");
        BigInteger consumed=units(value.get("unitsConsumed"));
        if(consumed.signum()<=0||consumed.compareTo(BigInteger.valueOf(1400000))>0)throw invalid("Invalid perps compute usage");
        Map<String,Account> after=snapshot(addresses,value.getJSONArray("accounts"));
        requireHeight(lastValidHeight,slot);rpc.verifyNetwork();
        long elapsed=SystemClock.elapsedRealtime()-started;if(elapsed<0||elapsed>30000)throw invalid("Perps simulation expired");
        // Returning these snapshots does NOT establish acceptable funding,
        // instruction side effects, fees or resulting position state.
        return new Result(fee,consumed,slot,before,after,transaction.bytes());
    }
    private void requireHeight(BigInteger lastValid,BigInteger minimum)throws Exception{
        BigInteger height=units(rpc.request("getBlockHeight",new JSONArray().put(confirmed().put("minContextSlot",minimum))));
        if(height.compareTo(lastValid)>0)throw invalid("Perps blockhash expired");
    }
    private static Map<String,Account> snapshot(List<String> addresses,JSONArray values)throws Exception{
        if(values.length()!=addresses.size())throw invalid("Incomplete perps account snapshot");
        Map<String,Account> result=new LinkedHashMap<>();
        for(int i=0;i<values.length();i++)result.put(addresses.get(i),values.isNull(i)?null:new Account(values.getJSONObject(i)));
        return result;
    }
    private static BigInteger context(JSONObject response,BigInteger minimum)throws Exception{
        BigInteger slot=units(response.getJSONObject("context").get("slot"));if(slot.compareTo(minimum)<0)throw invalid("Stale perps snapshot");return slot;
    }
    private static BigInteger units(Object value)throws Exception{return NativeWalletBalances.solanaUnits(value);}
    private static JSONObject confirmed()throws Exception{return new JSONObject().put("commitment","confirmed");}
    private static String b64(byte[] bytes){return Base64.encodeToString(bytes,Base64.NO_WRAP);}
    private static IOException invalid(String message){return new IOException(message);}
}
