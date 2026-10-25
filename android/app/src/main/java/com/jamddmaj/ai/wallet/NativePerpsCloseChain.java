package com.jamddmaj.ai.wallet;

import java.math.BigInteger;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import org.json.JSONArray;
import org.json.JSONObject;

/** Fixed-mainnet public reads for native closes. No send/sign transport. */
final class NativePerpsCloseChain {
    static final class Snapshot {
        final BigInteger slot;final Map<String,NativePerpsSimulation.Account> accounts;
        Snapshot(BigInteger slot,Map<String,NativePerpsSimulation.Account> accounts){this.slot=slot;this.accounts=Collections.unmodifiableMap(new LinkedHashMap<>(accounts));}
    }
    private final NativeWalletRpc rpc;
    private final NativeSolanaAccounts lookups;
    NativePerpsCloseChain(){this(null);}
    NativePerpsCloseChain(NativeWalletRpc.Transport fixture){rpc=new NativeWalletRpc(WalletNetwork.SOLANA_MAINNET,fixture);lookups=new NativeSolanaAccounts(fixture);}
    Snapshot read(Set<String> addresses,BigInteger minimum)throws Exception{
        return readAt(addresses,minimum,"confirmed");
    }
    Snapshot readFinalized(Set<String> addresses,BigInteger floor)throws Exception{
        if(floor==null||floor.signum()<0||floor.bitLength()>64)throw invalid();rpc.verifyNetwork();
        BigInteger latest=NativeWalletBalances.solanaUnits(rpc.request("getSlot",new JSONArray().put(new JSONObject().put("commitment","finalized"))));
        return readAt(addresses,latest.max(floor),"finalized");
    }
    private Snapshot readAt(Set<String> addresses,BigInteger minimum,String commitment)throws Exception{
        if(addresses==null||addresses.isEmpty()||addresses.size()>100||minimum==null||minimum.signum()<0||minimum.bitLength()>64)throw invalid();
        JSONArray keys=new JSONArray();for(String address:addresses){DevnetSolana.decode(address,32);keys.put(address);}
        rpc.verifyNetwork();JSONObject response=(JSONObject)rpc.request("getMultipleAccounts",new JSONArray().put(keys)
            .put(new JSONObject().put("commitment",commitment).put("encoding","base64").put("minContextSlot",minimum)));
        BigInteger slot=NativeWalletBalances.solanaUnits(response.getJSONObject("context").get("slot"));JSONArray values=response.getJSONArray("value");
        if(slot.compareTo(minimum)<0||values.length()!=addresses.size())throw invalid();Map<String,NativePerpsSimulation.Account> result=new LinkedHashMap<>();
        int index=0;for(String address:addresses){result.put(address,values.isNull(index)?null:NativePerpsSimulation.Account.fromRpc(values.getJSONObject(index)));index++;}
        rpc.verifyNetwork();return new Snapshot(slot,result);
    }
    NativePerpsCustody custody(String asset,Snapshot snapshot){
        String address=NativePerpsCustody.address(asset);NativePerpsSimulation.Account a=snapshot.accounts.get(address);if(a==null)throw invalid();
        return NativePerpsCustody.decode(asset,address,a.owner,a.executable,a.data());
    }
    NativePerpsPosition position(String payer,String asset,int side,Snapshot snapshot){
        String address=DevnetSolana.encode(NativePerpsAddresses.position(payer,asset,side));NativePerpsSimulation.Account a=snapshot.accounts.get(address);
        if(a==null)throw invalid();NativePerpsPosition result=NativePerpsPosition.decode(address,a.owner,a.executable,a.data(),payer,asset,side);if(result.sizeUsd.signum()<=0)throw invalid();return result;
    }
    SolanaLookupTables.Resolved resolve(SolanaMessage message)throws Exception{return lookups.resolve(message);}
    boolean isClosed(String payer,String asset,int side,BigInteger minimumSlot)throws Exception{
        if(minimumSlot==null||minimumSlot.signum()<=0||minimumSlot.bitLength()>64)throw invalid();
        String address=DevnetSolana.encode(NativePerpsAddresses.position(payer,asset,side));Snapshot snapshot=read(Collections.singleton(address),minimumSlot);
        NativePerpsSimulation.Account account=snapshot.accounts.get(address);
        if(account==null)return true;
        if(NativePerpsFunding.SYSTEM.equals(account.owner)&&!account.executable&&account.lamports.signum()==0&&account.data().length==0)return true;
        NativePerpsPosition position=NativePerpsPosition.decode(address,account.owner,account.executable,account.data(),payer,asset,side);
        return position.sizeUsd.signum()==0&&position.collateralUsd.signum()==0&&position.lockedTokens.signum()==0;
    }
    BigInteger tokenRent()throws Exception{
        rpc.verifyNetwork();BigInteger rent=NativeWalletBalances.solanaUnits(rpc.request("getMinimumBalanceForRentExemption",new JSONArray().put(165).put(new JSONObject().put("commitment","confirmed"))));
        if(rent.signum()<=0||rent.compareTo(BigInteger.valueOf(10000000))>0)throw invalid();rpc.verifyNetwork();return rent;
    }
    static final class PendingExits {
        final BigInteger slot;final java.util.List<NativePerpsCancelIntent> exits;
        private PendingExits(BigInteger slot,java.util.List<NativePerpsCancelIntent> exits){this.slot=slot;this.exits=Collections.unmodifiableList(new java.util.ArrayList<>(exits));}
    }
    PendingExits pendingExits(String payer,String asset,int side)throws Exception{
        String position=DevnetSolana.encode(NativePerpsAddresses.position(payer,asset,side));rpc.verifyNetwork();
        BigInteger minimum=NativeWalletBalances.solanaUnits(rpc.request("getSlot",new JSONArray().put(new JSONObject().put("commitment","confirmed"))));
        JSONArray filters=new JSONArray().put(new JSONObject().put("memcmp",new JSONObject().put("offset",0).put("bytes","32tkJosYU3Z")))
            .put(new JSONObject().put("memcmp",new JSONObject().put("offset",8).put("bytes",payer)))
            .put(new JSONObject().put("memcmp",new JSONObject().put("offset",104).put("bytes",position)));
        JSONObject reply=(JSONObject)rpc.request("getProgramAccounts",new JSONArray().put(NativePerpsCustody.PROGRAM)
            .put(new JSONObject().put("commitment","confirmed").put("encoding","base64").put("withContext",true).put("minContextSlot",minimum).put("filters",filters)));
        BigInteger slot=NativeWalletBalances.solanaUnits(reply.getJSONObject("context").get("slot"));JSONArray values=reply.getJSONArray("value");
        if(slot.compareTo(minimum)<0||values.length()>20||!isClosed(payer,asset,side,slot))throw invalid();
        java.util.List<NativePerpsCancelIntent> result=new java.util.ArrayList<>();java.util.Set<String> seen=new java.util.HashSet<>();
        for(int i=0;i<values.length();i++){
            JSONObject row=values.getJSONObject(i);String address=row.getString("pubkey");if(!seen.add(address))throw invalid();
            result.add(NativePerpsCancelIntent.decode(payer,asset,side,address,NativePerpsSimulation.Account.fromRpc(row.getJSONObject("account"))));
        }
        rpc.verifyNetwork();return new PendingExits(slot,result);
    }
    boolean cancellationAbsent(String request,String payer,String asset,int side,BigInteger counter,BigInteger minimum)throws Exception{
        if(minimum==null||minimum.signum()<=0||minimum.bitLength()>64||!request.equals(DevnetSolana.encode(NativePerpsAddresses.exitRequest(NativePerpsAddresses.position(payer,asset,side),counter))))throw invalid();
        String ata=DevnetSolana.encode(NativePerpsTokenBoundary.associated(DevnetSolana.decode(request,32),NativePerpsFunding.USDC));
        rpc.verifyNetwork();JSONArray keys=new JSONArray().put(request).put(ata);
        JSONObject reply=(JSONObject)rpc.request("getMultipleAccounts",new JSONArray().put(keys).put(new JSONObject().put("commitment","finalized").put("encoding","base64").put("minContextSlot",minimum)));
        if(NativeWalletBalances.solanaUnits(reply.getJSONObject("context").get("slot")).compareTo(minimum)<0)throw invalid();JSONArray values=reply.getJSONArray("value");if(values.length()!=2)throw invalid();
        boolean absent=true;for(int i=0;i<2;i++)if(!values.isNull(i)){
            NativePerpsSimulation.Account a=NativePerpsSimulation.Account.fromRpc(values.getJSONObject(i));
            if(!NativePerpsFunding.SYSTEM.equals(a.owner)||a.executable||a.lamports.signum()!=0||a.data().length!=0)absent=false;
        }
        rpc.verifyNetwork();return absent;
    }
    private static IllegalArgumentException invalid(){return new IllegalArgumentException("Native close chain state is missing, stale or unsupported");}
}
