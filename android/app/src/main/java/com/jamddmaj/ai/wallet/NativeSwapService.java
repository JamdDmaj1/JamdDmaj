package com.jamddmaj.ai.wallet;

import android.os.SystemClock;
import java.io.InputStream;
import java.io.IOException;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.nio.charset.CodingErrorAction;
import javax.net.ssl.HttpsURLConnection;
import org.json.JSONObject;

/** Unsigned candidate preparation only. Policy approval and user signing are separate. */
final class NativeSwapService {
    interface Transport { JSONObject request(NativeSwapPreparation.Intent intent) throws Exception; }
    interface Clock { long wall(); long elapsed(); }
    static final class Candidate {
        final NativeSwapPreparation preparation;
        final SolanaMessage message;
        private Candidate(NativeSwapPreparation preparation, SolanaMessage message) {
            this.preparation=preparation; this.message=message;
        }
    }
    private final Transport transport;
    private final NativeSolanaAccounts accounts;
    private final Clock clock;
    NativeSwapService() {
        this(NativeSwapService::request,new NativeSolanaAccounts(),new Clock() {
            public long wall() { return System.currentTimeMillis(); }
            public long elapsed() { return SystemClock.elapsedRealtime(); }
        });
    }
    NativeSwapService(Transport transport, NativeSolanaAccounts accounts, Clock clock) {
        if (transport==null || accounts==null || clock==null) throw new IllegalArgumentException("Missing swap dependencies");
        this.transport=transport; this.accounts=accounts; this.clock=clock;
    }
    Candidate prepare(NativeSwapPreparation.Intent intent) throws Exception {
        if (intent==null) throw new IllegalArgumentException("Swap intent required");
        long start=clock.elapsed();
        NativeSwapPreparation preparation=NativeSwapPreparation.parse(transport.request(intent),intent,clock.wall());
        SolanaMessage message=preparation.compile(accounts,clock.wall());
        long duration=clock.elapsed()-start;
        if (duration<0 || duration>15000 || clock.wall()>=preparation.expiresAt)
            throw new IOException("Swap preparation expired; request a new quote");
        return new Candidate(preparation,message);
    }
    private static JSONObject request(NativeSwapPreparation.Intent intent) throws Exception {
        // Fixed first-party server only. No API key or private wallet material enters this request.
        String query="inputMint="+encode(intent.inputMint)+"&outputMint="+encode(intent.outputMint)
            +"&amount="+encode(intent.amount)+"&taker="+encode(intent.payer)+"&slippageBps="+intent.slippageBps;
        HttpsURLConnection connection=(HttpsURLConnection)new URL("https://www.jamddmaj.com/api/swap-build?"+query).openConnection();
        connection.setInstanceFollowRedirects(false); connection.setUseCaches(false);
        connection.setConnectTimeout(10000); connection.setReadTimeout(10000);
        connection.setRequestMethod("GET"); connection.setRequestProperty("Accept","application/json");
        try {
            if (connection.getResponseCode()!=200) throw new IOException("Swap preparation unavailable");
            try (InputStream input=connection.getInputStream()) {
                byte[] bytes=DevnetWalletService.readBounded(input,262144);
                String body=StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes)).toString();
                return new JSONObject(body);
            }
        } finally { connection.disconnect(); }
    }
    private static String encode(String value) throws Exception { return URLEncoder.encode(value,"UTF-8"); }
}
