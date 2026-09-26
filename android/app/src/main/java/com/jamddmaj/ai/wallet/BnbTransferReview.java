package com.jamddmaj.ai.wallet;

import android.content.Context;
import android.os.SystemClock;
import java.io.IOException;
import java.math.BigInteger;
import java.util.function.BooleanSupplier;
import org.json.JSONArray;
import org.json.JSONObject;

/** Native BNB preparation. No signing or broadcasting; every amount uses exact wei. */
public final class BnbTransferReview {
    private final NativeWalletProfiles.Profile owner;
    private final NativeWalletRpc rpc;
    private final NativeTransferJournal journal;
    public BnbTransferReview(Context context,NativeWalletProfiles.Profile owner) throws Exception {this(context,owner,null);}
    BnbTransferReview(Context context,NativeWalletProfiles.Profile owner,NativeWalletRpc.Transport fixture) throws Exception {
        this.owner=owner;rpc=new NativeWalletRpc(WalletNetwork.BNB_MAINNET,fixture);
        journal=new NativeTransferJournal(context,owner,WalletNetwork.BNB_MAINNET);
    }
    public static final class Draft {
        public final String from,recipient;
        public final BigInteger chainId=BigInteger.valueOf(56),units,nonce,gasPrice,gasLimit,maximumFee;
        private final long started=SystemClock.elapsedRealtime();
        private boolean attempted;
        private Draft(String from,String recipient,BigInteger units,BigInteger nonce,BigInteger price,BigInteger limit){
            this.from=from;this.recipient=recipient;this.units=units;this.nonce=nonce;gasPrice=price;gasLimit=limit;maximumFee=price.multiply(limit);
        }
        void fresh() throws IOException {long age=SystemClock.elapsedRealtime()-started;if(attempted||age<0||age>60000)throw new IOException("Review expired or already attempted");}
        JSONObject transaction() throws Exception {
            return new JSONObject().put("from",from).put("to",recipient).put("value",hex(units))
                .put("nonce",hex(nonce)).put("gasPrice",hex(gasPrice)).put("gas",hex(gasLimit)).put("data","0x");
        }
    }
    static String hex(BigInteger value){return "0x"+value.toString(16);}
    private BigInteger quantity(String method,JSONArray params) throws Exception {return NativeWalletBalances.evmUnits(rpc.request(method,params));}
    private BigInteger nonce() throws Exception {return quantity("eth_getTransactionCount",new JSONArray().put(owner.bnbAddress).put("pending"));}
    private BigInteger balance() throws Exception {return quantity("eth_getBalance",new JSONArray().put(owner.bnbAddress).put("pending"));}
    private BigInteger gasPrice() throws Exception {
        BigInteger price=quantity("eth_gasPrice",new JSONArray());
        if(price.signum()<=0)throw new IOException("Invalid gas price");return price;
    }
    private BigInteger estimate(JSONObject transaction) throws Exception {
        BigInteger gas=quantity("eth_estimateGas",new JSONArray().put(transaction));
        if(gas.compareTo(BigInteger.valueOf(21000))<0||gas.compareTo(BigInteger.valueOf(500000))>0)
            throw new IOException("Gas estimate outside native-transfer limit");
        return gas;
    }
    public Draft prepare(String recipient,String amount) throws Exception {
        recipient=NativeEvmAddress.recipient(recipient);
        if(owner.bnbAddress.equalsIgnoreCase(recipient))throw new IllegalArgumentException("Destination equals sender");
        BigInteger units=WalletNetwork.BNB_MAINNET.parseNativeAmount(amount);
        journal.requireNoPending();rpc.verifyNetwork();
        BigInteger nonce=nonce(),price=gasPrice();
        JSONObject tx=new JSONObject().put("from",owner.bnbAddress).put("to",recipient).put("value",hex(units))
            .put("nonce",hex(nonce)).put("gasPrice",hex(price)).put("data","0x");
        BigInteger estimated=estimate(tx);
        // Explicit, reviewed 20% gas allowance for contract recipients, capped at 500k.
        BigInteger limit=estimated.equals(BigInteger.valueOf(21000))?estimated:estimated.multiply(BigInteger.valueOf(120)).add(BigInteger.valueOf(99)).divide(BigInteger.valueOf(100));
        if(limit.compareTo(BigInteger.valueOf(500000))>0)throw new IOException("Gas allowance exceeds limit");
        Draft draft=new Draft(owner.bnbAddress,recipient,units,nonce,price,limit);
        if(units.add(draft.maximumFee).bitLength()>256||balance().compareTo(units.add(draft.maximumFee))<0)throw new IOException("Insufficient BNB including maximum fee");
        rpc.verifyNetwork();return draft;
    }
    /** Repeat immediately before a separately authorized signature/broadcast; never edits a review. */
    public void revalidate(Draft draft) throws Exception {
        draft.fresh();if(!owner.bnbAddress.equals(draft.from))throw new IOException("Wrong wallet");
        journal.requireNoPending();rpc.verifyNetwork();
        if(!draft.nonce.equals(nonce())||!draft.gasPrice.equals(gasPrice()))throw new IOException("Nonce or fee changed; review again");
        if(estimate(draft.transaction()).compareTo(draft.gasLimit)>0||balance().compareTo(draft.units.add(draft.maximumFee))<0)
            throw new IOException("Balance or gas changed; review again");
        rpc.verifyNetwork();draft.fresh();
    }
    public static final class Signed {
        private final Draft draft;
        private final byte[] encoded;
        public final String transactionId;
        private Signed(Draft draft,byte[] encoded,String transactionId){this.draft=draft;this.encoded=encoded.clone();this.transactionId=transactionId;}
    }
    /** Only invoke from the native biometric vault callback for this reviewed draft. */
    public Signed signReviewed(Draft draft,byte[] unlockedEntropy)throws Exception{
        synchronized(draft){
            draft.fresh();if(!owner.bnbAddress.equals(draft.from))throw new IOException("Wrong wallet");
            byte[] encoded=NativeBnbSigner.sign(unlockedEntropy,draft.from,draft.recipient,draft.units,draft.nonce,draft.gasPrice,draft.gasLimit);
            String id=BnbSignedTransaction.verify(encoded,draft.from,draft.recipient,draft.units,draft.nonce,draft.gasPrice,draft.gasLimit);
            draft.fresh();return new Signed(draft,encoded,id);
        }
    }
    /** Exactly one attempt, no retries. Unknown outcomes remain blocked in the on-disk journal. */
    public String submit(Signed signed,BooleanSupplier authorizedForeground)throws Exception{
        Draft draft=signed.draft;
        synchronized(draft){
            if(!authorizedForeground.getAsBoolean())throw new IOException("Wallet locked");
            revalidate(draft);
            String id=BnbSignedTransaction.verify(signed.encoded,owner.bnbAddress,draft.recipient,draft.units,draft.nonce,draft.gasPrice,draft.gasLimit);
            if(!id.equals(signed.transactionId))throw new IOException("Transaction identity changed");
            if(!authorizedForeground.getAsBoolean())throw new IOException("Wallet locked");
            draft.fresh();draft.attempted=true;
            journal.begin(id,draft.recipient,draft.units,draft.maximumFee);
            if(!authorizedForeground.getAsBoolean())throw new IOException("Wallet locked; check transaction status");
            Object result=rpc.request("eth_sendRawTransaction",new JSONArray().put(NativeEvmAddress.hex(signed.encoded)));
            if(!(result instanceof String)||!id.equalsIgnoreCase((String)result))throw new IOException("Unknown broadcast result; do not resend");
            journal.submitted(id);return id;
        }
    }
    /** Unsupported/unavailable finalized-block queries leave status pending, never pretend success. */
    public NativeTransferJournal.Record checkLatest()throws Exception{
        var record=journal.latest();if(record==null||!record.pending())return record;
        rpc.verifyNetwork();
        Object value=rpc.request("eth_getTransactionReceipt",new JSONArray().put(record.transactionId));
        if(value==null||value==JSONObject.NULL)return record;
        if(!(value instanceof JSONObject))throw new IOException("Invalid receipt");
        JSONObject receipt=(JSONObject)value;
        if(!record.transactionId.equalsIgnoreCase(receipt.getString("transactionHash"))||
            !owner.bnbAddress.equalsIgnoreCase(receipt.getString("from"))||!record.recipient.equalsIgnoreCase(receipt.getString("to")))throw new IOException("Receipt identity mismatch");
        BigInteger height=NativeWalletBalances.evmUnits(receipt.get("blockNumber"));
        BigInteger outcome=NativeWalletBalances.evmUnits(receipt.get("status"));
        if(!outcome.equals(BigInteger.ZERO)&&!outcome.equals(BigInteger.ONE))throw new IOException("Invalid receipt status");
        Object finalValue=rpc.request("eth_getBlockByNumber",new JSONArray().put("finalized").put(false));
        if(!(finalValue instanceof JSONObject))return record;
        BigInteger finalized=NativeWalletBalances.evmUnits(((JSONObject)finalValue).get("number"));
        if(height.compareTo(finalized)>0)return record;
        Object blockValue=rpc.request("eth_getBlockByNumber",new JSONArray().put(hex(height)).put(false));
        if(!(blockValue instanceof JSONObject))return record;
        JSONObject block=(JSONObject)blockValue;String hash=receipt.getString("blockHash");
        if(!hash.matches("0x[0-9a-fA-F]{64}")||!hash.equalsIgnoreCase(block.getString("hash"))||!height.equals(NativeWalletBalances.evmUnits(block.get("number"))))throw new IOException("Receipt block mismatch");
        rpc.verifyNetwork();journal.settled(record.transactionId,outcome.equals(BigInteger.ONE));return journal.latest();
    }
}
