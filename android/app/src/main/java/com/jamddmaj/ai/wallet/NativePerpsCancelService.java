package com.jamddmaj.ai.wallet;

import android.os.SystemClock;
import android.util.Base64;
import java.io.*;
import java.math.BigInteger;
import java.net.URL;
import java.nio.ByteBuffer;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.Set;
import javax.net.ssl.HttpsURLConnection;
import org.json.JSONObject;

/** One orphan-TP/SL cancellation review; no signer or execution capability. */
final class NativePerpsCancelService {
    interface Transport {JSONObject prepare(NativePerpsCancelIntent intent)throws Exception;}
    static final class Review {
        final NativePerpsCancelIntent intent;final NativePerpsTransaction transaction;final BigInteger height,slot,finalizedFloor;
        final NativePerpsCancelEffects amounts;final long expires;
        private Review(NativePerpsCancelIntent i,NativePerpsTransaction tx,BigInteger height,BigInteger slot,BigInteger finalizedFloor,NativePerpsCancelEffects a,long expires){intent=i;transaction=tx;this.height=height;this.slot=slot;this.finalizedFloor=finalizedFloor;amounts=a;this.expires=expires;}
        String description(boolean es){return intent.asset+" · "+(intent.side==1?"Long":"Short")+" · "+(intent.takeProfit?"TP":"SL")+"\n\n"+intent.payer+
            "\n\n"+(es?"Cancelar solo esta solicitud: ":"Cancel only this request: ")+intent.requestAddress+
            "\n"+(es?"Precio del disparador USD: ":"Trigger price USD: ")+NativePerpsReviewAmounts.usd(intent.triggerPrice)+
            "\n"+(es?"USDC devueltos: ":"USDC returned: ")+NativePerpsReviewAmounts.usd(amounts.returnedUsdc)+
            "\n"+(es?"SOL de cuentas recuperados: ":"Account SOL recovered: ")+NativePerpsReviewAmounts.sol(amounts.recoveredRent)+
            "\n"+(es?"SOL para cuenta USDC: ":"SOL for USDC account: ")+NativePerpsReviewAmounts.sol(amounts.addedRent)+
            "\n"+(es?"Comisión SOL: ":"SOL fee: ")+NativePerpsReviewAmounts.sol(amounts.fee)+
            "\n\n"+(es?"La posición debe seguir cerrada. No abras operaciones de este mercado desde otra aplicación durante la cancelación. La huella autoriza una cancelación real, no un trade. Se esperará finalización y ausencia de la solicitud; un error de conexión no permite reenviar.":"The position must remain closed. Do not trade this market from another application during cancellation. Biometrics authorize one real cancellation, not a trade. Finalization and request absence must be checked; a connection error does not permit a resend.");}
    }
    private final Transport transport;private final NativePerpsCloseChain chain;private final NativePerpsSimulation simulator;private final NativeSwapService.Clock clock;
    private volatile boolean invalidated;private boolean used;private Review current;
    NativePerpsCancelService(){this(new Live());}
    private NativePerpsCancelService(Live live){this(live::prepare,new NativePerpsCloseChain(),new NativePerpsSimulation(),live.clock);}
    NativePerpsCancelService(Transport t,NativePerpsCloseChain c,NativePerpsSimulation s,NativeSwapService.Clock clock){if(t==null||c==null||s==null||clock==null)throw new IllegalArgumentException("Missing cancellation dependencies");transport=t;chain=c;simulator=s;this.clock=clock;}
    synchronized Review review(NativePerpsCancelIntent intent)throws Exception{
        if(intent==null||used||invalidated)throw new IOException("Request a fresh cancellation session");used=true;
        Set<String> watched=addresses(intent);NativePerpsCloseChain.Snapshot settled=chain.readFinalized(watched,BigInteger.ZERO);intent.requireState(settled.accounts.get(intent.requestAddress));intent.requireClosedPosition(settled.accounts.get(intent.positionAddress));
        NativePerpsCloseChain.Snapshot initial=chain.read(watched,settled.slot);intent.requireState(initial.accounts.get(intent.requestAddress));intent.requireClosedPosition(initial.accounts.get(intent.positionAddress));
        JSONObject reply=transport.prepare(intent);if(reply==null||!Boolean.TRUE.equals(reply.opt("requireKeeperSignature"))
                ||reply.has("positionRequestPubkey")&&!intent.requestAddress.equals(reply.opt("positionRequestPubkey"))
                ||reply.has("positionPubkey")&&!intent.positionAddress.equals(reply.opt("positionPubkey")))throw new IOException("Cancellation preparation identity mismatch");long expires=Math.addExact(clock.wall(),25000);
        Object encoded=reply.get("serializedTxBase64");if(!(encoded instanceof String)||((String)encoded).length()>1644)throw new IOException("Invalid cancellation encoding");
        byte[] wire=Base64.decode((String)encoded,Base64.NO_WRAP);if(!encoded.equals(Base64.encodeToString(wire,Base64.NO_WRAP)))throw new IOException("Noncanonical cancellation wire");
        NativePerpsTransaction tx=NativePerpsTransaction.decode(wire,intent.payer);
        if(reply.has("transactionType")&&!(tx.message.version==-1?"legacy":"v0").equals(reply.opt("transactionType")))throw new IOException("Cancellation transaction type mismatch");
        Object raw=reply.getJSONObject("txMetadata").get("lastValidBlockHeight");if(!(raw instanceof String||raw instanceof Integer||raw instanceof Long)||!raw.toString().matches("[1-9][0-9]{0,19}"))throw new IOException("Invalid cancellation height");
        BigInteger height=new BigInteger(raw.toString());if(height.bitLength()>64)throw new IOException("Invalid cancellation height");
        Evidence evidence=inspect(tx,intent,height,initial.slot,settled.slot,expires);current=new Review(intent,tx,height,evidence.result.slot,settled.slot,evidence.amounts,expires);return current;
    }
    private static final class Evidence {final NativePerpsSimulation.Result result;final NativePerpsCancelEffects amounts;Evidence(NativePerpsSimulation.Result r,NativePerpsCancelEffects a){result=r;amounts=a;}}
    private Evidence inspect(NativePerpsTransaction tx,NativePerpsCancelIntent intent,BigInteger height,BigInteger minimum,BigInteger finalizedFloor,long expires)throws Exception{
        fresh(expires);NativePerpsCloseChain.Snapshot settled=chain.readFinalized(addresses(intent),finalizedFloor);intent.requireState(settled.accounts.get(intent.requestAddress));intent.requireClosedPosition(settled.accounts.get(intent.positionAddress));
        NativePerpsCancelPolicy.check(tx,chain.resolve(tx.message),intent);
        NativePerpsSimulation.Result result=simulator.inspectCancellation(tx,intent,height,minimum,addresses(intent));
        if(!result.matches(tx))throw new IOException("Cancellation simulation wire changed");NativePerpsCancelPolicy.check(tx,result.resolvedKeys(),intent);
        NativePerpsCancelEffects amounts=NativePerpsCancelEffects.check(intent,result.before,result.after,result.fee,chain.tokenRent());fresh(expires);return new Evidence(result,amounts);
    }
    private static Set<String> addresses(NativePerpsCancelIntent i){return new LinkedHashSet<>(Arrays.asList(i.payer,i.positionAddress,i.requestAddress,i.ownerAta,i.requestAta,NativePerpsCustody.POOL));}
    synchronized void requireCurrentReview(Review review)throws Exception{if(review==null||review!=current)throw new IOException("Cancellation review is not current");fresh(review.expires);}
    synchronized BigInteger revalidate(Review review)throws Exception{requireCurrentReview(review);Evidence next=inspect(review.transaction,review.intent,review.height,review.slot,review.finalizedFloor,review.expires);if(!review.amounts.sameAs(next.amounts))throw new IOException("Cancellation refund or fee changed; review again");requireCurrentReview(review);return next.result.slot;}
    private void fresh(long expires)throws Exception{if(invalidated||clock.wall()>=expires)throw new IOException("Cancellation review expired");}
    void invalidate(){invalidated=true;}
    static JSONObject body(NativePerpsCancelIntent intent)throws Exception{return new JSONObject().put("positionRequestPubkey",intent.requestAddress);}
    private static final class Live {
        final NativeSwapClock clock=new NativeSwapClock(SystemClock::elapsedRealtime);
        JSONObject prepare(NativePerpsCancelIntent intent)throws Exception{
            HttpsURLConnection c=(HttpsURLConnection)new URL("https://perps-api.jup.ag/v2/tpsl").openConnection();c.setInstanceFollowRedirects(false);c.setUseCaches(false);c.setConnectTimeout(10000);c.setReadTimeout(10000);
            c.setRequestMethod("DELETE");c.setDoOutput(true);c.setRequestProperty("Content-Type","application/json");c.setRequestProperty("Accept","application/json");c.setRequestProperty("Cache-Control","no-store");c.setRequestProperty("x-perps-api-version","v2");long started=clock.elapsed();
            try{byte[] bytes=body(intent).toString().getBytes(StandardCharsets.UTF_8);c.setFixedLengthStreamingMode(bytes.length);try(OutputStream out=c.getOutputStream()){out.write(bytes);}
                if(c.getResponseCode()!=200||c.getContentType()==null||!c.getContentType().toLowerCase(java.util.Locale.ROOT).contains("application/json"))throw new IOException("Cancellation preparation unavailable; nothing signed or sent");clock.anchor(c.getHeaderFieldDate("Date",-1),started,c.getHeaderField("Age"));
                try(InputStream in=c.getInputStream()){byte[] reply=DevnetWalletService.readBounded(in,8192);return new JSONObject(StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(reply)).toString());}
            }finally{c.disconnect();}
        }
    }
}
