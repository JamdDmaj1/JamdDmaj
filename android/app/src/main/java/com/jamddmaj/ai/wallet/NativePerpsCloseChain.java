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
        if(addresses==null||addresses.isEmpty()||addresses.size()>100||minimum==null||minimum.signum()<0||minimum.bitLength()>64)throw invalid();
        JSONArray keys=new JSONArray();for(String address:addresses){DevnetSolana.decode(address,32);keys.put(address);}
        rpc.verifyNetwork();JSONObject response=(JSONObject)rpc.request("getMultipleAccounts",new JSONArray().put(keys)
            .put(new JSONObject().put("commitment","confirmed").put("encoding","base64").put("minContextSlot",minimum)));
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
    private static IllegalArgumentException invalid(){return new IllegalArgumentException("Native close chain state is missing, stale or unsupported");}
}
