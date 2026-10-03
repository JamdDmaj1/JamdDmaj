package com.jamddmaj.ai.wallet;

import java.math.BigInteger;
import java.util.List;
import org.json.*;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk=30)
public class NativeJupiterRouteTest {
    static JSONObject fixture() throws Exception {
        JSONObject envelope=NativeSwapPreparationTest.fixture();
        String[] keys={key(20),key(1),key(10),key(11),key(12),key(13),key(2),key(3),
            NativeJupiterRoute.TOKEN,NativeJupiterRoute.TOKEN,key(22),JupiterV2Header.PROGRAM};
        JSONArray accounts=new JSONArray();
        for(int i=0;i<keys.length;i++) accounts.put(new JSONObject().put("pubkey",keys[i])
            .put("isSigner",i==1).put("isWritable",i>=1 && i<=5));
        envelope.getJSONObject("preparation").put("instructions",new JSONArray().put(new JSONObject()
            .put("programId",JupiterV2Header.PROGRAM).put("accounts",accounts)
            .put("data","0ZhTk3z+2OkGgJaYAAAAAABzExIAAAAAADIAAAAAAAMAAAARAe8kAAIRASECAAJoARAnAgM=")));
        return envelope;
    }
    static String key(int n) { return NativeSwapPreparationTest.key(n); }
    static NativeJupiterRoute inspect(JSONObject envelope) throws Exception {
        NativeSwapPreparation preparation=NativeSwapPreparation.parse(envelope,NativeSwapPreparationTest.intent(),1001);
        NativeSolanaAccounts accounts=new NativeSolanaAccounts((method,params)-> {
            if(method.equals("getGenesisHash")) return "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
            if(method.equals("getSlot")) return 100;
            throw new AssertionError("Unexpected RPC: "+method);
        });
        SolanaMessage message=preparation.compile(accounts,1002);
        return NativeJupiterRoute.inspect(message,SolanaLookupTables.resolve(message,List.of(),BigInteger.ONE),preparation);
    }
    @Test public void bindsSharedRouteMintAmountAndUserAuthority() throws Exception {
        NativeJupiterRoute route=inspect(fixture());
        assertEquals(key(10),route.source); assertEquals(key(13),route.destination);
        assertEquals(NativeJupiterRoute.TOKEN,route.destinationTokenProgram);
    }
    @Test public void rejectsMintSubstitutionAndUnsupportedTokenProgram() throws Exception {
        for(int position:new int[]{6,7,8,9,11}) {
            JSONObject envelope=fixture();
            envelope.getJSONObject("preparation").getJSONArray("instructions").getJSONObject(0)
                .getJSONArray("accounts").getJSONObject(position).put("pubkey",key(30));
            assertThrows(IllegalArgumentException.class,()->inspect(envelope));
        }
    }
    @Test public void rejectsDuplicatedSwapAndChangedOutputPromise() throws Exception {
        JSONObject duplicate=fixture(); JSONArray instructions=duplicate.getJSONObject("preparation").getJSONArray("instructions");
        instructions.put(instructions.getJSONObject(0));
        assertThrows(IllegalArgumentException.class,()->inspect(duplicate));
        JSONObject amount=fixture(); amount.getJSONObject("preparation").put("outAmount","1184628").put("minimumOut","1178705");
        assertThrows(IllegalArgumentException.class,()->inspect(amount));
    }
    @Test public void rejectsMissingRouteBeforeSimulation() throws Exception {
        assertThrows(IllegalArgumentException.class,()->inspect(NativeSwapPreparationTest.fixture()));
    }
}
