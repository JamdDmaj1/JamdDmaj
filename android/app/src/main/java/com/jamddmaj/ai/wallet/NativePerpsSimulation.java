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
        static Account fromRpc(JSONObject value)throws Exception{return new Account(value);}
    }
    static final class Result {
        final BigInteger fee,unitsConsumed,slot;
        final Map<String,Account> before,after;
        private final byte[] transaction;
        private final SolanaLookupTables.Resolved keys;
        private final String source;
        private Result(BigInteger fee,BigInteger units,BigInteger slot,Map<String,Account> before,Map<String,Account> after,byte[] transaction,SolanaLookupTables.Resolved keys,String source){
            this.fee=fee;unitsConsumed=units;this.slot=slot;this.before=Collections.unmodifiableMap(new LinkedHashMap<>(before));
            this.after=Collections.unmodifiableMap(new LinkedHashMap<>(after));this.transaction=transaction.clone();
            this.keys=keys;this.source=source;
        }
        boolean matches(NativePerpsTransaction candidate){return candidate!=null&&Arrays.equals(transaction,candidate.bytes());}
        SolanaLookupTables.Resolved resolvedKeys(){return keys;}
        List<NativePerpsExitRequest> checkExitRequests(NativePerpsTransaction candidate,NativePerpsOrderIntent intent,String payer)throws Exception{
            if(!matches(candidate)||intent==null)throw invalid("Exit evidence differs from transaction");
            List<NativePerpsExitRequest> exits=new ArrayList<>();
            for(SolanaMessage.Instruction instruction:candidate.message.instructions){
                if(!NativePerpsCustody.PROGRAM.equals(DevnetSolana.encode(keys.key(instruction.program))))continue;
                if(NativePerpsPreSwapData.recognizes(instruction.data()))continue;
                NativePerpsInstructionData data=NativePerpsInstructionData.parse(instruction.data());
                if(data.kind!=NativePerpsInstructionData.Kind.TPSL)continue;
                byte[] indexes=instruction.accounts();if(indexes.length!=20)throw invalid("Invalid exit state roles");
                String address=role(this,indexes,7);Account old=before.get(address),next=after.get(address);
                if(!before.containsKey(address)||next==null||(old!=null&&!(NativePerpsFunding.SYSTEM.equals(old.owner)&&!old.executable&&old.lamports.signum()==0&&old.data.length==0)))
                    throw invalid("Exit request already exists or simulation omitted it");
                exits.add(NativePerpsExitRequest.check(address,next.owner,next.executable,next.data(),payer,intent.asset,intent.side,data));
            }
            if(exits.size()!=(intent.stopLoss==null?0:1)+(intent.takeProfit==null?0:1))throw invalid("Missing simulated protection request");
            return Collections.unmodifiableList(exits);
        }
        NativePerpsPosition checkPositionChange(NativePerpsTransaction candidate,NativePerpsOrderIntent intent,String payer)throws Exception{
            if(!matches(candidate)||intent==null)throw invalid("Position evidence differs from transaction");
            String address=DevnetSolana.encode(NativePerpsAddresses.position(payer,intent.asset,intent.side));
            if(!before.containsKey(address)||!after.containsKey(address)||after.get(address)==null)throw invalid("Missing simulated perps position");
            Account previous=before.get(address),next=after.get(address);
            NativePerpsPosition pre=previous==null?null:NativePerpsPosition.decode(address,previous.owner,previous.executable,previous.data(),payer,intent.asset,intent.side);
            NativePerpsPosition post=NativePerpsPosition.decode(address,next.owner,next.executable,next.data(),payer,intent.asset,intent.side);
            NativePerpsInstructionData opening=null;
            for(SolanaMessage.Instruction instruction:candidate.message.instructions)
                if(NativePerpsCustody.PROGRAM.equals(DevnetSolana.encode(candidate.message.staticKey(instruction.program)))
                        &&!NativePerpsPreSwapData.recognizes(instruction.data())){
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
        String source=deriver.associated(payer,NativeSolanaTokens.USDC,SplTokenAccount.PROGRAM);
        watched.add(source);
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
        return new Result(fee,consumed,slot,before,after,transaction.bytes(),keys,source);
    }
    /** Close snapshot collection only. Never calls the entry validator or
     * produces signing authority. Effects/policy must consume the exact result. */
    Result inspectClose(NativePerpsTransaction transaction,NativePerpsCloseIntent intent,BigInteger lastValidHeight,
            BigInteger minimumSlot,java.util.Set<String> additionalAddresses)throws Exception{
        if(intent==null)throw invalid("Missing close intent");return inspectExactEffects(transaction,intent.payer,intent.positionAddress,lastValidHeight,minimumSlot,additionalAddresses,100);
    }
    Result inspectCancellation(NativePerpsTransaction transaction,NativePerpsCancelIntent intent,BigInteger height,BigInteger minimum,java.util.Set<String> additional)throws Exception{
        if(intent==null)throw invalid("Missing cancellation intent");return inspectExactEffects(transaction,intent.payer,intent.positionAddress,height,minimum,additional,10);
    }
    private Result inspectExactEffects(NativePerpsTransaction transaction,String payer,String positionAddress,BigInteger lastValidHeight,
            BigInteger minimumSlot,java.util.Set<String> additionalAddresses,int maximumAccounts)throws Exception{
        if(transaction==null||lastValidHeight==null||lastValidHeight.signum()<=0||lastValidHeight.bitLength()>64
                ||minimumSlot==null||minimumSlot.signum()<0||minimumSlot.bitLength()>64||additionalAddresses==null
                ||!Arrays.equals(transaction.message.staticKey(0),DevnetSolana.decode(payer,32)))throw invalid("Invalid close simulation intent");
        long started=SystemClock.elapsedRealtime();
        SolanaLookupTables.Resolved keys=accounts.resolve(transaction.message);
        LinkedHashSet<String> watched=new LinkedHashSet<>();
        for(int i=0;i<transaction.message.accountCount;i++)if(transaction.message.isWritable(i))watched.add(DevnetSolana.encode(keys.key(i)));
        for(String address:additionalAddresses){DevnetSolana.decode(address,32);watched.add(address);}
        watched.add(payer);watched.add(positionAddress);
        String source=deriver.associated(payer,NativeSolanaTokens.USDC,SplTokenAccount.PROGRAM);watched.add(source);
        if(watched.size()>maximumAccounts)throw invalid("Too many simulation accounts");
        List<String> addresses=new ArrayList<>(watched);JSONArray encodedAddresses=new JSONArray();for(String address:addresses)encodedAddresses.put(address);
        rpc.verifyNetwork();
        BigInteger slot=units(rpc.request("getSlot",new JSONArray().put(confirmed().put("minContextSlot",minimumSlot))));
        if(slot.compareTo(minimumSlot)<0)throw invalid("Stale close slot");requireHeight(lastValidHeight,slot);
        JSONObject feeReply=(JSONObject)rpc.request("getFeeForMessage",new JSONArray().put(b64(transaction.message.bytes())).put(confirmed().put("minContextSlot",slot)));
        slot=context(feeReply,slot);BigInteger fee=units(feeReply.get("value"));
        if(fee.signum()<=0||fee.compareTo(BigInteger.valueOf(1000000))>0||fee.compareTo(NativePerpsComputeBudget.check(transaction.message))<0)throw invalid("Invalid close network fee");
        Map<String,Account> before=null,after=null;BigInteger consumed=null;
        // A lower-bound slot is not a pinned bank. Discard mismatched read-only
        // samples rather than mixing unrelated traders' changes into a close.
        for(int attempt=0;attempt<3;attempt++){
            long elapsed=SystemClock.elapsedRealtime()-started;if(elapsed<0||elapsed>15000)throw invalid("Close simulation expired");
            JSONObject prior=(JSONObject)rpc.request("getMultipleAccounts",new JSONArray().put(encodedAddresses).put(confirmed().put("encoding","base64").put("minContextSlot",slot)));
            BigInteger oldSlot=context(prior,slot);
            JSONObject options=confirmed().put("encoding","base64").put("sigVerify",false).put("replaceRecentBlockhash",false)
                .put("minContextSlot",slot).put("accounts",new JSONObject().put("encoding","base64").put("addresses",encodedAddresses));
            JSONObject reply=(JSONObject)rpc.request("simulateTransaction",new JSONArray().put(b64(transaction.bytes())).put(options));
            BigInteger nextSlot=context(reply,slot);JSONObject value=reply.getJSONObject("value");
            if(!value.has("err")||!value.isNull("err")||value.has("replacementBlockhash")&&!value.isNull("replacementBlockhash"))throw invalid("Close simulation failed");
            consumed=units(value.get("unitsConsumed"));if(consumed.signum()<=0||consumed.compareTo(BigInteger.valueOf(1400000))>0)throw invalid("Invalid close compute usage");
            Map<String,Account> priorAccounts=snapshot(addresses,prior.getJSONArray("value")),nextAccounts=snapshot(addresses,value.getJSONArray("accounts"));
            slot=oldSlot.max(nextSlot);if(!oldSlot.equals(nextSlot))continue;
            before=priorAccounts;after=nextAccounts;break;
        }
        if(before==null||after==null)throw invalid("Close snapshot bank changed; request a fresh review");
        requireHeight(lastValidHeight,slot);rpc.verifyNetwork();
        long elapsed=SystemClock.elapsedRealtime()-started;if(elapsed<0||elapsed>15000)throw invalid("Close simulation expired");
        return new Result(fee,consumed,slot,before,after,transaction.bytes(),keys,source);
    }
    NativePerpsFunding checkFunding(Result result,NativePerpsTransaction transaction,NativePerpsOrderIntent intent,String payer)throws Exception{
        if(result==null||!result.matches(transaction)||intent==null)throw invalid("Funding evidence differs from transaction");
        long start=SystemClock.elapsedRealtime();
        Map<String,NativePerpsFunding.State> before=fundingStates(result.before),after=fundingStates(result.after);
        Map<String,NativePerpsFunding.Rent> rents=new LinkedHashMap<>();
        Map<String,String> closures=new LinkedHashMap<>();
        String position=DevnetSolana.encode(NativePerpsAddresses.position(payer,intent.asset,intent.side));
        String collateralMint=NativePerpsCustody.mint(intent.side==1?intent.asset:"USDC");
        String collateralAccount=deriver.associated(payer,collateralMint,SplTokenAccount.PROGRAM);
        for(SolanaMessage.Instruction instruction:transaction.message.instructions){
            if(!NativePerpsCustody.PROGRAM.equals(DevnetSolana.encode(result.keys.key(instruction.program))))continue;
            if(NativePerpsPreSwapData.recognizes(instruction.data())){
                NativePerpsPreSwapData auxiliary=NativePerpsPreSwapData.parse(instruction.data());
                if(auxiliary.kind==NativePerpsPreSwapData.Kind.SET_LEDGER){
                    byte[] indexes=instruction.accounts();if(indexes.length!=3)throw invalid("Invalid ledger roles");
                    String address=role(result,indexes,0),tokenAddress=role(result,indexes,1);
                    if(!result.before.containsKey(address)||!result.after.containsKey(address)||!result.before.containsKey(tokenAddress))throw invalid("Missing ledger snapshot");
                    Account old= result.before.get(address),next=result.after.get(address);
                    if(old==null||next==null||!old.lamports.equals(next.lamports))throw invalid("Missing or changed ledger account");
                    NativePerpsTokenLedger.decode(old.owner,old.executable,old.data());
                    Account tokenBefore=result.before.get(tokenAddress);
                    BigInteger amount=BigInteger.ZERO;
                    if(tokenBefore!=null&&!NativePerpsFunding.closed(new NativePerpsFunding.State(tokenBefore.owner,tokenBefore.executable,tokenBefore.lamports,tokenBefore.data()))){
                        SplTokenAccount token=SplTokenAccount.decode(tokenBefore.owner,tokenBefore.executable,tokenBefore.data());
                        if(!Arrays.equals(token.owner(),DevnetSolana.decode(payer,32))||!Arrays.equals(token.mint(),DevnetSolana.decode(collateralMint,32)))throw invalid("Ledger token owner or mint mismatch");
                        amount=token.amount;
                    }
                    NativePerpsTokenLedger.decode(next.owner,next.executable,next.data()).requireSnapshot(tokenAddress,amount);
                }
                continue;
            }
            byte[] indexes=instruction.accounts();if(indexes.length!=20)throw invalid("Invalid funding roles");
            NativePerpsInstructionData data=NativePerpsInstructionData.parse(instruction.data());
            String actualPosition=role(result,indexes,6);
            if(!position.equals(actualPosition))throw invalid("Funding position mismatch");
            addRent(result,rents,position,NativePerpsCustody.PROGRAM,null,null);
            if(data.kind==NativePerpsInstructionData.Kind.INCREASE){
                String funding=role(result,indexes,3);
                if(intent.side==2&&!result.source.equals(funding))throw invalid("Short funding must use native USDC account");
                if(collateralAccount.equals(funding)&&!funding.equals(result.source)){
                    if(!NativePerpsFunding.closed(after.get(funding)))addRent(result,rents,funding,SplTokenAccount.PROGRAM,payer,collateralMint);
                    closures.put(funding,collateralMint);
                }
            }else if(data.kind==NativePerpsInstructionData.Kind.TPSL){
                String request=DevnetSolana.encode(NativePerpsAddresses.exitRequest(DevnetSolana.decode(position,32),data.counter));
                String requestToken=deriver.associated(request,NativeSolanaTokens.USDC,SplTokenAccount.PROGRAM);
                if(!request.equals(role(result,indexes,7))||!requestToken.equals(role(result,indexes,8))
                        ||!result.source.equals(role(result,indexes,3))||!NativeSolanaTokens.USDC.equals(role(result,indexes,13)))throw invalid("Exit funding destination mismatch");
                addRent(result,rents,request,NativePerpsCustody.PROGRAM,null,null);
                addRent(result,rents,requestToken,SplTokenAccount.PROGRAM,request,NativeSolanaTokens.USDC);
            }else throw invalid("Unsupported funding instruction");
        }
        NativePerpsFunding funding=NativePerpsFunding.inspect(payer,result.source,intent.marginUsd,result.fee,before,after,rents,closures);
        rpc.verifyNetwork();long elapsed=SystemClock.elapsedRealtime()-start;
        if(elapsed<0||elapsed>15000)throw invalid("Funding evidence expired");
        return funding;
    }
    private void addRent(Result result,Map<String,NativePerpsFunding.Rent> rents,String address,String program,String owner,String mint)throws Exception{
        if(rents.containsKey(address))return;
        Account account=result.after.get(address);
        if(!result.before.containsKey(address)||account==null)throw invalid("Missing expected rent account");
        BigInteger minimum=units(rpc.request("getMinimumBalanceForRentExemption",new JSONArray().put(account.data.length).put(confirmed())));
        rents.put(address,new NativePerpsFunding.Rent(program,minimum,owner,mint));
    }
    private static String role(Result result,byte[] indexes,int role){return DevnetSolana.encode(result.keys.key(indexes[role]&255));}
    private static Map<String,NativePerpsFunding.State> fundingStates(Map<String,Account> snapshot){
        Map<String,NativePerpsFunding.State> result=new LinkedHashMap<>();
        for(Map.Entry<String,Account> entry:snapshot.entrySet()){
            Account account=entry.getValue();result.put(entry.getKey(),account==null?null:new NativePerpsFunding.State(account.owner,account.executable,account.lamports,account.data()));
        }
        return result;
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
