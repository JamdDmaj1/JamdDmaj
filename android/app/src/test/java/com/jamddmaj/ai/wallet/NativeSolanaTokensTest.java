package com.jamddmaj.ai.wallet;

import android.util.Base64;
import java.io.IOException;
import java.math.BigInteger;
import org.json.*;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk=30)
public class NativeSolanaTokensTest {
    static byte[] key(int value){byte[] bytes=new byte[32];bytes[0]=(byte)value;return bytes;}
    static final String OWNER=DevnetSolana.encode(key(1));
    static class Rpc implements NativeWalletRpc.Transport {
        String program=SplTokenAccount.PROGRAM;
        boolean empty,wrongMint,wrongOwner,duplicate,frozen,delegated,fail;
        long slot=100;
        int reads,identities;
        public Object request(String method,JSONArray params)throws Exception{
            if(method.equals("getGenesisHash")){identities++;return "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";}
            if(method.equals("getSlot"))return 100;
            if(!method.equals("getTokenAccountsByOwner"))throw new AssertionError("Unexpected call "+method);
            reads++;if(fail)throw new IOException("Unavailable");
            assertEquals(OWNER,params.getString(0));assertEquals(NativeSolanaTokens.USDC,params.getJSONObject(1).getString("mint"));
            assertEquals("100",params.getJSONObject(2).get("minContextSlot").toString());
            byte[] data=new byte[165];System.arraycopy(wrongMint?key(4):DevnetSolana.decode(NativeSolanaTokens.USDC,32),0,data,0,32);
            System.arraycopy(key(wrongOwner?5:1),0,data,32,32);
            // 9007199254740993 units: above JavaScript's exact integer range.
            data[64]=1;data[70]=32;data[108]=(byte)(frozen?2:1);data[72]=(byte)(delegated?1:0);
            JSONObject account=new JSONObject().put("pubkey",DevnetSolana.encode(key(2))).put("account",new JSONObject()
                .put("owner",program).put("executable",false).put("data",new JSONArray().put(Base64.encodeToString(data,Base64.NO_WRAP)).put("base64")));
            JSONArray values=new JSONArray();if(!empty)values.put(account);if(duplicate)values.put(account);
            return new JSONObject().put("context",new JSONObject().put("slot",slot)).put("value",values);
        }
    }
    @Test public void exactBalanceIncludesFrozenAndDelegatedWarnings()throws Exception{
        Rpc rpc=new Rpc();rpc.frozen=true;rpc.delegated=true;
        var balance=new NativeSolanaTokens(rpc).readUsdc(OWNER);
        assertEquals(new BigInteger("9007199254740993"),balance.total);
        assertEquals("9007199254.740993",balance.decimalAmount());assertEquals(balance.total,balance.frozen);assertTrue(balance.hasDelegatedAccounts);
        assertEquals(1,rpc.reads);assertEquals(2,rpc.identities);
    }
    @Test public void validEmptyResponseIsZeroButFailureIsNot()throws Exception{
        Rpc empty=new Rpc();empty.empty=true;assertEquals(BigInteger.ZERO,new NativeSolanaTokens(empty).readUsdc(OWNER).total);
        Rpc fail=new Rpc();fail.fail=true;assertThrows(IOException.class,()->new NativeSolanaTokens(fail).readUsdc(OWNER));
    }
    @Test public void rejectsWrongIdentityDuplicateAndStaleAccounts()throws Exception{
        Rpc mint=new Rpc();mint.wrongMint=true;assertThrows(IOException.class,()->new NativeSolanaTokens(mint).readUsdc(OWNER));
        Rpc owner=new Rpc();owner.wrongOwner=true;assertThrows(IOException.class,()->new NativeSolanaTokens(owner).readUsdc(OWNER));
        Rpc duplicate=new Rpc();duplicate.duplicate=true;assertThrows(IOException.class,()->new NativeSolanaTokens(duplicate).readUsdc(OWNER));
        Rpc stale=new Rpc();stale.slot=99;assertThrows(IOException.class,()->new NativeSolanaTokens(stale).readUsdc(OWNER));
        Rpc program=new Rpc();program.program="wrong";assertThrows(IllegalArgumentException.class,()->new NativeSolanaTokens(program).readUsdc(OWNER));
    }
}
