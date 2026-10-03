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
    private final NativeSwapSimulation simulation;
    private final NativeSwapSetup.Deriver tokenAddresses;
    private final NativeSwapChainState chainState;
    static final class Preview {
        final Candidate candidate;
        final NativeSwapSimulation.Result simulation;
        final NativeJupiterRoute route;
        final NativeSwapSetup setup;
        final NativeSwapChainState.Result balances;
        private Preview(Candidate candidate, NativeSwapSimulation.Result simulation, NativeJupiterRoute route,NativeSwapSetup setup,NativeSwapChainState.Result balances) {
            this.candidate=candidate; this.simulation=simulation; this.route=route; this.setup=setup; this.balances=balances;
        }
    }
    NativeSwapService() {
        this(NativeSwapService::request,new NativeSolanaAccounts(),new Clock() {
            public long wall() { return System.currentTimeMillis(); }
            public long elapsed() { return SystemClock.elapsedRealtime(); }
        });
    }
    NativeSwapService(Transport transport, NativeSolanaAccounts accounts, Clock clock) {
        this(transport,accounts,clock,new NativeSwapSimulation());
    }
    NativeSwapService(Transport transport, NativeSolanaAccounts accounts, Clock clock, NativeSwapSimulation simulation) {
        this(transport,accounts,clock,simulation,NativeTokenAddresses::associated);
    }
    NativeSwapService(Transport transport, NativeSolanaAccounts accounts, Clock clock, NativeSwapSimulation simulation,NativeSwapSetup.Deriver tokenAddresses) {
        this(transport,accounts,clock,simulation,tokenAddresses,new NativeSwapChainState());
    }
    NativeSwapService(Transport transport, NativeSolanaAccounts accounts, Clock clock, NativeSwapSimulation simulation,NativeSwapSetup.Deriver tokenAddresses,NativeSwapChainState chainState) {
        if (transport==null || accounts==null || clock==null || simulation==null) throw new IllegalArgumentException("Missing swap dependencies");
        this.transport=transport; this.accounts=accounts; this.clock=clock;
        this.simulation=simulation;
        if(tokenAddresses==null) throw new IllegalArgumentException("Missing token address derivation");
        this.tokenAddresses=tokenAddresses;
        if(chainState==null) throw new IllegalArgumentException("Missing token account state reader");
        this.chainState=chainState;
    }
    /** Produces review evidence; account/instruction policy must still approve the candidate. */
    Preview preview(NativeSwapPreparation.Intent intent) throws Exception {
        long start=clock.elapsed();
        Candidate candidate=prepare(intent);
        SolanaLookupTables.Resolved resolved=accounts.resolve(candidate.message);
        NativeJupiterRoute route=NativeJupiterRoute.inspect(candidate.message,resolved,candidate.preparation);
        NativeSwapSetup setup=NativeSwapSetup.inspect(candidate.message,resolved,route,candidate.preparation,tokenAddresses);
        NativeSwapChainState.Result balances=chainState.inspect(candidate.message,resolved,candidate.preparation,route,setup);
        NativeSwapSimulation.Result result=simulation.inspect(candidate.message,intent.payer,candidate.preparation.lastValidBlockHeight);
        if(balances.solBalance.compareTo(setup.wrappedSol.add(result.fee))<0) throw new IOException("Insufficient SOL including swap fee");
        long elapsed=clock.elapsed()-start;
        if (!result.matches(candidate.message) || elapsed<0 || elapsed>15000 || clock.wall()>=candidate.preparation.expiresAt)
            throw new IOException("Swap preview expired; request a new quote");
        return new Preview(candidate,result,route,setup,balances);
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
