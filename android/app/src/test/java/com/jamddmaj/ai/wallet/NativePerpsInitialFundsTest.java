package com.jamddmaj.ai.wallet;

import android.util.Base64;
import java.math.BigInteger;
import java.util.Arrays;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk=30)
public class NativePerpsInitialFundsTest {
    static final class Rpc implements NativeWalletRpc.Transport {
        final byte[] wallet=new byte[32],data=new byte[165];final String owner,source;
        String fault="";int reads,identities;
        Rpc(){wallet[0]=7;owner=DevnetSolana.encode(wallet);byte[] mint=DevnetSolana.decode(NativePerpsFunding.USDC,32);
            System.arraycopy(mint,0,data,0,32);System.arraycopy(wallet,0,data,32,32);long amount=20000000;
            for(int i=0;i<8;i++)data[64+i]=(byte)(amount>>>(i*8));data[108]=1;
            source=DevnetSolana.encode(SolanaProgramAddress.find("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",Arrays.asList(wallet,DevnetSolana.decode(SplTokenAccount.PROGRAM,32),mint)).key());}
        JSONObject account(String program,byte[] bytes,long lamports)throws Exception{
            return new JSONObject().put("owner",program).put("executable",false).put("lamports",lamports)
                .put("data",new JSONArray().put(Base64.encodeToString(bytes,Base64.NO_WRAP)).put("base64"));
        }
        public Object request(String method,JSONArray params)throws Exception{
            if(method.equals("getGenesisHash")){identities++;return fault.equals("network")?"wrong":"5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";}
            if(method.equals("getSlot"))return 100;
            assertEquals("getMultipleAccounts",method);reads++;assertEquals(owner,params.getJSONArray(0).getString(0));assertEquals(source,params.getJSONArray(0).getString(1));
            assertEquals(2,params.getJSONArray(0).length());assertEquals(100,params.getJSONObject(1).getInt("minContextSlot"));
            assertEquals("confirmed",params.getJSONObject(1).getString("commitment"));
            JSONObject token=account(SplTokenAccount.PROGRAM,data,2039280);
            if(fault.equals("encoding"))token.put("data",new JSONArray().put(token.getJSONArray("data").getString(0)+"\n").put("base64"));
            if(fault.equals("owner"))token.put("owner","11111111111111111111111111111111");
            if(fault.equals("executable"))token.put("executable","false");
            JSONArray values=new JSONArray().put(account("11111111111111111111111111111111",new byte[0],fault.equals("sol")?0:2000000))
                .put(fault.equals("usdc")?JSONObject.NULL:token);
            if(fault.equals("length"))values.put(JSONObject.NULL);
            return new JSONObject().put("context",new JSONObject().put("slot",fault.equals("slot")?99:100)).put("value",values);
        }
    }
    @Test public void queriesOnlyTheDerivedMainnetFundingBankWithoutBuilderOrSigner()throws Exception{
        Rpc rpc=new Rpc();new NativeSolanaAccounts(rpc).requirePerpsInitialFunds(rpc.owner,BigInteger.valueOf(10000000));
        assertEquals(1,rpc.reads);assertEquals(2,rpc.identities);
    }
    @Test public void missingUsdcAndSolProduceDifferentBoundedFailures()throws Exception{
        for(String fault:new String[]{"usdc","sol"}){Rpc rpc=new Rpc();rpc.fault=fault;
            NativePerpsFundsPreflight.Failure error=assertThrows(NativePerpsFundsPreflight.Failure.class,()->new NativeSolanaAccounts(rpc).requirePerpsInitialFunds(rpc.owner,BigInteger.valueOf(10000000)));
            assertEquals(fault.equals("usdc")?"PERPS_INSUFFICIENT_USDC":"PERPS_MISSING_SOL_FEES",error.reason);}
    }
    @Test public void wrongNetworkBankOrEncodingCannotBeTreatedAsZeroOrSufficient()throws Exception{
        for(String fault:new String[]{"network","slot","length","encoding","owner","executable"}){Rpc rpc=new Rpc();rpc.fault=fault;
            Exception error=assertThrows(Exception.class,()->new NativeSolanaAccounts(rpc).requirePerpsInitialFunds(rpc.owner,BigInteger.valueOf(10000000)));
            assertFalse(error instanceof NativePerpsFundsPreflight.Failure);}
    }
}
