package com.jamddmaj.ai.wallet;

import android.util.Base64;
import java.io.ByteArrayOutputStream;
import java.util.Arrays;
import org.json.*;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk=30)
public class NativeSolanaAccountsTest {
    static SolanaMessage message() {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        out.writeBytes(new byte[]{(byte)128,1,0,1,2});
        for (int value : new int[]{1,2,3}) { byte[] bytes = new byte[32]; bytes[0] = (byte)value; out.writeBytes(bytes); }
        out.writeBytes(new byte[]{1,1,1,2,1,9,1});
        byte[] table = new byte[32]; table[0] = 4; out.writeBytes(table); out.writeBytes(new byte[]{1,0,1,1});
        return SolanaMessage.parse(out.toByteArray());
    }
    static final class Rpc implements NativeWalletRpc.Transport {
        int identities, reads;
        long slot = 100;
        String owner = SolanaLookupTables.PROGRAM;
        boolean badIdentity, missing, invalidEncoding;
        public Object request(String method, JSONArray params) throws Exception {
            switch (method) {
                case "getGenesisHash": identities++; return badIdentity ? "wrong" : "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
                case "getSlot": assertEquals("confirmed",params.getJSONObject(0).getString("commitment")); return 100;
                case "getMultipleAccounts":
                    reads++;
                    assertEquals(1,params.getJSONArray(0).length());
                    assertEquals(DevnetSolana.encode(message().lookups.get(0).key()),params.getJSONArray(0).getString(0));
                    assertEquals("100",params.getJSONObject(1).get("minContextSlot").toString());
                    assertEquals("base64",params.getJSONObject(1).getString("encoding"));
                    byte[] data = new byte[120]; data[0]=1; Arrays.fill(data,4,12,(byte)255); data[12]=99; data[56]=10; data[88]=11;
                    JSONObject account = new JSONObject().put("owner",owner).put("executable",false)
                        .put("data",new JSONArray().put(Base64.encodeToString(data,Base64.NO_WRAP)).put(invalidEncoding?"base58":"base64"));
                    return new JSONObject().put("context",new JSONObject().put("slot",slot))
                        .put("value",new JSONArray().put(missing?JSONObject.NULL:account));
                default: throw new AssertionError("Unexpected RPC method: "+method);
            }
        }
    }
    @Test public void resolvesConfirmedSnapshotWithoutSigningOrBroadcast() throws Exception {
        Rpc rpc = new Rpc();
        SolanaLookupTables.Resolved resolved = new NativeSolanaAccounts(rpc).resolve(message());
        assertEquals(4,resolved.size()); assertEquals(10,resolved.key(2)[0]); assertEquals(11,resolved.key(3)[0]);
        assertEquals(2,rpc.identities); assertEquals(1,rpc.reads);
    }
    @Test public void rejectsWrongNetworkBeforeAccountRead() throws Exception {
        Rpc rpc = new Rpc(); rpc.badIdentity = true;
        assertThrows(IllegalArgumentException.class,() -> new NativeSolanaAccounts(rpc).resolve(message()));
        assertEquals(0,rpc.reads);
    }
    @Test public void rejectsStaleOrForeignAccount() throws Exception {
        Rpc stale = new Rpc(); stale.slot = 99;
        assertThrows(IllegalArgumentException.class,() -> new NativeSolanaAccounts(stale).resolve(message()));
        Rpc foreign = new Rpc(); foreign.owner = "11111111111111111111111111111111";
        assertThrows(IllegalArgumentException.class,() -> new NativeSolanaAccounts(foreign).resolve(message()));
    }
    @Test public void rejectsMissingOrWrongEncoding() throws Exception {
        Rpc missing = new Rpc(); missing.missing = true;
        assertThrows(JSONException.class,() -> new NativeSolanaAccounts(missing).resolve(message()));
        Rpc bad = new Rpc(); bad.invalidEncoding = true;
        assertThrows(java.io.IOException.class,() -> new NativeSolanaAccounts(bad).resolve(message()));
    }
}
