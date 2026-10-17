package com.jamddmaj.ai.wallet;

import android.os.SystemClock;
import android.util.Base64;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.math.BigInteger;
import java.net.URL;
import java.nio.ByteBuffer;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import javax.net.ssl.HttpsURLConnection;
import org.json.JSONArray;
import org.json.JSONObject;

/** One preparation session: create a new instance for each new quote.
 * Native preparation/identity analysis, NOT a signing review. No signer,
 * broadcast method, activation switch or execution endpoint is exposed. */
final class NativePerpsService {
    interface Transport { JSONObject prepare(String payer,NativePerpsOrderIntent intent)throws Exception; }
    interface Accounts { void verify(NativePerpsTransaction transaction,NativePerpsOrderIntent intent,long nowSeconds)throws Exception; }
    static final class Analysis {
        final NativePerpsTransaction transaction;
        final NativePerpsOrderIntent intent;
        final String payer;
        final BigInteger lastValidBlockHeight;
        final long expiresAt;
        private Analysis(NativePerpsTransaction transaction,NativePerpsOrderIntent intent,String payer,BigInteger height,long expiresAt){
            this.transaction=transaction;this.intent=intent;this.payer=payer;this.lastValidBlockHeight=height;this.expiresAt=expiresAt;
        }
    }
    private final Transport transport;
    private final Accounts accounts;
    private final NativeSwapService.Clock clock;
    private boolean used;
    NativePerpsService(){this(new Live());}
    private NativePerpsService(Live live){this(live::prepare,new NativeSolanaAccounts()::verifyPerpsOrderAccounts,live.clock);}
    NativePerpsService(Transport transport,Accounts accounts,NativeSwapService.Clock clock){
        if(transport==null||accounts==null||clock==null)throw new IllegalArgumentException("Missing perps preparation dependencies");
        this.transport=transport;this.accounts=accounts;this.clock=clock;
    }
    synchronized Analysis analyze(String payer,NativePerpsOrderIntent intent)throws Exception{
        DevnetSolana.decode(payer,32);if(intent==null)throw new IllegalArgumentException("Missing native order intent");
        if(used)throw new IOException("Request a fresh perps analysis session");used=true;
        long start=clock.elapsed();
        JSONObject response=transport.prepare(payer,intent);
        if(response==null)throw new IOException("Missing perps preparation");
        long received=clock.wall(),expires;
        try{expires=Math.addExact(received,15000);}catch(ArithmeticException overflow){throw new IOException("Invalid perps lifetime");}
        Object encoded=response.get("serializedTxBase64");
        if(!(encoded instanceof String)||((String)encoded).length()>1644)throw new IOException("Invalid perps transaction encoding");
        byte[] wire=Base64.decode((String)encoded,Base64.NO_WRAP);
        if(!Base64.encodeToString(wire,Base64.NO_WRAP).equals(encoded))throw new IOException("Noncanonical perps transaction encoding");
        NativePerpsTransaction transaction=NativePerpsTransaction.decode(wire,payer);
        Object rawHeight=response.getJSONObject("txMetadata").get("lastValidBlockHeight");
        if(!(rawHeight instanceof String||rawHeight instanceof Integer||rawHeight instanceof Long)
                ||!rawHeight.toString().matches("[1-9][0-9]{0,19}"))throw new IOException("Invalid perps block height");
        BigInteger height=new BigInteger(rawHeight.toString());if(height.bitLength()>64)throw new IOException("Invalid perps block height");
        String position=response.getString("positionPubkey");
        if(!java.util.Arrays.equals(DevnetSolana.decode(position,32),NativePerpsAddresses.position(payer,intent.asset,intent.side)))
            throw new IOException("Perps response position differs from native intent");
        accounts.verify(transaction,intent,clock.wall()/1000);
        long duration=clock.elapsed()-start;
        if(duration<0||duration>15000||clock.wall()>=expires)throw new IOException("Perps analysis expired");
        // Deliberately cannot produce a NativeSwapReview or a signing token.
        // All other instructions, funding/effects and counter-signing remain
        // separate mandatory gates before a perps signing path can be added.
        return new Analysis(transaction,intent,payer,height,expires);
    }
    static JSONObject body(String payer,NativePerpsOrderIntent intent)throws Exception{
        DevnetSolana.decode(payer,32);if(intent==null)throw new IllegalArgumentException("Missing native order intent");
        JSONObject body=new JSONObject().put("asset",intent.asset).put("inputToken","USDC").put("inputTokenAmount",intent.marginUsd.toString())
            .put("leverage",(intent.leverageTenths/10)+"."+(intent.leverageTenths%10)).put("maxSlippageBps",Integer.toString(intent.maxSlippageBps))
            .put("side",intent.side==1?"long":"short").put("walletAddress",payer);
        JSONArray exits=new JSONArray();
        if(intent.stopLoss!=null)exits.put(new JSONObject().put("receiveToken","USDC").put("triggerPrice",intent.stopLoss.toString()).put("requestType","sl"));
        if(intent.takeProfit!=null)exits.put(new JSONObject().put("receiveToken","USDC").put("triggerPrice",intent.takeProfit.toString()).put("requestType","tp"));
        if(exits.length()>0)body.put("tpsl",exits);
        return body;
    }
    private static final class Live {
        final NativeSwapClock clock=new NativeSwapClock(SystemClock::elapsedRealtime);
        JSONObject prepare(String payer,NativePerpsOrderIntent intent)throws Exception{
            HttpsURLConnection connection=(HttpsURLConnection)new URL("https://perps-api.jup.ag/v1/positions/increase").openConnection();
            connection.setInstanceFollowRedirects(false);connection.setUseCaches(false);connection.setConnectTimeout(10000);connection.setReadTimeout(10000);
            connection.setRequestMethod("POST");connection.setDoOutput(true);
            connection.setRequestProperty("Content-Type","application/json");connection.setRequestProperty("Accept","application/json");
            connection.setRequestProperty("Cache-Control","no-store");connection.setRequestProperty("x-perps-api-version","v2");
            long started=clock.elapsed();
            try{
                byte[] request=body(payer,intent).toString().getBytes(StandardCharsets.UTF_8);
                try(OutputStream output=connection.getOutputStream()){output.write(request);}
                if(connection.getResponseCode()!=200)throw new IOException("Perps preparation unavailable or rejected; no order was signed or sent");
                clock.anchor(connection.getHeaderFieldDate("Date",-1),started,connection.getHeaderField("Age"));
                try(InputStream input=connection.getInputStream()){
                    byte[] bytes=DevnetWalletService.readBounded(input,100000);
                    String text=StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes)).toString();
                    return new JSONObject(text);
                }
            }finally{connection.disconnect();}
        }
    }
}
