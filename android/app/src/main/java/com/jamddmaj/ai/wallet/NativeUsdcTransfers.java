package com.jamddmaj.ai.wallet;

import android.content.Context;
import android.os.SystemClock;
import android.util.Base64;
import java.io.IOException;
import java.math.BigInteger;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.*;
import java.util.function.BooleanSupplier;
import org.bouncycastle.math.ec.rfc8032.Ed25519;
import org.json.*;

/** USDC on Solana only. Locally compiled TransferChecked; no provider transaction. */
final class NativeUsdcTransfers {
    private final NativeWalletProfiles.Profile owner;
    private final NativeWalletRpc rpc;
    private final NativeTransferJournal journal;
    private final NativeSwapSetup.Deriver deriver;
    NativeUsdcTransfers(Context context,NativeWalletProfiles.Profile owner) throws Exception {
        this(context,owner,null,NativeTokenAddresses::associated);
    }
    NativeUsdcTransfers(Context context,NativeWalletProfiles.Profile owner,NativeWalletRpc.Transport transport,NativeSwapSetup.Deriver deriver) throws Exception {
        this.owner=owner;this.deriver=deriver;
        rpc=new NativeWalletRpc(WalletNetwork.SOLANA_MAINNET,transport);
        journal=new NativeTransferJournal(context,owner,WalletNetwork.SOLANA_MAINNET);
    }
    static final class Draft {
        final String from,recipient,source,destination;
        final BigInteger units,fee,rent;
        private final BigInteger height;
        private final SolanaMessage message;
        private final long started;
        private boolean consumed;
        Draft(String from,String recipient,String source,String destination,BigInteger units,BigInteger fee,BigInteger rent,
              BigInteger height,SolanaMessage message,long started){
            this.from=from;this.recipient=recipient;this.source=source;this.destination=destination;this.units=units;
            this.fee=fee;this.rent=rent;this.height=height;this.message=message;this.started=started;
        }
    }
    private static JSONObject options() throws Exception {return new JSONObject().put("commitment","confirmed");}
    private static String b64(byte[] data){return Base64.encodeToString(data,Base64.NO_WRAP);}
    private static BigInteger number(Object value){return NativeWalletBalances.solanaUnits(value);}
    private static BigInteger slot(JSONObject response,BigInteger minimum) throws Exception {
        BigInteger value=number(response.getJSONObject("context").get("slot"));
        if(value.compareTo(minimum)<0)throw new IOException("Stale USDC evidence");return value;
    }
    private static void address(String value){
        byte[] key=DevnetSolana.decode(value,32);
        if(!DevnetSolana.encode(key).equals(value)||Arrays.equals(key,new byte[32]))throw new IllegalArgumentException("Invalid destination");
    }
    private static SolanaMessageCompiler.Meta meta(String key,boolean signer,boolean writable){
        return new SolanaMessageCompiler.Meta(DevnetSolana.decode(key,32),signer,writable);
    }
    static SolanaMessage compile(String payer,String recipient,String source,String destination,String hash,BigInteger units,boolean create){
        if(units==null||units.signum()<=0||units.bitLength()>64)throw new IllegalArgumentException("Invalid USDC amount");
        List<SolanaMessageCompiler.Instruction> instructions=new ArrayList<>();
        if(create)instructions.add(new SolanaMessageCompiler.Instruction(DevnetSolana.decode(NativeSwapSetup.ASSOCIATED,32),
            List.of(meta(payer,true,true),meta(destination,false,true),meta(recipient,false,false),meta(NativeSolanaTokens.USDC,false,false),
                meta(NativeSwapSetup.SYSTEM,false,false),meta(SplTokenAccount.PROGRAM,false,false)),new byte[]{1}));
        byte[] data=ByteBuffer.allocate(10).order(ByteOrder.LITTLE_ENDIAN).put((byte)12).putLong(units.longValue()).put((byte)6).array();
        instructions.add(new SolanaMessageCompiler.Instruction(DevnetSolana.decode(SplTokenAccount.PROGRAM,32),
            List.of(meta(source,false,true),meta(NativeSolanaTokens.USDC,false,false),meta(destination,false,true),meta(payer,true,false)),data));
        return SolanaMessageCompiler.compile(DevnetSolana.decode(payer,32),DevnetSolana.decode(hash,32),instructions,List.of(),BigInteger.ZERO);
    }
    private static final class Snapshot {
        BigInteger slot,sol,input,output;boolean create;
    }
    private Snapshot snapshot(String recipient,String source,String destination,BigInteger minimum) throws Exception {
        JSONObject response=(JSONObject)rpc.request("getMultipleAccounts",new JSONArray().put(new JSONArray().put(owner.solanaAddress)
            .put(NativeSolanaTokens.USDC).put(source).put(destination).put(recipient))
            .put(options().put("encoding","base64").put("minContextSlot",minimum)));
        Snapshot s=new Snapshot();s.slot=slot(response,minimum);JSONArray values=response.getJSONArray("value");
        if(values.length()!=5)throw new IOException("Incomplete USDC accounts");
        JSONObject payer=values.getJSONObject(0);systemAccount(payer);
        s.sol=number(payer.get("lamports"));
        if(NativeSwapChainState.mint(values.getJSONObject(1))!=6)throw new IOException("USDC decimals differ");
        s.input=NativeSwapChainState.token(values.isNull(2)?null:values.getJSONObject(2),owner.solanaAddress,NativeSolanaTokens.USDC,false);
        s.create=values.isNull(3);
        s.output=NativeSwapChainState.token(s.create?null:values.getJSONObject(3),recipient,NativeSolanaTokens.USDC,s.create);
        if(!values.isNull(4))systemAccount(values.getJSONObject(4));
        return s;
    }
    private static void systemAccount(JSONObject value) throws Exception {
        if(!NativeSwapSetup.SYSTEM.equals(value.get("owner"))||!Boolean.FALSE.equals(value.get("executable"))
            ||NativeSwapChainState.data(value).length!=0)throw new IOException("Wallet address required, not token account");
    }
    private BigInteger fee(SolanaMessage message,BigInteger minimum) throws Exception {
        JSONObject response=(JSONObject)rpc.request("getFeeForMessage",new JSONArray().put(b64(message.bytes())).put(options().put("minContextSlot",minimum)));
        slot(response,minimum);BigInteger value=number(response.get("value"));
        if(value.signum()<=0||value.compareTo(BigInteger.valueOf(1000000))>0)throw new IOException("Invalid USDC transfer fee");return value;
    }
    private BigInteger rent(boolean create) throws Exception {
        if(!create)return BigInteger.ZERO;
        BigInteger value=number(rpc.request("getMinimumBalanceForRentExemption",new JSONArray().put(165).put(options())));
        if(value.signum()<=0||value.compareTo(BigInteger.valueOf(10000000))>0)throw new IOException("Unexpected account rent");return value;
    }
    private static byte[] wire(SolanaMessage message,byte[] signature) throws IOException {
        byte[] data=message.bytes();if(signature.length!=64||data.length>1167)throw new IOException("Invalid USDC wire");
        byte[] result=new byte[65+data.length];result[0]=1;System.arraycopy(signature,0,result,1,64);System.arraycopy(data,0,result,65,data.length);return result;
    }
    private void simulate(Draft draft,Snapshot before,byte[] signature,boolean verify) throws Exception {
        JSONObject response=(JSONObject)rpc.request("simulateTransaction",new JSONArray().put(b64(wire(draft.message,signature)))
            .put(options().put("encoding","base64").put("sigVerify",verify).put("replaceRecentBlockhash",false).put("minContextSlot",before.slot)
                .put("accounts",new JSONObject().put("encoding","base64").put("addresses",new JSONArray().put(draft.from).put(draft.source).put(draft.destination)))));
        NativeSwapSimulation.validateResponse(response,before.slot);
        JSONArray accounts=response.getJSONObject("value").getJSONArray("accounts");
        if(accounts.length()!=3)throw new IOException("Missing transfer effects");
        JSONObject payer=accounts.getJSONObject(0);systemAccount(payer);
        BigInteger input=NativeSwapChainState.token(accounts.getJSONObject(1),draft.from,NativeSolanaTokens.USDC,false);
        BigInteger output=NativeSwapChainState.token(accounts.getJSONObject(2),draft.recipient,NativeSolanaTokens.USDC,false);
        if(!number(payer.get("lamports")).equals(before.sol.subtract(draft.fee).subtract(draft.rent))
            ||!input.equals(before.input.subtract(draft.units))||!output.equals(before.output.add(draft.units)))throw new IOException("USDC transfer effects differ");
    }
    Draft prepare(String recipient,String amount) throws Exception {
        long started=SystemClock.elapsedRealtime();address(recipient);
        if(recipient.equals(owner.solanaAddress))throw new IllegalArgumentException("Destination must differ");
        BigInteger units=new BigInteger(NativeSwapAmounts.units(amount,6));journal.requireNoPending();rpc.verifyNetwork();
        String source=deriver.associated(owner.solanaAddress,NativeSolanaTokens.USDC,SplTokenAccount.PROGRAM);
        String destination=deriver.associated(recipient,NativeSolanaTokens.USDC,SplTokenAccount.PROGRAM);
        JSONObject latest=(JSONObject)rpc.request("getLatestBlockhash",new JSONArray().put(options()));
        BigInteger minimum=slot(latest,BigInteger.ZERO);
        Snapshot before=snapshot(recipient,source,destination,minimum);
        JSONObject block=latest.getJSONObject("value");
        SolanaMessage message=compile(owner.solanaAddress,recipient,source,destination,block.getString("blockhash"),units,before.create);
        Draft draft=new Draft(owner.solanaAddress,recipient,source,destination,units,fee(message,before.slot),rent(before.create),
            number(block.get("lastValidBlockHeight")),message,started);
        funds(draft,before);simulate(draft,before,new byte[64],false);rpc.verifyNetwork();require(draft,()->true);return draft;
    }
    private static void funds(Draft draft,Snapshot before) throws IOException {
        if(before.input.compareTo(draft.units)<0||before.sol.compareTo(draft.fee.add(draft.rent))<0)throw new IOException("Insufficient USDC or SOL for fee and rent");
    }
    private void require(Draft draft,BooleanSupplier foreground) throws IOException {
        long age=SystemClock.elapsedRealtime()-draft.started;
        if(draft.consumed||age<0||age>60000||!foreground.getAsBoolean()||!owner.solanaAddress.equals(draft.from))throw new IOException("USDC review expired or locked");
    }
    byte[] signReviewed(Draft draft,byte[] entropy,SolanaNativeTransfers.Signer signer,BooleanSupplier foreground) throws Exception {
        synchronized(draft){require(draft,foreground);journal.requireNoPending();
            if(!draft.from.equals(signer.address(entropy)))throw new IOException("Wrong signing wallet");
            byte[] signature=signer.sign(entropy,draft.message.bytes());verify(draft,signature);require(draft,foreground);return signature;}
    }
    private static void verify(Draft draft,byte[] signature) throws IOException {
        byte[] bytes=draft.message.bytes();
        if(signature==null||signature.length!=64||!Ed25519.verify(signature,0,DevnetSolana.decode(draft.from,32),0,bytes,0,bytes.length))throw new IOException("Wrong USDC signature");
    }
    String submit(Draft draft,byte[] signature,BooleanSupplier foreground) throws Exception {
        synchronized(draft){require(draft,foreground);byte[] approved=signature==null?null:signature.clone();
            try{verify(draft,approved);journal.requireNoPending();rpc.verifyNetwork();
                BigInteger minimum=number(rpc.request("getSlot",new JSONArray().put(options())));
                if(number(rpc.request("getBlockHeight",new JSONArray().put(options().put("minContextSlot",minimum)))).compareTo(draft.height)>0)throw new IOException("USDC blockhash expired");
                Snapshot before=snapshot(draft.recipient,draft.source,draft.destination,minimum);funds(draft,before);
                if(!draft.fee.equals(fee(draft.message,before.slot))||!draft.rent.equals(rent(before.create)))throw new IOException("USDC fee or account creation changed");
                simulate(draft,before,approved,true);rpc.verifyNetwork();require(draft,foreground);draft.consumed=true;
                String id=DevnetSolana.encode(approved);journal.beginToken(id,draft.recipient,draft.units,draft.fee.add(draft.rent),NativeSolanaTokens.USDC);
                if(!foreground.getAsBoolean())throw new IOException("Locked; check transaction status");
                Object result=rpc.request("sendTransaction",new JSONArray().put(b64(wire(draft.message,approved))).put(new JSONObject().put("encoding","base64")
                    .put("skipPreflight",false).put("preflightCommitment","confirmed").put("maxRetries",0)));
                if(!id.equals(result))throw new IOException("Unknown USDC submission; do not repeat");journal.submitted(id);return id;
            }finally{if(approved!=null)Arrays.fill(approved,(byte)0);}
        }
    }
}
