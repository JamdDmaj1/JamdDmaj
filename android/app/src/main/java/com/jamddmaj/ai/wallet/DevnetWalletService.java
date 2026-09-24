package com.jamddmaj.ai.wallet;

import android.content.Context;
import android.os.SystemClock;
import android.util.AtomicFile;
import android.util.Base64;
import org.json.JSONArray;
import org.json.JSONObject;
import javax.net.ssl.HttpsURLConnection;
import java.io.*;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.function.BooleanSupplier;

/** Native devnet RPC only. Never accepts a configurable host, private key or arbitrary instruction. */
public final class DevnetWalletService {
    public static final String GENESIS="EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
    private static final Object LOCK=new Object();
    private final AtomicFile walletFile,journalFile;
    public DevnetWalletService(Context context){
        walletFile=new AtomicFile(new File(context.getNoBackupFilesDir(),"devnet-wallet-public.json"));
        journalFile=new AtomicFile(new File(context.getNoBackupFilesDir(),"devnet-transfer-public.json"));
    }
    private static String b64(byte[] bytes){return Base64.encodeToString(bytes,Base64.NO_WRAP);}
    private static long number(Object value)throws Exception{if(!(value instanceof Integer)&&!(value instanceof Long))throw new IOException("Invalid RPC number");long n=((Number)value).longValue();if(n<0)throw new IOException("Invalid RPC number");return n;}
    private Object rpc(String method,JSONArray params)throws Exception{
        HttpsURLConnection connection=(HttpsURLConnection)new URL("https://api.devnet.solana.com").openConnection();
        connection.setInstanceFollowRedirects(false);connection.setConnectTimeout(10000);connection.setReadTimeout(10000);connection.setRequestMethod("POST");connection.setRequestProperty("Content-Type","application/json");connection.setDoOutput(true);
        try{
            byte[] body=new JSONObject().put("jsonrpc","2.0").put("id",1).put("method",method).put("params",params).toString().getBytes(StandardCharsets.UTF_8);
            try(OutputStream out=connection.getOutputStream()){out.write(body);}
            if(connection.getResponseCode()!=200)throw new IOException("Devnet HTTP "+connection.getResponseCode());
            JSONObject response;try(InputStream input=connection.getInputStream()){response=new JSONObject(new String(readBounded(input,524288),StandardCharsets.UTF_8));}
            if(response.has("error")||response.optInt("id")!=1||!response.has("result"))throw new IOException("Devnet request rejected");return response.get("result");
        }finally{connection.disconnect();}
    }
    public static byte[] readBounded(InputStream input,int maximum)throws IOException{
        if(input==null)throw new IOException("File unavailable");ByteArrayOutputStream output=new ByteArrayOutputStream();byte[] buffer=new byte[1024];int n;
        while((n=input.read(buffer))!=-1){if(output.size()+n>maximum)throw new IOException("File too large");output.write(buffer,0,n);}return output.toByteArray();
    }
    private void network()throws Exception{if(!GENESIS.equals(rpc("getGenesisHash",new JSONArray())))throw new IOException("Wrong network; devnet required");}
    private JSONObject read(AtomicFile file)throws Exception{
        try(InputStream in=file.openRead()){return new JSONObject(new String(readBounded(in,4096),StandardCharsets.UTF_8));}catch(FileNotFoundException absent){return null;}
    }
    private void write(AtomicFile file,JSONObject value)throws Exception{
        FileOutputStream out=null;try{out=file.startWrite();out.write(value.toString().getBytes(StandardCharsets.UTF_8));file.finishWrite(out);}catch(Exception failure){if(out!=null)file.failWrite(out);throw failure;}
    }
    public JSONObject wallet()throws Exception{
        synchronized(LOCK){JSONObject value=read(walletFile);if(value!=null){if(!"solana:devnet".equals(value.getString("network"))||!value.getString("id").matches("[a-f0-9]{32}"))throw new IOException("Invalid wallet metadata");DevnetSolana.decode(value.getString("address"),32);}return value;}
    }
    public void saveRecoveredWallet(String id,String address)throws Exception{
        if(!id.matches("[a-f0-9]{32}"))throw new IOException("Invalid wallet ID");DevnetSolana.decode(address,32);
        synchronized(LOCK){if(wallet()!=null)throw new IOException("Wallet already exists; no overwrite");write(walletFile,new JSONObject().put("id",id).put("address",address).put("network","solana:devnet"));}
    }
    private String owner()throws Exception{JSONObject value=wallet();if(value==null)throw new IOException("Restore a test backup first");return value.getString("address");}
    private JSONObject journal()throws Exception{
        JSONObject value=read(journalFile);if(value!=null){
            if(!GENESIS.equals(value.getString("genesis"))||!owner().equals(value.getString("owner")))throw new IOException("Invalid pending transaction");DevnetSolana.decode(value.getString("signature"),64);
            if(!java.util.Arrays.asList("uncertain","submitted","confirmed","failed").contains(value.getString("phase")))throw new IOException("Invalid pending status");
        }return value;
    }
    private void noPending()throws Exception{JSONObject record=journal();if(record!=null&&!java.util.Arrays.asList("confirmed","failed").contains(record.getString("phase")))throw new IOException("Pending transaction: check its status first");}
    public long balance()throws Exception{network();return balanceUnchecked(owner());}
    private long balanceUnchecked(String owner)throws Exception{return number(((JSONObject)rpc("getBalance",new JSONArray().put(owner).put(new JSONObject().put("commitment","confirmed")))).get("value"));}
    private long fee(byte[] message)throws Exception{return number(((JSONObject)rpc("getFeeForMessage",new JSONArray().put(b64(message)).put(new JSONObject().put("commitment","confirmed")))).get("value"));}
    private void simulate(byte[] message,byte[] signature,boolean verify)throws Exception{
        JSONObject value=((JSONObject)rpc("simulateTransaction",new JSONArray().put(b64(DevnetSolana.wire(message,signature))).put(new JSONObject().put("encoding","base64").put("sigVerify",verify).put("commitment","confirmed")))).getJSONObject("value");
        if(!value.has("err")||!value.isNull("err"))throw new IOException("Devnet simulation failed");
    }
    public static final class Draft {
        public final String owner,recipient,amount;
        public final long lamports,fee,lastValidBlockHeight;
        private final long deadline;private final byte[] message;private boolean consumed;
        private Draft(String from,String to,String text,long units,long charge,long height,byte[] bytes){owner=from;recipient=to;amount=text;lamports=units;fee=charge;lastValidBlockHeight=height;message=bytes.clone();deadline=SystemClock.elapsedRealtime()+60000;}
        private void fresh()throws IOException{if(SystemClock.elapsedRealtime()>deadline)throw new IOException("Review expired; prepare again");}
    }
    public Draft prepare(String recipient,String amount)throws Exception{
        synchronized(LOCK){noPending();String from=owner();long units=DevnetSolana.lamports(amount);DevnetSolana.decode(recipient,32);network();
            JSONObject latest=((JSONObject)rpc("getLatestBlockhash",new JSONArray().put(new JSONObject().put("commitment","confirmed")))).getJSONObject("value");
            long height=number(latest.get("lastValidBlockHeight"));byte[] message=DevnetSolana.message(from,recipient,latest.getString("blockhash"),units);long charge=fee(message);
            if(charge>1000000||balanceUnchecked(from)<units+charge)throw new IOException("Insufficient test SOL or unexpected fee");simulate(message,new byte[64],false);
            return new Draft(from,recipient,amount,units,charge,height,message);
        }
    }
    public byte[] signReviewed(Draft draft,byte[] temporarySeed)throws Exception{
        draft.fresh();if(!DevnetSolana.address(temporarySeed).equals(draft.owner)||!owner().equals(draft.owner))throw new IOException("Wallet changed");return DevnetSolana.sign(temporarySeed,draft.message);
    }
    public String submit(Draft draft,byte[] signature,BooleanSupplier foreground)throws Exception{
        synchronized(LOCK){if(draft.consumed)throw new IOException("Review already used");draft.consumed=true;noPending();draft.fresh();if(!foreground.getAsBoolean()||!owner().equals(draft.owner))throw new IOException("Locked");network();
            if(number(rpc("getBlockHeight",new JSONArray().put(new JSONObject().put("commitment","confirmed"))))>draft.lastValidBlockHeight)throw new IOException("Blockhash expired");
            if(fee(draft.message)!=draft.fee||balanceUnchecked(draft.owner)<draft.lamports+draft.fee)throw new IOException("Balance or fee changed");
            simulate(draft.message,signature,true);draft.fresh();if(!foreground.getAsBoolean())throw new IOException("Locked");
            String expected=DevnetSolana.encode(signature);JSONObject record=new JSONObject().put("owner",draft.owner).put("genesis",GENESIS).put("signature",expected).put("phase","uncertain");write(journalFile,record);
            if(!foreground.getAsBoolean())throw new IOException("Locked; check pending status");
            Object result=rpc("sendTransaction",new JSONArray().put(b64(DevnetSolana.wire(draft.message,signature))).put(new JSONObject().put("encoding","base64").put("skipPreflight",false).put("preflightCommitment","confirmed").put("maxRetries",0)));
            if(!expected.equals(result))throw new IOException("Unknown submission result; do not resend");write(journalFile,record.put("phase","submitted"));return expected;
        }
    }
    public String status()throws Exception{
        synchronized(LOCK){JSONObject record=journal();if(record==null)return "none";network();
            JSONArray values=((JSONObject)rpc("getSignatureStatuses",new JSONArray().put(new JSONArray().put(record.getString("signature"))).put(new JSONObject().put("searchTransactionHistory",true)))).getJSONArray("value");
            if(values.length()!=1)throw new IOException("Invalid status response");if(!values.isNull(0)){JSONObject value=values.getJSONObject(0);
                boolean settled=java.util.Arrays.asList("confirmed","finalized").contains(value.optString("confirmationStatus"));
                if(settled&&value.has("err"))record.put("phase",value.isNull("err")?"confirmed":"failed");write(journalFile,record);
            }return record.getString("phase")+"\n"+record.getString("signature");
        }
    }
}
