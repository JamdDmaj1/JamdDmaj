package com.jamddmaj.ai.wallet;

import org.json.*;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk=30)
public class NativeSwapPreparationTest {
    static String key(int n) { byte[] b=new byte[32]; b[0]=(byte)n; return DevnetSolana.encode(b); }
    static NativeSwapPreparation.Intent intent() { return new NativeSwapPreparation.Intent(key(1),key(2),key(3),"10000000",50); }
    static JSONObject fixture() throws Exception {
        return new JSONObject().put("ok",true).put("preparation",new JSONObject()
            .put("network","solana-mainnet-beta").put("executable",false).put("requiresNativeValidation",true)
            .put("taker",key(1)).put("inputMint",key(2)).put("outputMint",key(3)).put("inAmount","10000000")
            .put("slippageBps",50).put("outAmount","1184627").put("minimumOut","1178704")
            .put("receivedAt",1000).put("expiresAt",16000).put("blockhash",key(9)).put("lastValidBlockHeight","123")
            .put("lookupTableAddresses",new JSONArray()).put("instructions",new JSONArray().put(new JSONObject()
                .put("programId",key(4)).put("data","Bw==").put("accounts",new JSONArray().put(new JSONObject()
                    .put("pubkey",key(1)).put("isSigner",true).put("isWritable",true))))));
    }
    @Test public void decodesExactIntentAndCompilesWithoutSendMethod() throws Exception {
        JSONObject envelope=fixture();
        NativeSwapPreparation parsed=NativeSwapPreparation.parse(envelope,intent(),1001);
        assertEquals("1178704",parsed.minimumOut.toString());
        // Changes to JSON after parsing cannot alter the instruction snapshot.
        envelope.getJSONObject("preparation").getJSONArray("instructions").getJSONObject(0).put("data","CA==");
        NativeWalletRpc.Transport rpc=(method,params)-> {
            if (method.equals("getGenesisHash")) return "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
            if (method.equals("getSlot")) return 100;
            throw new AssertionError("Unexpected RPC: "+method);
        };
        SolanaMessage message=parsed.compile(new NativeSolanaAccounts(rpc),1002);
        assertArrayEquals(new byte[]{7},message.instructions.get(1).data());
        assertEquals(1,message.signatures);
        assertThrows(IllegalArgumentException.class,()->parsed.compile(new NativeSolanaAccounts(rpc),16000));
    }
    @Test public void rejectsChangedIntentAndCoercedFlags() throws Exception {
        for (String field : new String[]{"taker","inputMint","outputMint","inAmount","slippageBps","network","executable","requiresNativeValidation"}) {
            JSONObject envelope=fixture(); envelope.getJSONObject("preparation").put(field,"wrong");
            assertThrows(field,IllegalArgumentException.class,()->NativeSwapPreparation.parse(envelope,intent(),1001));
        }
        JSONObject envelope=fixture();
        envelope.getJSONObject("preparation").getJSONArray("instructions").getJSONObject(0)
            .getJSONArray("accounts").getJSONObject(0).put("isSigner","true");
        assertThrows(IllegalArgumentException.class,()->NativeSwapPreparation.parse(envelope,intent(),1001));
    }
    @Test public void rejectsStaleFutureAndWeakenedMinimum() throws Exception {
        for (long now : new long[]{999,16000,Long.MAX_VALUE})
            assertThrows(IllegalArgumentException.class,()->NativeSwapPreparation.parse(fixture(),intent(),now));
        for (String amount : new String[]{"1178703","1184628","0","18446744073709551616","1.1"}) {
            JSONObject envelope=fixture(); envelope.getJSONObject("preparation").put("minimumOut",amount);
            assertThrows(IllegalArgumentException.class,()->NativeSwapPreparation.parse(envelope,intent(),1001));
        }
    }
    @Test public void rejectsExtraSignerDuplicateTablesAndNoncanonicalBase64() throws Exception {
        JSONObject signer=fixture(); signer.getJSONObject("preparation").getJSONArray("instructions").getJSONObject(0)
            .getJSONArray("accounts").getJSONObject(0).put("pubkey",key(8));
        assertThrows(IllegalArgumentException.class,()->NativeSwapPreparation.parse(signer,intent(),1001));
        JSONObject tables=fixture(); tables.getJSONObject("preparation").put("lookupTableAddresses",new JSONArray().put(key(8)).put(key(8)));
        assertThrows(IllegalArgumentException.class,()->NativeSwapPreparation.parse(tables,intent(),1001));
        JSONObject data=fixture(); data.getJSONObject("preparation").getJSONArray("instructions").getJSONObject(0).put("data","Bw");
        assertThrows(IllegalArgumentException.class,()->NativeSwapPreparation.parse(data,intent(),1001));
    }
}
