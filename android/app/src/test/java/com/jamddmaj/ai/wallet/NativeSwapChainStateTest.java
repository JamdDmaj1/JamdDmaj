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
public class NativeSwapChainStateTest {
    static String key(int n) { return NativeJupiterRouteTest.key(n); }
    static class Rpc implements NativeWalletRpc.Transport {
        boolean frozen,delegated,foreign,missingSource;
        long amount=10000000,slot=100;
        public Object request(String method,JSONArray params) throws Exception {
            if(method.equals("getGenesisHash")) return "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
            if(method.equals("getSlot")) return 100;
            if(!method.equals("getMultipleAccounts")) throw new AssertionError("Unexpected RPC "+method);
            assertEquals(166,params.getJSONObject(1).getJSONObject("dataSlice").getInt("length"));
            JSONArray addresses=params.getJSONArray(0),values=new JSONArray();
            for(int i=0;i<addresses.length();i++) {
                String address=addresses.getString(i),program=NativeSwapSetup.SYSTEM; byte[] bytes=new byte[0];
                if(address.equals(key(10)) && missingSource) { values.put(JSONObject.NULL); continue; }
                if(address.equals(key(2)) || address.equals(key(3))) {
                    program=NativeJupiterRoute.TOKEN; bytes=new byte[82]; bytes[44]=6; bytes[45]=1;
                } else if(address.equals(key(10)) || address.equals(key(13)) || address.equals(key(14))) {
                    program=NativeJupiterRoute.TOKEN; bytes=new byte[165]; boolean source=address.equals(key(10));
                    System.arraycopy(DevnetSolana.decode(key(source?2:3),32),0,bytes,0,32);
                    System.arraycopy(DevnetSolana.decode(key(source && foreign?9:1),32),0,bytes,32,32);
                    ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN).putLong(64,source?amount:0);
                    bytes[108]=(byte)(source && frozen?2:1); if(source && delegated) bytes[72]=1;
                }
                values.put(new JSONObject().put("owner",program).put("executable",false).put("lamports",1000000000)
                    .put("data",new JSONArray().put(Base64.encodeToString(bytes,Base64.NO_WRAP)).put("base64")));
            }
            return new JSONObject().put("context",new JSONObject().put("slot",slot)).put("value",values);
        }
    }
    static NativeSwapChainState.Result inspect(Rpc rpc,boolean extra) throws Exception {
        JSONObject fixture=NativeJupiterRouteTest.fixture();
        if(extra) fixture.getJSONObject("preparation").getJSONArray("instructions").getJSONObject(0).getJSONArray("accounts")
            .put(new JSONObject().put("pubkey",key(14)).put("isSigner",false).put("isWritable",true));
        NativeSwapPreparation preparation=NativeSwapPreparation.parse(fixture,NativeSwapPreparationTest.intent(),1001);
        SolanaMessage message=preparation.compile(NativeSwapServiceTest.accounts(new NativeSwapServiceTest.Clock(),false),1002);
        SolanaLookupTables.Resolved keys=SolanaLookupTables.resolve(message,List.of(),BigInteger.ONE);
        NativeJupiterRoute route=NativeJupiterRoute.inspect(message,keys,preparation);
        NativeSwapSetup setup=NativeSwapSetup.inspect(message,keys,route,preparation,(owner,mint,program)->key(mint.equals(key(2))?10:13));
        return new NativeSwapChainState(rpc).inspect(message,keys,preparation,route,setup);
    }
    @Test public void confirmsExactBalancesAndMintDecimals() throws Exception {
        NativeSwapChainState.Result result=inspect(new Rpc(),false);
        assertEquals(new BigInteger("10000000"),result.sourceBalance); assertEquals(6,result.outputDecimals);
    }
    @Test public void rejectsForeignFrozenAndDelegatedSource() {
        Rpc foreign=new Rpc(); foreign.foreign=true;
        assertThrows(java.io.IOException.class,()->inspect(foreign,false));
        Rpc frozen=new Rpc(); frozen.frozen=true;
        assertThrows(java.io.IOException.class,()->inspect(frozen,false));
        Rpc delegated=new Rpc(); delegated.delegated=true;
        assertThrows(java.io.IOException.class,()->inspect(delegated,false));
    }
    @Test public void rejectsMissingBalanceAndUnrelatedOwnedWritableToken() {
        Rpc missing=new Rpc(); missing.missingSource=true;
        assertThrows(java.io.IOException.class,()->inspect(missing,false));
        Rpc insufficient=new Rpc(); insufficient.amount=1;
        assertThrows(java.io.IOException.class,()->inspect(insufficient,false));
        assertThrows(java.io.IOException.class,()->inspect(new Rpc(),true));
    }
    @Test public void rejectsOldRpcContext() {
        Rpc stale=new Rpc(); stale.slot=99;
        assertThrows(java.io.IOException.class,()->inspect(stale,false));
    }
}
