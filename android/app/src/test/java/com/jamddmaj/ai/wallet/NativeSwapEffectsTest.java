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
public class NativeSwapEffectsTest {
    static JSONArray post(long payer,long source,long destination) throws Exception {
        JSONArray keys=new JSONArray().put(NativeJupiterRouteTest.key(1)).put(NativeJupiterRouteTest.key(10)).put(NativeJupiterRouteTest.key(13));
        JSONObject response=(JSONObject)new NativeSwapChainStateTest.Rpc().request("getMultipleAccounts",
            new JSONArray().put(keys).put(new JSONObject().put("dataSlice",new JSONObject().put("length",166))));
        JSONArray accounts=response.getJSONArray("value");
        accounts.getJSONObject(0).put("lamports",payer);
        amount(accounts.getJSONObject(1),source);
        amount(accounts.getJSONObject(2),destination);
        return accounts;
    }
    static void amount(JSONObject account,long value) throws Exception {
        byte[] data=Base64.decode(account.getJSONArray("data").getString(0),Base64.NO_WRAP);
        ByteBuffer.wrap(data).order(ByteOrder.LITTLE_ENDIAN).putLong(64,value);
        account.put("data",new JSONArray().put(Base64.encodeToString(data,Base64.NO_WRAP)).put("base64"));
    }
    static NativeSwapEffects inspect(JSONArray after) throws Exception {
        return NativeSwapEffects.inspect(NativeSwapPreparation.parse(NativeJupiterRouteTest.fixture(),NativeSwapPreparationTest.intent(),1001),
            NativeSwapChainStateTest.inspect(new NativeSwapChainStateTest.Rpc(),false),after,BigInteger.valueOf(5000),BigInteger.valueOf(2039280));
    }
    @Test public void acceptsExactInputFeeAndMinimumOutput() throws Exception {
        NativeSwapEffects result=inspect(post(999995000L,0,1178704));
        assertEquals(new BigInteger("1178704"),result.output);
        assertEquals(BigInteger.valueOf(-5000),result.solChange);
        assertEquals(BigInteger.ZERO,result.rentLocked);
    }
    @Test public void rejectsAdditionalSolDebitAndInsufficientOutput() {
        assertThrows(java.io.IOException.class,()->inspect(post(999994999L,0,1184627)));
        assertThrows(java.io.IOException.class,()->inspect(post(999995000L,0,1178703)));
        assertThrows(java.io.IOException.class,()->inspect(post(999995000L,1,1184627)));
    }
    @Test public void rejectsChangedAccountOwnerAndRent() throws Exception {
        JSONArray owner=post(999995000L,0,1184627);
        owner.getJSONObject(2).put("owner",NativeSwapSetup.SYSTEM);
        assertThrows(java.io.IOException.class,()->inspect(owner));
        JSONArray rent=post(999995000L,0,1184627);
        rent.getJSONObject(2).put("lamports",999999999);
        assertThrows(java.io.IOException.class,()->inspect(rent));
    }
    static NativeSwapEffects nativeEffect(boolean input,JSONArray after) throws Exception {
        String sol=NativeSwapSetup.SOL;
        JSONObject envelope=input?NativeSwapSetupTest.fixture():NativeJupiterRouteTest.fixture();
        if(!input) {
            JSONObject body=envelope.getJSONObject("preparation");
            body.put("outputMint",sol);
            JSONObject route=body.getJSONArray("instructions").getJSONObject(0);
            route.getJSONArray("accounts").getJSONObject(7).put("pubkey",sol);
            body.put("instructions",new JSONArray()
                .put(NativeSwapSetupTest.instruction(NativeSwapSetup.ASSOCIATED,new byte[]{1},NativeJupiterRouteTest.key(1),NativeJupiterRouteTest.key(13),NativeJupiterRouteTest.key(1),sol,NativeSwapSetup.SYSTEM,NativeJupiterRoute.TOKEN))
                .put(route).put(NativeSwapSetupTest.instruction(NativeJupiterRoute.TOKEN,new byte[]{9},NativeJupiterRouteTest.key(13),NativeJupiterRouteTest.key(1),NativeJupiterRouteTest.key(1))));
        }
        NativeSwapPreparation.Intent intent=new NativeSwapPreparation.Intent(NativeJupiterRouteTest.key(1),input?sol:NativeJupiterRouteTest.key(2),input?NativeJupiterRouteTest.key(3):sol,"10000000",50);
        NativeSwapPreparation preparation=NativeSwapPreparation.parse(envelope,intent,1001);
        SolanaMessage message=preparation.compile(NativeSwapServiceTest.accounts(new NativeSwapServiceTest.Clock(),false),1002);
        SolanaLookupTables.Resolved keys=SolanaLookupTables.resolve(message,List.of(),BigInteger.ONE);
        NativeJupiterRoute route=NativeJupiterRoute.inspect(message,keys,preparation);
        NativeSwapSetup setup=NativeSwapSetup.inspect(message,keys,route,preparation,(owner,mint,program)->NativeJupiterRouteTest.key(mint.equals(intent.inputMint)?10:13));
        NativeSwapChainStateTest.Rpc rpc=new NativeSwapChainStateTest.Rpc() {
            @Override public Object request(String method,JSONArray params) throws Exception {
                Object response=super.request(method,params);
                if(!method.equals("getMultipleAccounts")) return response;
                JSONArray addresses=params.getJSONArray(0), values=((JSONObject)response).getJSONArray("value");
                for(int i=0;i<addresses.length();i++) {
                    String address=addresses.getString(i);
                    if(address.equals(NativeJupiterRouteTest.key(13)) || (input && address.equals(NativeJupiterRouteTest.key(10)))) values.put(i,JSONObject.NULL);
                    if(address.equals(sol)) {
                        byte[] mint=new byte[82]; mint[44]=9; mint[45]=1;
                        values.getJSONObject(i).put("owner",NativeJupiterRoute.TOKEN).put("data",new JSONArray().put(Base64.encodeToString(mint,Base64.NO_WRAP)).put("base64"));
                    }
                }
                return response;
            }
        };
        return NativeSwapEffects.inspect(preparation,new NativeSwapChainState(rpc).inspect(message,keys,preparation,route,setup),after,BigInteger.valueOf(5000),BigInteger.valueOf(2039280));
    }
    @Test public void solInputAccountsForNewTokenRentAndClosedWrapAccount() throws Exception {
        JSONArray after=post(987955720L,0,1184627);
        after.put(1,JSONObject.NULL);
        after.getJSONObject(2).put("lamports",2039280);
        assertEquals(BigInteger.valueOf(2039280),nativeEffect(true,after).rentLocked);
        after.getJSONObject(0).put("lamports",987955719L);
        assertThrows(java.io.IOException.class,()->nativeEffect(true,after));
    }
    @Test public void solOutputIsNetOfFeeAndRequiresClosedDestination() throws Exception {
        JSONArray after=post(1001179627L,0,0);
        after.put(2,JSONObject.NULL);
        assertEquals(BigInteger.valueOf(1184627),nativeEffect(false,after).output);
        after.getJSONObject(0).put("lamports",1001173703L);
        assertThrows(java.io.IOException.class,()->nativeEffect(false,after));
    }
}
