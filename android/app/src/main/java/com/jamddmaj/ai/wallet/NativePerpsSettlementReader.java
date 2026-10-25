package com.jamddmaj.ai.wallet;

import java.io.IOException;
import java.math.BigInteger;
import java.util.*;
import org.bouncycastle.math.ec.rfc8032.Ed25519;
import org.json.*;

/** Fixed-mainnet finalized transaction evidence. No signer, builder or send. */
final class NativePerpsSettlementReader {
    private final NativeWalletRpc rpc;
    NativePerpsSettlementReader(){this(null);}
    NativePerpsSettlementReader(NativeWalletRpc.Transport fixture){rpc=new NativeWalletRpc(WalletNetwork.SOLANA_MAINNET,fixture);}
    static final class Payout {
        final BigInteger amount,slot;final String mint;final boolean nativeSol;
        Payout(BigInteger amount,BigInteger slot,String mint,boolean nativeSol){this.amount=amount;this.slot=slot;this.mint=mint;this.nativeSol=nativeSol;}
    }
    Payout close(String payer,NativePerpsSettlementStore.Close close)throws Exception{
        Evidence e=read(payer,close.signature,close.message,close.minimumSlot);
        if(!e.fee.equals(close.fee))throw invalid();BigInteger amount;
        if(close.nativeSol){
            // Remove rent refunds from the SOL delta; never treat them or the
            // pre-existing wallet balance as newly returned collateral.
            amount=e.lam(true,0).subtract(e.lam(false,0)).add(e.fee).add(close.locked).subtract(close.refunded);
        }else amount=e.delta(payer,close.receiveMint(),close.decimals());
        if(amount.signum()<0||amount.bitLength()>64)throw invalid();
        rpc.verifyNetwork();return new Payout(amount,e.slot,close.receiveMint(),close.nativeSol);
    }
    BigInteger conversion(String payer,NativePerpsSettlementStore.Close close)throws Exception{
        if(close.conversion==null)throw invalid();JSONObject c=close.conversion;
        Evidence e=read(payer,c.getString("signature"),c.getString("message"),close.minimumSlot);
        BigInteger amount=e.delta(payer,NativeSolanaTokens.USDC,6),minimum=units(c.get("minimum"));
        if(amount.compareTo(minimum)<0||minimum.signum()<=0)throw invalid();rpc.verifyNetwork();return amount;
    }
    boolean conversionFailed(String payer,NativePerpsSettlementStore.Close close)throws Exception{
        if(close.conversion==null)throw invalid();JSONObject c=close.conversion;
        return read(payer,c.getString("signature"),c.getString("message"),close.minimumSlot,true).failed;
    }
    private Evidence read(String payer,String signature,String expectedMessage,BigInteger minimum)throws Exception{
        return read(payer,signature,expectedMessage,minimum,false);
    }
    private Evidence read(String payer,String signature,String expectedMessage,BigInteger minimum,boolean permitFailure)throws Exception{
        DevnetSolana.decode(payer,32);DevnetSolana.decode(signature,64);rpc.verifyNetwork();
        JSONObject statuses=(JSONObject)rpc.request("getSignatureStatuses",new JSONArray().put(new JSONArray().put(signature)).put(new JSONObject().put("searchTransactionHistory",true)));
        JSONArray values=statuses.getJSONArray("value");if(values.length()!=1||values.isNull(0))throw invalid();JSONObject status=values.getJSONObject(0);
        if(!"finalized".equals(status.opt("confirmationStatus"))||!status.has("err")||!permitFailure&&!status.isNull("err"))throw invalid();
        BigInteger slot=units(status.get("slot"));if(slot.compareTo(minimum)<0||units(statuses.getJSONObject("context").get("slot")).compareTo(slot)<0)throw invalid();
        Object raw=rpc.request("getTransaction",new JSONArray().put(signature).put(new JSONObject().put("encoding","base64").put("commitment","finalized").put("maxSupportedTransactionVersion",0)));
        if(!(raw instanceof JSONObject))throw invalid();JSONObject tx=(JSONObject)raw,meta=tx.getJSONObject("meta");
        if(!slot.equals(units(tx.get("slot")))||!meta.has("err")||meta.isNull("err")!=status.isNull("err")||!permitFailure&&!meta.isNull("err"))throw invalid();
        JSONArray encoded=tx.getJSONArray("transaction");if(encoded.length()!=2||!"base64".equals(encoded.getString(1)))throw invalid();
        byte[] wire=NativePerpsSettlementStore.decode(encoded.getString(0));if(wire.length<66)throw invalid();int count=wire[0]&255;
        if(count<1||count>12||wire.length<=1+64*count)throw invalid();byte[] message=Arrays.copyOfRange(wire,1+64*count,wire.length);
        if(!Arrays.equals(message,NativePerpsSettlementStore.decode(expectedMessage))||!signature.equals(DevnetSolana.encode(Arrays.copyOfRange(wire,1,65))))throw invalid();
        SolanaMessage m=SolanaMessage.parse(message);if(m.signatures!=count||!payer.equals(DevnetSolana.encode(m.staticKey(0))))throw invalid();
        for(int i=0;i<count;i++)if(!Ed25519.verify(wire,1+64*i,m.staticKey(i),0,message,0,message.length))throw invalid();
        Object version=tx.get("version");if(m.version==-1?!"legacy".equals(version):!Integer.valueOf(0).equals(version))throw invalid();
        ArrayList<String> keys=new ArrayList<>();for(int i=0;i<m.staticAccountCount();i++)keys.add(DevnetSolana.encode(m.staticKey(i)));
        int writable=0,readonly=0;for(SolanaMessage.Lookup lookup:m.lookups){writable+=lookup.writable().length;readonly+=lookup.readonly().length;}
        if(writable+readonly>0){JSONObject loaded=meta.getJSONObject("loadedAddresses");
            JSONArray w=loaded.getJSONArray("writable"),r=loaded.getJSONArray("readonly");if(w.length()!=writable||r.length()!=readonly)throw invalid();
            for(JSONArray group:new JSONArray[]{w,r})for(int i=0;i<group.length();i++){String key=group.getString(i);DevnetSolana.decode(key,32);keys.add(key);}
        }
        if(keys.size()!=m.accountCount||new HashSet<>(keys).size()!=keys.size())throw invalid();
        Evidence evidence=new Evidence(slot,meta,keys);rpc.verifyNetwork();return evidence;
    }
    private static final class Evidence {
        final BigInteger slot,fee;final JSONObject meta;final List<String> keys;final boolean failed;
        Evidence(BigInteger slot,JSONObject meta,List<String> keys)throws Exception{
            this.slot=slot;this.meta=meta;this.keys=keys;failed=!meta.isNull("err");fee=units(meta.get("fee"));if(fee.signum()==0||fee.compareTo(BigInteger.valueOf(1000000))>0)throw invalid();
            for(String field:new String[]{"preBalances","postBalances"}){JSONArray a=meta.getJSONArray(field);if(a.length()!=keys.size())throw invalid();for(int i=0;i<a.length();i++)units(a.get(i));}
        }
        BigInteger lam(boolean post,int i)throws Exception{return units(meta.getJSONArray(post?"postBalances":"preBalances").get(i));}
        BigInteger delta(String payer,String mint,int decimals)throws Exception{
            String ata=DevnetSolana.encode(NativePerpsTokenBoundary.associated(DevnetSolana.decode(payer,32),mint));int index=keys.indexOf(ata);if(index<0)throw invalid();
            return token(true,index,payer,mint,decimals).subtract(token(false,index,payer,mint,decimals));
        }
        BigInteger token(boolean post,int target,String owner,String mint,int decimals)throws Exception{
            JSONArray a=meta.getJSONArray(post?"postTokenBalances":"preTokenBalances");if(a.length()>keys.size())throw invalid();Set<Integer> seen=new HashSet<>();BigInteger result=null;
            for(int i=0;i<a.length();i++){
                JSONObject b=a.getJSONObject(i);Object n=b.get("accountIndex");if(!(n instanceof Integer))throw invalid();int index=(Integer)n;if(index<0||index>=keys.size()||!seen.add(index))throw invalid();
                if(index!=target)continue;JSONObject amount=b.getJSONObject("uiTokenAmount");
                if(!owner.equals(b.get("owner"))||!mint.equals(b.get("mint"))||!Integer.valueOf(decimals).equals(amount.get("decimals"))||b.has("programId")&&!SplTokenAccount.PROGRAM.equals(b.get("programId")))throw invalid();
                result=units(amount.get("amount"));if(result.signum()>0&&lam(post,target).signum()==0)throw invalid();
            }
            if(result==null){if(lam(post,target).signum()!=0)throw invalid();return BigInteger.ZERO;}return result;
        }
    }
    private static BigInteger units(Object n){return NativePerpsSettlementStore.units(n);}
    private static IOException invalid(){return new IOException("Finalized settlement evidence is incomplete or differs from the recorded operation");}
}
