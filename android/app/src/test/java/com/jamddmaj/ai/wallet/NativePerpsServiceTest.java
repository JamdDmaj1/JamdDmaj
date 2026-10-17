package com.jamddmaj.ai.wallet;

import android.util.Base64;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk=30)
public class NativePerpsServiceTest {
    static final class Clock implements NativeSwapService.Clock {
        long elapsed=100,wall=1792278805000L;
        public long elapsed(){return elapsed;}
        public long wall(){return wall;}
    }
    private static NativePerpsOrderIntent intent(){return new NativePerpsOrderIntent("SOL",1,"10.123456","2.5",50,"103","95","110");}
    private static JSONObject response()throws Exception{
        return new JSONObject().put("serializedTxBase64",Base64.encodeToString(NativePerpsTransactionTest.fixture(),Base64.NO_WRAP))
            .put("positionPubkey",DevnetSolana.encode(NativePerpsAddresses.position(NativePerpsTransactionTest.payer(),"SOL",1)))
            .put("txMetadata",new JSONObject().put("lastValidBlockHeight","300000000"));
    }
    @Test public void buildsExactNativeIntentWithoutFloatConversionsOrSecretFields()throws Exception{
        JSONObject body=NativePerpsService.body(NativePerpsTransactionTest.payer(),intent());
        assertEquals("10123456",body.getString("inputTokenAmount"));assertEquals("USDC",body.getString("inputToken"));
        assertEquals("2.5",body.getString("leverage"));assertEquals("50",body.getString("maxSlippageBps"));
        assertEquals("95000000",body.getJSONArray("tpsl").getJSONObject(0).getString("triggerPrice"));
        assertEquals("tp",body.getJSONArray("tpsl").getJSONObject(1).getString("requestType"));
        assertEquals(8,body.length());
    }
    @Test public void passesExactDecodedBytesAndIntentToChainVerifierButDoesNotProduceSigningApproval()throws Exception{
        Clock clock=new Clock();int[] calls={0};NativePerpsOrderIntent expected=intent();
        NativePerpsService service=new NativePerpsService((payer,intent)->{assertEquals(NativePerpsTransactionTest.payer(),payer);assertSame(expected,intent);return response();},
            (transaction,intent,now)->{calls[0]++;assertSame(expected,intent);assertEquals(clock.wall/1000,now);assertArrayEquals(NativePerpsTransactionTest.fixture(),transaction.bytes());},clock);
        NativePerpsService.Analysis analysis=service.analyze(NativePerpsTransactionTest.payer(),expected);
        assertEquals(1,calls[0]);assertEquals("300000000",analysis.lastValidBlockHeight.toString());assertSame(expected,analysis.intent);
        assertThrows(java.io.IOException.class,()->service.analyze(NativePerpsTransactionTest.payer(),expected));
    }
    @Test public void rejectsSubstitutionCorruptionAndNonIntegerLifetimeMetadataBeforeChainVerifier()throws Exception{
        for(String fault:new String[]{"position","encoding","height"}){
            NativePerpsService service=new NativePerpsService((payer,intent)->{
                JSONObject body=response();
                if(fault.equals("position"))body.put("positionPubkey","11111111111111111111111111111111");
                if(fault.equals("encoding"))body.put("serializedTxBase64",body.getString("serializedTxBase64")+"\n");
                if(fault.equals("height"))body.getJSONObject("txMetadata").put("lastValidBlockHeight",1.5);
                return body;
            },(transaction,intent,now)->fail("must reject before chain verifier"),new Clock());
            assertThrows(Exception.class,()->service.analyze(NativePerpsTransactionTest.payer(),intent()));
        }
    }
    @Test public void propagatesChainRejectionAndRejectsSlowAnalysis()throws Exception{
        NativePerpsService rejected=new NativePerpsService((payer,intent)->response(),(transaction,intent,now)->{throw new java.io.IOException("Rejected fixture chain state");},new Clock());
        assertThrows(java.io.IOException.class,()->rejected.analyze(NativePerpsTransactionTest.payer(),intent()));
        Clock clock=new Clock();
        NativePerpsService slow=new NativePerpsService((payer,intent)->response(),(transaction,intent,now)->clock.elapsed+=15001,clock);
        assertThrows(java.io.IOException.class,()->slow.analyze(NativePerpsTransactionTest.payer(),intent()));
    }
}
