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
    /** Simulation facts only: not a signing token or execution permission. */
    static final class Evidence {
        final NativePerpsSimulation.Result simulation;
        final NativePerpsPosition position;
        final NativePerpsFunding funding;
        final java.util.List<NativePerpsExitRequest> exits;
        private Evidence(NativePerpsSimulation.Result simulation,NativePerpsPosition position,NativePerpsFunding funding,java.util.List<NativePerpsExitRequest> exits){
            this.simulation=simulation;this.position=position;this.funding=funding;
            this.exits=exits;
        }
    }
    /** Verified display snapshot, not biometric consent or spending authority. */
    static final class Review {
        final Analysis analysis;
        final NativePerpsReviewAmounts amounts;
        private final Evidence evidence;
        private Review(Analysis analysis,Evidence evidence,NativePerpsReviewAmounts amounts){
            this.analysis=analysis;this.evidence=evidence;this.amounts=amounts;
        }
        String description(boolean es){
            NativePerpsOrderIntent i=analysis.intent;
            return i.asset+" · "+(i.side==1?"Long":"Short")+" · Jupiter / Solana mainnet\n\n"+analysis.payer+
                "\n"+(es?"Apalancamiento solicitado: ":"Requested leverage: ")+(i.leverageTenths/10)+"."+(i.leverageTenths%10)+"×"+
                "\n"+(es?"Deslizamiento máximo: ":"Maximum slippage: ")+i.maxSlippageBps+" bps"+
                "\n\n"+(es?"Débito USDC: ":"USDC debit: ")+NativePerpsReviewAmounts.usd(amounts.walletDebitUsdc)+
                "\n"+(es?"Margen acreditado USD: ":"Credited margin USD: ")+NativePerpsReviewAmounts.usd(amounts.creditedCollateralUsd)+
                "\n"+(es?"Costo estimado USD: ":"Estimated cost USD: ")+NativePerpsReviewAmounts.usd(amounts.estimatedTradingCostUsd)+
                "\n"+(es?"Nueva exposición USD: ":"New exposure USD: ")+NativePerpsReviewAmounts.usd(amounts.newExposureUsd)+
                "\n"+(es?"Exposición total USD: ":"Total exposure USD: ")+NativePerpsReviewAmounts.usd(amounts.totalExposureUsd)+
                "\n"+(es?"Garantía total USD: ":"Total collateral USD: ")+NativePerpsReviewAmounts.usd(amounts.totalCollateralUsd)+
                "\n"+(es?"Comisión SOL: ":"SOL fee: ")+NativePerpsReviewAmounts.sol(amounts.networkFeeLamports)+
                "\n"+(es?"Reserva de cuentas SOL: ":"Account rent SOL: ")+NativePerpsReviewAmounts.sol(amounts.rentLockedLamports)+
                "\n"+(es?"Reembolso de cuentas SOL: ":"Account rent refund SOL: ")+NativePerpsReviewAmounts.sol(amounts.rentRefundedLamports)+
                "\nSL: "+(i.stopLoss==null?"—":NativePerpsReviewAmounts.usd(i.stopLoss))+" · TP: "+(i.takeProfit==null?"—":NativePerpsReviewAmounts.usd(i.takeProfit))+
                "\n\n"+(es?"Esta revisión no firma ni envía. Si confirmas, la siguiente huella autoriza esta orden real. Puedes perder todo el margen. Si caduca o cambian los costos, revisa una orden nueva.":"This review does not sign or send. If you confirm, the next biometric approval authorizes this real order. You can lose all margin. If it expires or costs change, review a fresh order.");
        }
    }
    private final Transport transport;
    private final Accounts accounts;
    private final NativeSwapService.Clock clock;
    private final NativePerpsSimulation simulator;
    private boolean used;
    private volatile boolean invalidated;
    private Analysis current;
    private Review currentReview;
    NativePerpsService(){this(new Live());}
    private NativePerpsService(Live live){this(live::prepare,new NativeSolanaAccounts()::verifyPerpsOrderAccounts,live.clock);}
    NativePerpsService(Transport transport,Accounts accounts,NativeSwapService.Clock clock){
        this(transport,accounts,clock,new NativePerpsSimulation());
    }
    NativePerpsService(Transport transport,Accounts accounts,NativeSwapService.Clock clock,NativePerpsSimulation simulator){
        if(transport==null||accounts==null||clock==null)throw new IllegalArgumentException("Missing perps preparation dependencies");
        if(simulator==null)throw new IllegalArgumentException("Missing perps simulation");
        this.transport=transport;this.accounts=accounts;this.clock=clock;this.simulator=simulator;
    }
    synchronized Analysis analyze(String payer,NativePerpsOrderIntent intent)throws Exception{
        DevnetSolana.decode(payer,32);if(intent==null)throw new IllegalArgumentException("Missing native order intent");
        if(used||invalidated)throw new IOException("Request a fresh perps analysis session");used=true;
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
        if(invalidated||duration<0||duration>15000||clock.wall()>=expires)throw new IOException("Perps analysis expired");
        // Deliberately cannot produce a NativeSwapReview or a signing token.
        // All other instructions, funding/effects and counter-signing remain
        // separate mandatory gates before a perps signing path can be added.
        current=new Analysis(transaction,intent,payer,height,expires);return current;
    }
    Evidence simulate(Analysis analysis)throws Exception{return simulate(analysis,simulator);}
    synchronized Review review(String payer,NativePerpsOrderIntent intent)throws Exception{
        Analysis analysis=analyze(payer,intent);
        Evidence evidence=simulate(analysis);
        NativePerpsReviewAmounts amounts=amounts(analysis,evidence);
        if(invalidated||clock.wall()>=analysis.expiresAt)throw new IOException("Perps review expired");
        currentReview=new Review(analysis,evidence,amounts);return currentReview;
    }
    private static NativePerpsReviewAmounts amounts(Analysis analysis,Evidence evidence){
        String payer=analysis.payer;NativePerpsOrderIntent intent=analysis.intent;
        String address=DevnetSolana.encode(NativePerpsAddresses.position(payer,intent.asset,intent.side));
        NativePerpsSimulation.Account old=evidence.simulation.before.get(address);
        NativePerpsPosition previous=old==null?null:NativePerpsPosition.decode(address,old.owner,old.executable,old.data(),payer,intent.asset,intent.side);
        return new NativePerpsReviewAmounts(evidence.funding.usdcDebit,
            previous==null?BigInteger.ZERO:previous.sizeUsd,previous==null?BigInteger.ZERO:previous.collateralUsd,
            evidence.position.sizeUsd,evidence.position.collateralUsd,evidence.funding.networkFee,
            evidence.funding.rentLocked,evidence.funding.rentRefunded);
    }
    synchronized void revalidate(Review review)throws Exception{
        requireCurrentReview(review);
        accounts.verify(review.analysis.transaction,review.analysis.intent,clock.wall()/1000);
        Evidence fresh=simulate(review.analysis);
        if(fresh.simulation.slot.compareTo(review.evidence.simulation.slot)<0
                ||!review.amounts.sameAs(amounts(review.analysis,fresh)))throw new IOException("Perps costs or position changed; review a fresh order");
        requireCurrentReview(review);
    }
    synchronized void requireCurrentReview(Review review)throws IOException{
        if(invalidated||review==null||review!=currentReview||review.analysis!=current||clock.wall()>=review.analysis.expiresAt
                ||!review.evidence.simulation.matches(review.analysis.transaction))throw new IOException("Request a fresh perps review");
    }
    // Called from UI lifecycle callbacks: never wait for a network-held monitor.
    void invalidate(){invalidated=true;}
    synchronized Evidence simulate(Analysis analysis,NativePerpsSimulation simulator)throws Exception{
        if(invalidated||analysis==null||analysis!=current||simulator==null||clock.wall()>=analysis.expiresAt)throw new IOException("Missing or expired perps analysis");
        NativePerpsSimulation.Result result=simulator.inspect(analysis.transaction,analysis.intent,analysis.payer,analysis.lastValidBlockHeight);
        if(!result.matches(analysis.transaction)||clock.wall()>=analysis.expiresAt)throw new IOException("Perps simulation differs or expired");
        NativePerpsPosition position=result.checkPositionChange(analysis.transaction,analysis.intent,analysis.payer);
        java.util.List<NativePerpsExitRequest> exits=result.checkExitRequests(analysis.transaction,analysis.intent,analysis.payer);
        NativePerpsFunding funding=simulator.checkFunding(result,analysis.transaction,analysis.intent,analysis.payer);
        if(invalidated||clock.wall()>=analysis.expiresAt)throw new IOException("Perps funding evidence expired");
        return new Evidence(result,position,funding,exits);
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
