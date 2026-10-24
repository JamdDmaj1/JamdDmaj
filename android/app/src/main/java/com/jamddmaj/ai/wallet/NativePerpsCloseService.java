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
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;
import javax.net.ssl.HttpsURLConnection;
import org.json.JSONObject;

/** One native collateral-first full-close review. No signer or send method. */
final class NativePerpsCloseService {
    static final long REVIEW_LIFETIME_MS=25000;
    interface Transport {JSONObject prepare(NativePerpsCloseIntent intent)throws Exception;}
    static final class Review {
        final NativePerpsCloseIntent intent;
        final NativePerpsTransaction transaction;
        final BigInteger height,observedSlot;
        final NativePerpsCloseFunding amounts;
        final long expiresAt;
        private Review(NativePerpsCloseIntent intent,NativePerpsTransaction transaction,BigInteger height,NativePerpsSimulation.Result snapshot,NativePerpsCloseFunding amounts,long expiresAt){
            this.intent=intent;this.transaction=transaction;this.height=height;observedSlot=snapshot.slot;this.amounts=amounts;this.expiresAt=expiresAt;
        }
        String description(boolean es){
            int decimals="SOL".equals(intent.receiveToken)?9:"USDC".equals(intent.receiveToken)?6:8;
            String returned=new java.math.BigDecimal(amounts.receivedUnits,decimals).stripTrailingZeros().toPlainString();
            return intent.asset+" · "+(intent.side==1?"Long":"Short")+" · Jupiter / Solana mainnet\n\n"+intent.payer+
                "\n\n"+(es?"Cerrar toda la posición: ":"Close entire position: ")+NativePerpsReviewAmounts.usd(intent.sizeUsd)+" USD"+
                "\n"+(intent.side==1?(es?"Precio mínimo: ":"Minimum price: "):(es?"Precio máximo: ":"Maximum price: "))+NativePerpsReviewAmounts.usd(intent.priceLimit)+" USD"+
                "\n"+(es?"Recibo simulado (puede cambiar): ":"Simulated return (may change): ")+returned+" "+intent.receiveToken+
                (amounts.nativeSol?" · SOL":"")+
                "\n"+(es?"Token · mint en Solana: ":"Token · Solana mint: ")+NativePerpsCustody.mint(intent.receiveToken)+
                "\n"+(es?"Destino del recibo: ":"Return destination: ")+(amounts.nativeSol?intent.payer:DevnetSolana.encode(NativePerpsTokenBoundary.associated(DevnetSolana.decode(intent.payer,32),NativePerpsCustody.mint(intent.receiveToken))))+
                "\n"+(es?"Comisión SOL: ":"SOL fee: ")+NativePerpsReviewAmounts.sol(amounts.networkFee)+
                "\n"+(es?"Reserva de cuentas SOL: ":"Account rent SOL: ")+NativePerpsReviewAmounts.sol(amounts.rentLocked)+
                "\n"+(es?"Reembolso de cuentas SOL: ":"Account rent refund SOL: ")+NativePerpsReviewAmounts.sol(amounts.rentRefunded)+
                "\n\n"+(es?"El precio del cierre está protegido; el recibo simulado no es un mínimo garantizado. No convierte después a USDC ni cancela órdenes TP/SL pendientes. Esas operaciones requieren una revisión separada. Confirmar con huella autoriza este cierre real, no una nueva entrada.":"The close price is protected; the simulated return is not a guaranteed minimum. This does not subsequently convert to USDC or cancel pending TP/SL orders. Those operations require a separate review. Biometric confirmation authorizes this real close, not a new entry.");
        }
    }
    private final Transport transport;private final NativePerpsCloseChain chain;private final NativePerpsSimulation simulator;private final NativeSwapService.Clock clock;
    private volatile boolean invalidated;private boolean used;private Review current;
    NativePerpsCloseService(){this(new Live());}
    private NativePerpsCloseService(Live live){this(live::prepare,new NativePerpsCloseChain(),new NativePerpsSimulation(),live.clock);}
    NativePerpsCloseService(Transport transport,NativePerpsCloseChain chain,NativePerpsSimulation simulator,NativeSwapService.Clock clock){
        if(transport==null||chain==null||simulator==null||clock==null)throw new IllegalArgumentException("Missing native close dependencies");
        this.transport=transport;this.chain=chain;this.simulator=simulator;this.clock=clock;
    }
    synchronized Review review(String payer,String asset,int side,String referencePrice,int bps)throws Exception{
        if(used||invalidated)throw new IOException("Request a fresh native close session");used=true;
        String address=DevnetSolana.encode(NativePerpsAddresses.position(payer,asset,side));
        NativePerpsCloseChain.Snapshot observed=chain.read(java.util.Collections.singleton(address),BigInteger.ZERO);
        NativePerpsCloseIntent intent=new NativePerpsCloseIntent(payer,asset,side,chain.position(payer,asset,side,observed),referencePrice,bps);
        JSONObject response=transport.prepare(intent);if(response==null||!address.equals(response.getString("positionPubkey")))throw new IOException("Close builder position mismatch");
        long expires=Math.addExact(clock.wall(),REVIEW_LIFETIME_MS);Object encoded=response.get("serializedTxBase64");
        if(!(encoded instanceof String)||((String)encoded).length()>1644)throw new IOException("Invalid close encoding");
        byte[] wire=Base64.decode((String)encoded,Base64.NO_WRAP);if(!encoded.equals(Base64.encodeToString(wire,Base64.NO_WRAP)))throw new IOException("Noncanonical close wire");
        NativePerpsTransaction transaction=NativePerpsTransaction.decode(wire,payer);
        Object raw=response.getJSONObject("txMetadata").get("lastValidBlockHeight");
        if(!(raw instanceof String||raw instanceof Integer||raw instanceof Long)||!raw.toString().matches("[1-9][0-9]{0,19}"))throw new IOException("Invalid close block height");
        BigInteger height=new BigInteger(raw.toString());if(height.bitLength()>64)throw new IOException("Invalid close height");
        Evidence evidence=inspect(transaction,intent,height,observed.slot,expires);
        current=new Review(intent,transaction,height,evidence.snapshot,evidence.funding,expires);return current;
    }
    private static final class Evidence {
        final NativePerpsSimulation.Result snapshot;final NativePerpsCloseFunding funding;
        Evidence(NativePerpsSimulation.Result snapshot,NativePerpsCloseFunding funding){this.snapshot=snapshot;this.funding=funding;}
    }
    private Evidence inspect(NativePerpsTransaction transaction,NativePerpsCloseIntent intent,BigInteger height,BigInteger minimum,long expires)throws Exception{
        requireFresh(expires);Set<String> custodyKeys=new LinkedHashSet<>();custodyKeys.add(NativePerpsCustody.address(intent.asset));custodyKeys.add(NativePerpsCustody.address("USDC"));
        NativePerpsCloseChain.Snapshot custodySnapshot=chain.read(custodyKeys,minimum);
        NativePerpsCustody market=chain.custody(intent.asset,custodySnapshot),usdc=chain.custody("USDC",custodySnapshot),collateral=intent.side==1?market:usdc;
        SolanaLookupTables.Resolved keys=chain.resolve(transaction.message);
        NativePerpsCloseBindings binding=NativePerpsCloseBindings.check(transaction,keys,intent,market,collateral,clock.wall()/1000);
        NativePerpsCloseChain.Snapshot ag=chain.read(NativePerpsCloseOracleContext.aggregateKeys(market,collateral),custodySnapshot.slot);
        Set<String> extras=NativePerpsCloseOracleContext.extraKeys(market,collateral,ag.accounts);
        NativePerpsCloseChain.Snapshot extra=chain.read(extras,ag.slot);Map<String,NativePerpsSimulation.Account> oracleAccounts=new LinkedHashMap<>(ag.accounts);oracleAccounts.putAll(extra.accounts);
        NativePerpsCloseOracleContext context=NativePerpsCloseOracleContext.decode(market,collateral,oracleAccounts);
        NativePerpsClosePolicy.check(transaction,keys,intent,market,collateral,context,clock.wall()/1000);
        Set<String> watched=new LinkedHashSet<>(custodyKeys);watched.addAll(oracleAccounts.keySet());watched.add(NativePerpsCustody.POOL);watched.add(binding.collateralAccount);
        for(NativePerpsCustody c:new NativePerpsCustody[]{market,collateral,usdc})watched.add(c.tokenAccount);
        if(binding.requestAddress!=null){watched.add(binding.requestAddress);watched.add(binding.requestAccount);}
        requireFresh(expires);NativePerpsSimulation.Result result=simulator.inspectClose(transaction,intent,height,extra.slot,watched);
        if(!result.matches(transaction))throw new IOException("Close simulation wire changed");
        // All actual authority/effect checks use the SAME before/simulation bank,
        // not the earlier discovery reads or builder-provided identities.
        NativePerpsCloseChain.Snapshot bank=new NativePerpsCloseChain.Snapshot(result.slot,result.before);
        market=chain.custody(intent.asset,bank);usdc=chain.custody("USDC",bank);collateral=intent.side==1?market:usdc;
        keys=result.resolvedKeys();binding=NativePerpsCloseBindings.check(transaction,keys,intent,market,collateral,clock.wall()/1000);
        context=NativePerpsCloseOracleContext.decode(market,collateral,result.before);
        NativePerpsClosePolicy.check(transaction,keys,intent,market,collateral,context,clock.wall()/1000);
        NativePerpsCloseFunding funding=NativePerpsCloseFunding.check(intent,collateral,binding,result.before,result.after,result.fee,chain.tokenRent());
        NativePerpsCloseProtocolEffects.check(intent,market,collateral,usdc,result.before,result.after,funding.receivedUnits);
        NativePerpsCloseOracleEffects.check(transaction,keys,intent,market,collateral,binding,result.before,result.after,clock.wall()/1000);
        requireFresh(expires);return new Evidence(result,funding);
    }
    synchronized void requireCurrentReview(Review review)throws Exception{if(review==null||review!=current)throw new IOException("Close review is not current");requireFresh(review.expiresAt);}
    synchronized BigInteger revalidate(Review review)throws Exception{
        requireCurrentReview(review);Evidence fresh=inspect(review.transaction,review.intent,review.height,review.observedSlot,review.expiresAt);NativePerpsCloseFunding a=review.amounts,b=fresh.funding;
        // Consent protects this exact close's price, fees and delivery, not an
        // absolute collateral minimum that the protocol does not support. The
        // displayed return is expressly an estimate; fresh payout conservation
        // and every price/protocol check above must still pass. Never replace
        // the wire or widen its price limit to accommodate a moving estimate.
        if(!a.networkFee.equals(b.networkFee)||!a.rentLocked.equals(b.rentLocked)||!a.rentRefunded.equals(b.rentRefunded)||a.nativeSol!=b.nativeSol)throw new IOException("Close fees or delivery changed; request a fresh review");
        requireCurrentReview(review);return fresh.snapshot.slot;
    }
    private void requireFresh(long expiry)throws Exception{if(invalidated||clock.wall()>=expiry)throw new IOException("Native close review expired");}
    void invalidate(){invalidated=true;}
    static JSONObject body(NativePerpsCloseIntent intent)throws Exception{return new JSONObject().put("positionPubkey",intent.positionAddress).put("receiveToken",intent.receiveToken)
        .put("entirePosition",true).put("maxSlippageBps",Integer.toString(Math.max(1,intent.maxSlippageBps-1)));}
    private static final class Live {
        final NativeSwapClock clock=new NativeSwapClock(SystemClock::elapsedRealtime);
        JSONObject prepare(NativePerpsCloseIntent intent)throws Exception{
            HttpsURLConnection connection=(HttpsURLConnection)new URL("https://perps-api.jup.ag/v1/positions/decrease").openConnection();
            connection.setInstanceFollowRedirects(false);connection.setUseCaches(false);connection.setConnectTimeout(10000);connection.setReadTimeout(10000);connection.setRequestMethod("POST");connection.setDoOutput(true);
            connection.setRequestProperty("Content-Type","application/json");connection.setRequestProperty("Accept","application/json");connection.setRequestProperty("Cache-Control","no-store");connection.setRequestProperty("x-perps-api-version","v2");
            long start=clock.elapsed();try{
                byte[] request=body(intent).toString().getBytes(StandardCharsets.UTF_8);connection.setFixedLengthStreamingMode(request.length);
                try(OutputStream output=connection.getOutputStream()){output.write(request);}
                if(connection.getResponseCode()!=200)throw new IOException("Close preparation unavailable; nothing was signed or sent");clock.anchor(connection.getHeaderFieldDate("Date",-1),start,connection.getHeaderField("Age"));
                try(InputStream input=connection.getInputStream()){byte[] data=DevnetWalletService.readBounded(input,100000);
                    return new JSONObject(StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(data)).toString());}
            }finally{connection.disconnect();}
        }
    }
}
