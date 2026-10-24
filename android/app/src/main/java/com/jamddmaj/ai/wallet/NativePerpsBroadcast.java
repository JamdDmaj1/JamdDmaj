package com.jamddmaj.ai.wallet;

import android.util.Base64;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.math.BigInteger;
import java.net.URL;
import java.nio.ByteBuffer;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.util.function.BooleanSupplier;
import javax.net.ssl.HttpsURLConnection;
import org.json.JSONObject;

/** Post-authorization transport only. Does not review or sign an order.
 * The caller must bind the signed envelope to a fresh native review first.
 * No WebView entry point or automatic retry is provided. */
final class NativePerpsBroadcast {
    interface Transport { JSONObject execute(JSONObject request)throws Exception; }
    private final NativeTransferJournal journal;
    private final Transport transport;
    private boolean attempted;
    NativePerpsBroadcast(NativeTransferJournal journal,Transport transport){
        if(journal==null||transport==null)throw new IllegalArgumentException("Missing perps broadcast dependencies");
        this.journal=journal;this.transport=transport;
    }
    synchronized String submit(NativePerpsSignedEnvelope envelope,NativePerpsOrderIntent intent,BigInteger fee,BooleanSupplier foreground)throws Exception{
        if(attempted||envelope==null||intent==null||foreground==null||!foreground.getAsBoolean())throw new IOException("Perps broadcast unavailable");
        journal.requireNoPending();
        JSONObject body=new JSONObject().put("action","increase-position")
            .put("serializedTxBase64",Base64.encodeToString(envelope.bytes(),Base64.NO_WRAP));
        attempted=true;
        // Disk durability must complete BEFORE the first request could leave.
        journal.beginPerps(envelope,intent,fee);
        if(!foreground.getAsBoolean())throw new IOException("Wallet locked; inspect recorded operation before retrying");
        JSONObject result=transport.execute(body);
        if(result==null||!"increase-position".equals(result.opt("action"))||!envelope.transactionId.equals(result.opt("txid")))
            throw new IOException("Unknown perps submission result; do not resend");
        journal.submitted(envelope.transactionId);return envelope.transactionId;
    }
    static Transport live(){return request->{
        HttpsURLConnection connection=(HttpsURLConnection)new URL("https://perps-api.jup.ag/v2/transaction/execute").openConnection();
        connection.setInstanceFollowRedirects(false);connection.setUseCaches(false);
        connection.setConnectTimeout(10000);connection.setReadTimeout(10000);connection.setRequestMethod("POST");connection.setDoOutput(true);
        connection.setRequestProperty("Content-Type","application/json");connection.setRequestProperty("Accept","application/json");
        connection.setRequestProperty("Cache-Control","no-store");
        try{
            byte[] bytes=request.toString().getBytes(StandardCharsets.UTF_8);
            connection.setFixedLengthStreamingMode(bytes.length);
            try(OutputStream output=connection.getOutputStream()){output.write(bytes);}
            if(connection.getResponseCode()!=200)throw new IOException("Perps submission uncertain; inspect recorded operation");
            try(InputStream input=connection.getInputStream()){
                byte[] reply=DevnetWalletService.readBounded(input,4096);
                return new JSONObject(StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(reply)).toString());
            }
        }finally{connection.disconnect();}
    };}
    synchronized String submitClose(NativePerpsSignedEnvelope envelope,NativePerpsCloseIntent intent,BigInteger fee,BigInteger minimumSlot,BooleanSupplier foreground)throws Exception{
        if(attempted||envelope==null||intent==null||foreground==null||!foreground.getAsBoolean())throw new IOException("Native close broadcast unavailable");
        journal.requireNoPending();JSONObject body=new JSONObject().put("action","decrease-position").put("serializedTxBase64",Base64.encodeToString(envelope.bytes(),Base64.NO_WRAP));
        attempted=true;journal.beginPerpsClose(envelope,intent,fee,minimumSlot);
        if(!foreground.getAsBoolean())throw new IOException("Wallet locked; inspect recorded close before retrying");
        JSONObject result=transport.execute(body);
        if(result==null||!"decrease-position".equals(result.opt("action"))||!envelope.transactionId.equals(result.opt("txid")))throw new IOException("Unknown close submission result; do not resend");
        journal.submitted(envelope.transactionId);return envelope.transactionId;
    }
}
