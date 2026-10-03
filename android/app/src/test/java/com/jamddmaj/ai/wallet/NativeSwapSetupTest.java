package com.jamddmaj.ai.wallet;

import android.util.Base64;
import java.math.BigInteger;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.List;
import org.json.*;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk=30)
public class NativeSwapSetupTest {
    static String key(int n) { return NativeJupiterRouteTest.key(n); }
    static JSONObject instruction(String program,byte[] data,String... keys) throws Exception {
        JSONArray accounts=new JSONArray();
        for(String key:keys) accounts.put(new JSONObject().put("pubkey",key).put("isSigner",key.equals(key(1)))
            .put("isWritable",key.equals(key(1)) || key.equals(key(10)) || key.equals(key(13))));
        return new JSONObject().put("programId",program).put("accounts",accounts).put("data",Base64.encodeToString(data,Base64.NO_WRAP));
    }
    static JSONObject fixture() throws Exception {
        JSONObject envelope=NativeJupiterRouteTest.fixture(), body=envelope.getJSONObject("preparation");
        body.put("inputMint",NativeSwapSetup.SOL);
        JSONObject route=body.getJSONArray("instructions").getJSONObject(0);
        route.getJSONArray("accounts").getJSONObject(6).put("pubkey",NativeSwapSetup.SOL);
        body.put("instructions",new JSONArray()
            .put(instruction(NativeSwapSetup.ASSOCIATED,new byte[]{1},key(1),key(10),key(1),NativeSwapSetup.SOL,NativeSwapSetup.SYSTEM,NativeJupiterRoute.TOKEN))
            .put(instruction(NativeSwapSetup.SYSTEM,ByteBuffer.allocate(12).order(ByteOrder.LITTLE_ENDIAN).putInt(2).putLong(10000000).array(),key(1),key(10)))
            .put(instruction(NativeJupiterRoute.TOKEN,new byte[]{17},key(10)))
            .put(instruction(NativeSwapSetup.ASSOCIATED,new byte[]{1},key(1),key(13),key(1),key(3),NativeSwapSetup.SYSTEM,NativeJupiterRoute.TOKEN))
            .put(route).put(instruction(NativeJupiterRoute.TOKEN,new byte[]{9},key(10),key(1),key(1))));
        return envelope;
    }
    static NativeSwapSetup inspect(JSONObject envelope) throws Exception {
        NativeSwapPreparation.Intent intent=new NativeSwapPreparation.Intent(key(1),NativeSwapSetup.SOL,key(3),"10000000",50);
        NativeSwapPreparation preparation=NativeSwapPreparation.parse(envelope,intent,1001);
        SolanaMessage message=preparation.compile(NativeSwapServiceTest.accounts(new NativeSwapServiceTest.Clock(),false),1002);
        SolanaLookupTables.Resolved accounts=SolanaLookupTables.resolve(message,List.of(),BigInteger.ONE);
        NativeJupiterRoute route=NativeJupiterRoute.inspect(message,accounts,preparation);
        return NativeSwapSetup.inspect(message,accounts,route,preparation,(owner,mint,program)->key(mint.equals(NativeSwapSetup.SOL)?10:13));
    }
    @Test public void acceptsAssociatedAccountFundingAndOwnerRefund() throws Exception {
        NativeSwapSetup setup=inspect(fixture());
        assertTrue(setup.createsSource); assertTrue(setup.createsDestination);
        assertEquals(new BigInteger("10000000"),setup.wrappedSol);
    }
    @Test public void rejectsRedirectedFundingAndRefund() throws Exception {
        for(int position:new int[]{1,5}) {
            JSONObject envelope=fixture(); envelope.getJSONObject("preparation").getJSONArray("instructions")
                .getJSONObject(position).getJSONArray("accounts").getJSONObject(1).put("pubkey",key(30));
            assertThrows(IllegalArgumentException.class,()->inspect(envelope));
        }
    }
    @Test public void rejectsExtraSolAndTokenAuthorityChanges() throws Exception {
        JSONObject extra=fixture(); extra.getJSONObject("preparation").getJSONArray("instructions").getJSONObject(1)
            .put("data",Base64.encodeToString(ByteBuffer.allocate(12).order(ByteOrder.LITTLE_ENDIAN).putInt(2).putLong(10000001).array(),Base64.NO_WRAP));
        assertThrows(IllegalArgumentException.class,()->inspect(extra));
        JSONObject authority=fixture(); authority.getJSONObject("preparation").getJSONArray("instructions")
            .put(instruction(NativeJupiterRoute.TOKEN,new byte[]{6},key(10),key(1)));
        assertThrows(IllegalArgumentException.class,()->inspect(authority));
    }
    @Test public void rejectsDifferentAccountOwnerAndExcessivePriorityFee() throws Exception {
        JSONObject owner=fixture(); owner.getJSONObject("preparation").getJSONArray("instructions").getJSONObject(0)
            .getJSONArray("accounts").getJSONObject(2).put("pubkey",key(30));
        assertThrows(IllegalArgumentException.class,()->inspect(owner));
        JSONObject high=fixture(); JSONArray original=high.getJSONObject("preparation").getJSONArray("instructions");
        JSONArray withPrice=new JSONArray().put(instruction(NativeSwapSetup.COMPUTE,
            ByteBuffer.allocate(9).order(ByteOrder.LITTLE_ENDIAN).put((byte)3).putLong(1000000000).array()));
        for(int i=0;i<original.length();i++) withPrice.put(original.getJSONObject(i));
        high.getJSONObject("preparation").put("instructions",withPrice);
        assertThrows(IllegalArgumentException.class,()->inspect(high));
    }
}
