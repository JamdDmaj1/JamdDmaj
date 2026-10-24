package com.jamddmaj.ai.wallet;

import android.util.Base64;
import java.math.BigInteger;
import java.util.LinkedHashMap;
import java.util.Map;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;

/** End-to-end native close review with synthetic unsigned provider fixtures.
 * No wallet secrets, production RPC, network signature or send exists here. */
@RunWith(RobolectricTestRunner.class)
@Config(sdk=30)
public class NativePerpsCloseServiceTest {
    static final class Clock implements NativeSwapService.Clock {
        long now=1792279214000L;public long wall(){return now;}public long elapsed(){return 1000;}
    }
    static final class Rpc implements NativeWalletRpc.Transport {
        final NativePerpsTransaction transaction;
        final Map<String,NativePerpsSimulation.Account> before=new LinkedHashMap<>(),after=new LinkedHashMap<>();
        int simulations,preparations;boolean failSimulation;long slot=100;
        final Clock clock=new Clock();
        Rpc()throws Exception{
            this(null,true);
        }
        Rpc(NativePerpsTransaction candidate,boolean initialize)throws Exception{
            transaction=candidate==null?NativePerpsCloseBindingsTest.transaction(false,-1,false,true):candidate;
            if(!initialize)return;
            NativePerpsCloseFundingTest.Fixture funding=new NativePerpsCloseFundingTest.Fixture(false,-1);
            NativePerpsCloseProtocolEffectsTest.Fixture protocol=new NativePerpsCloseProtocolEffectsTest.Fixture();
            before.putAll(protocol.before);before.putAll(funding.before);before.putAll(NativePerpsCloseOracleEffectsTest.snapshot());
            after.putAll(protocol.after);after.putAll(funding.after);after.putAll(NativePerpsCloseOracleEffectsTest.snapshot());
        }
        public Object request(String method,JSONArray params)throws Exception{
            switch(method){
                case "getGenesisHash":return "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
                case "getSlot":return slot;
                case "getBlockHeight":return 50;
                case "getMinimumBalanceForRentExemption":return 2039280;
                case "getMultipleAccounts":return context(snapshot(params.getJSONArray(0),before));
                case "getFeeForMessage":assertArrayEquals(transaction.message.bytes(),Base64.decode(params.getString(0),Base64.NO_WRAP));return context(15000);
                case "simulateTransaction":
                    simulations++;assertArrayEquals(transaction.bytes(),Base64.decode(params.getString(0),Base64.NO_WRAP));
                    JSONObject options=params.getJSONObject(1);assertFalse(options.getBoolean("sigVerify"));assertFalse(options.getBoolean("replaceRecentBlockhash"));
                    return context(new JSONObject().put("err",failSimulation?"fixture failure":JSONObject.NULL).put("unitsConsumed",300000)
                        .put("accounts",snapshot(options.getJSONObject("accounts").getJSONArray("addresses"),after)));
                default:throw new AssertionError("Forbidden RPC or execution method: "+method);
            }
        }
        private JSONObject context(Object value)throws Exception{return new JSONObject().put("context",new JSONObject().put("slot",slot)).put("value",value);}
        private JSONArray snapshot(JSONArray addresses,Map<String,NativePerpsSimulation.Account> accounts)throws Exception{
            JSONArray result=new JSONArray();for(int i=0;i<addresses.length();i++){
                NativePerpsSimulation.Account account=accounts.get(addresses.getString(i));
                result.put(account==null?JSONObject.NULL:new JSONObject().put("owner",account.owner).put("executable",account.executable).put("lamports",account.lamports)
                    .put("data",new JSONArray().put(Base64.encodeToString(account.data(),Base64.NO_WRAP)).put("base64")));
            }return result;
        }
        NativePerpsCloseService service(){
            NativePerpsSimulation simulator=new NativePerpsSimulation(this,new NativeSolanaAccounts(this),
                (owner,mint,program)->DevnetSolana.encode(NativePerpsTokenBoundary.associated(DevnetSolana.decode(owner,32),mint)));
            return new NativePerpsCloseService(intent->{preparations++;JSONObject body=NativePerpsCloseService.body(intent);
                assertEquals(true,body.getBoolean("entirePosition"));assertEquals(intent.receiveToken,body.getString("receiveToken"));assertEquals("49",body.getString("maxSlippageBps"));
                return new JSONObject().put("positionPubkey",intent.positionAddress).put("serializedTxBase64",Base64.encodeToString(transaction.bytes(),Base64.NO_WRAP))
                    .put("txMetadata",new JSONObject().put("lastValidBlockHeight","60"));
            },new NativePerpsCloseChain(this),simulator,clock);
        }
    }
    @Test public void reviewsAllNativeGatesAndRevalidatesExactUnfundedFixture()throws Exception{
        Rpc rpc=new Rpc();NativePerpsCloseService service=rpc.service();NativePerpsCloseService.Review review=service.review(NativePerpsTransactionTest.payer(),"SOL",1,"103",50);
        assertEquals(BigInteger.valueOf(1000000),review.amounts.receivedUnits);assertFalse(review.amounts.nativeSol);assertEquals(1,rpc.simulations);
        assertTrue(review.description(false).contains("not a guaranteed minimum"));assertTrue(review.description(false).contains("separate review"));
        service.revalidate(review);assertEquals(2,rpc.simulations);assertEquals(1,rpc.preparations);
        assertThrows(Exception.class,()->service.review(NativePerpsTransactionTest.payer(),"SOL",1,"103",50));
    }
    @Test public void refusesFailedSimulationChangedFundingAndExpiredOrInvalidatedReview()throws Exception{
        Rpc failed=new Rpc();failed.failSimulation=true;assertThrows(Exception.class,()->failed.service().review(NativePerpsTransactionTest.payer(),"SOL",1,"103",50));
        Rpc changed=new Rpc();NativePerpsCloseService service=changed.service();NativePerpsCloseService.Review review=service.review(NativePerpsTransactionTest.payer(),"SOL",1,"103",50);
        changed.after.put(review.intent.payer,changed.before.get(review.intent.payer));assertThrows(Exception.class,()->service.revalidate(review));
        Rpc expired=new Rpc();NativePerpsCloseService expiry=expired.service();NativePerpsCloseService.Review old=expiry.review(NativePerpsTransactionTest.payer(),"SOL",1,"103",50);
        expired.clock.now+=NativePerpsCloseService.REVIEW_LIFETIME_MS;assertThrows(Exception.class,()->expiry.requireCurrentReview(old));
        service.invalidate();assertThrows(Exception.class,()->service.requireCurrentReview(review));
    }
    @Test public void missingOrForeignPositionFailsBeforeBuilder()throws Exception{
        Rpc rpc=new Rpc();rpc.before.remove(NativePerpsCloseBindingsTest.intent().positionAddress);
        assertThrows(Exception.class,()->rpc.service().review(NativePerpsTransactionTest.payer(),"SOL",1,"103",50));assertEquals(0,rpc.preparations);
    }
    @Test public void aMovingReturnEstimateDoesNotReplaceOrRelaxTheApprovedPriceBound()throws Exception{
        Rpc rpc=new Rpc();NativePerpsCloseService service=rpc.service();NativePerpsCloseService.Review review=service.review(NativePerpsTransactionTest.payer(),"SOL",1,"103",50);
        String recipient=DevnetSolana.encode(NativePerpsTokenBoundary.associated(DevnetSolana.decode(review.intent.payer,32),NativePerpsFunding.SOL));
        String vault=NativePerpsCloseBindingsTest.custody().tokenAccount,custody=NativePerpsCustody.address("SOL");long received=999999;
        for(String address:new String[]{recipient,vault,custody}){
            NativePerpsSimulation.Account original=rpc.after.get(address);byte[] data=original.data();java.nio.ByteBuffer b=java.nio.ByteBuffer.wrap(data).order(java.nio.ByteOrder.LITTLE_ENDIAN);
            if(address.equals(custody))b.putLong(222,10000000-received);else b.putLong(64,address.equals(recipient)?received:10000000-received);
            long lamports=address.equals(custody)?original.lamports.longValueExact():2039280+(address.equals(recipient)?received:10000000-received);
            rpc.after.put(address,NativePerpsCloseOracleContextTest.account(original.owner,data,lamports));
        }
        service.revalidate(review);assertEquals(BigInteger.valueOf(1000000),review.amounts.receivedUnits);assertEquals(1,rpc.preparations);
    }
}
