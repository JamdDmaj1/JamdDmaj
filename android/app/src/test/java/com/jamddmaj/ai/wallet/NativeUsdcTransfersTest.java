package com.jamddmaj.ai.wallet;

import android.content.*;
import android.util.Base64;
import java.io.*;
import java.math.BigInteger;
import java.nio.*;
import java.time.Duration;
import java.util.*;
import org.json.*;
import org.junit.*;
import org.junit.rules.TemporaryFolder;
import org.junit.runner.RunWith;
import org.robolectric.*;
import org.robolectric.annotation.Config;
import org.robolectric.shadows.ShadowSystemClock;
import static org.junit.Assert.*;

/** Disposable signatures and fake RPC only. Never contacts a blockchain. */
@RunWith(RobolectricTestRunner.class)
@Config(sdk=30)
public class NativeUsdcTransfersTest {
    @Rule public TemporaryFolder folder=new TemporaryFolder();
    Context context;NativeWalletProfiles.Profile owner;NativeUsdcTransfers service;Rpc rpc;
    byte[] seed=new byte[32];String recipient=key(52),source=key(53),destination=key(54);
    final SolanaNativeTransfers.Signer signer=new SolanaNativeTransfers.Signer(){
        public String address(byte[] value){return DevnetSolana.address(value);}
        public byte[] sign(byte[] value,byte[] message){return DevnetSolana.sign(value,message);}
    };
    static String key(int n){byte[] bytes=new byte[32];Arrays.fill(bytes,(byte)n);return DevnetSolana.encode(bytes);}
    @Before public void setup() throws Exception {
        context=new ContextWrapper(RuntimeEnvironment.getApplication()){@Override public File getNoBackupFilesDir(){return folder.getRoot();}};
        Arrays.fill(seed,(byte)51);
        owner=new NativeWalletProfiles.Profile("1".repeat(32),"2".repeat(32),"Fixture",DevnetSolana.address(seed),"0x"+"1".repeat(40),1000);
        rpc=new Rpc();service=new NativeUsdcTransfers(context,owner,rpc,(wallet,mint,program)->wallet.equals(owner.solanaAddress)?source:destination);
    }
    static JSONObject account(String program,byte[] data,long lamports) throws Exception {
        return new JSONObject().put("owner",program).put("executable",false).put("lamports",lamports)
            .put("data",new JSONArray().put(Base64.encodeToString(data,Base64.NO_WRAP)).put("base64"));
    }
    static JSONObject token(String wallet,long amount) throws Exception {
        byte[] data=new byte[165];System.arraycopy(DevnetSolana.decode(NativeSolanaTokens.USDC,32),0,data,0,32);
        System.arraycopy(DevnetSolana.decode(wallet,32),0,data,32,32);
        ByteBuffer.wrap(data).order(ByteOrder.LITTLE_ENDIAN).putLong(64,amount);data[108]=1;
        return account(SplTokenAccount.PROGRAM,data,2039280);
    }
    class Rpc implements NativeWalletRpc.Transport {
        boolean create,timeout,badEffects,frozen,wrongDestination,failed;
        long fee=5000,slot=100,height=101,sol=5000000000L,input=10000000L;
        int sends;
        String genesis="5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
        JSONObject result(Object value) throws Exception {return new JSONObject().put("context",new JSONObject().put("slot",slot)).put("value",value);}
        public Object request(String method,JSONArray params) throws Exception {
            switch(method){
                case "getGenesisHash":return genesis;
                case "getSlot":return 100;
                case "getBlockHeight":return height;
                case "getLatestBlockhash":return result(new JSONObject().put("blockhash",key(55)).put("lastValidBlockHeight",200));
                case "getMinimumBalanceForRentExemption":return 2039280;
                case "getFeeForMessage":return result(fee);
                case "getMultipleAccounts":{
                    byte[] mint=new byte[82];mint[44]=6;mint[45]=1;
                    JSONObject from=token(owner.solanaAddress,input);
                    if(frozen){byte[] data=Base64.decode(from.getJSONArray("data").getString(0),Base64.NO_WRAP);data[108]=2;from=account(SplTokenAccount.PROGRAM,data,2039280);}
                    return result(new JSONArray().put(account(NativeSwapSetup.SYSTEM,new byte[0],sol)).put(account(SplTokenAccount.PROGRAM,mint,1461600))
                        .put(from).put(create?JSONObject.NULL:token(wrongDestination?key(60):recipient,2000000)).put(JSONObject.NULL));
                }
                case "simulateTransaction":{
                    assertFalse(params.getJSONObject(1).getBoolean("replaceRecentBlockhash"));
                    return result(new JSONObject().put("err",failed?"failure":JSONObject.NULL).put("unitsConsumed",10000)
                        .put("accounts",new JSONArray().put(account(NativeSwapSetup.SYSTEM,new byte[0],sol-fee-(create?2039280:0)))
                            .put(token(owner.solanaAddress,input-1000001)).put(token(recipient,(create?0:2000000)+1000001+(badEffects?1:0)))));
                }
                case "sendTransaction":{
                    sends++;var record=new NativeTransferJournal(context,owner,WalletNetwork.SOLANA_MAINNET).latest();
                    assertEquals(NativeTransferJournal.Phase.UNKNOWN,record.phase);assertEquals(NativeSolanaTokens.USDC,record.tokenMint);
                    assertEquals(recipient,record.recipient);assertEquals(BigInteger.valueOf(1000001),record.units);
                    assertFalse(params.getJSONObject(1).getBoolean("skipPreflight"));assertEquals(0,params.getJSONObject(1).getInt("maxRetries"));
                    if(timeout)throw new IOException("Unknown outcome");
                    return DevnetSolana.encode(Arrays.copyOfRange(Base64.decode(params.getString(0),Base64.NO_WRAP),1,65));
                }
                case "getSignatureStatuses":return result(new JSONArray().put(new JSONObject().put("err",JSONObject.NULL).put("confirmationStatus","finalized")));
                default:throw new AssertionError(method);
            }
        }
    }
    NativeUsdcTransfers.Draft draft() throws Exception {return service.prepare(recipient,"1.000001");}
    byte[] sign(NativeUsdcTransfers.Draft d) throws Exception {return service.signReviewed(d,seed,signer,()->true);}
    @Test public void exactTransferIsManualAndJournalPreservesTokenAcrossConfirmation() throws Exception {
        var draft=draft();byte[] signature=sign(draft);assertEquals(0,rpc.sends);
        service.submit(draft,signature,()->true);assertEquals(1,rpc.sends);
        var record=new SolanaNativeTransfers(context,owner,rpc).checkLatest();
        assertEquals(NativeTransferJournal.Phase.CONFIRMED,record.phase);assertEquals(NativeSolanaTokens.USDC,record.tokenMint);
        assertThrows(IOException.class,()->service.submit(draft,signature,()->true));
    }
    @Test public void createsAssociatedAccountOnlyWithReviewedRent() throws Exception {
        rpc.create=true;var d=draft();assertEquals(BigInteger.valueOf(2039280),d.rent);
        service.submit(d,sign(d),()->true);assertEquals(1,rpc.sends);
    }
    @Test public void accountCreationRaceRequiresNewReview() throws Exception {
        rpc.create=true;var d=draft();byte[] sig=sign(d);rpc.create=false;
        assertThrows(IOException.class,()->service.submit(d,sig,()->true));assertEquals(0,rpc.sends);
    }
    @Test public void unknownBroadcastBlocksSolAndUsdcAndSwaps() throws Exception {
        var d=draft();rpc.timeout=true;
        assertThrows(IOException.class,()->service.submit(d,sign(d),()->true));
        assertThrows(IOException.class,()->draft());
        assertThrows(IOException.class,()->new SolanaNativeTransfers(context,owner,rpc).prepare(recipient,"1"));
        assertThrows(IOException.class,()->new NativeTransferJournal(context,owner,WalletNetwork.SOLANA_MAINNET).requireNoPending());
        assertEquals(1,rpc.sends);
    }
    @Test public void rejectsFundsPermissionsAndIncorrectSimulationEffects() throws Exception {
        rpc.sol=0;assertThrows(IOException.class,()->draft());rpc.sol=5000000000L;
        rpc.input=1;assertThrows(IOException.class,()->draft());rpc.input=10000000;
        rpc.frozen=true;assertThrows(IOException.class,()->draft());rpc.frozen=false;
        rpc.wrongDestination=true;assertThrows(IOException.class,()->draft());rpc.wrongDestination=false;
        rpc.badEffects=true;assertThrows(IOException.class,()->draft());assertEquals(0,rpc.sends);
    }
    @Test public void signedSimulationAndFeeChangesAreRejected() throws Exception {
        var d=draft();byte[] sig=sign(d);rpc.badEffects=true;
        assertThrows(IOException.class,()->service.submit(d,sig,()->true));rpc.badEffects=false;
        rpc.fee++;assertThrows(IOException.class,()->service.submit(d,sig,()->true));rpc.fee--;
        rpc.slot=99;assertThrows(IOException.class,()->service.submit(d,sig,()->true));rpc.slot=100;
        rpc.height=201;assertThrows(IOException.class,()->service.submit(d,sig,()->true));assertEquals(0,rpc.sends);
    }
    @Test public void lockedExpiredAndInvalidAmountsCannotSend() throws Exception {
        assertThrows(IllegalArgumentException.class,()->service.prepare(recipient,"0.0000001"));
        assertThrows(IllegalArgumentException.class,()->service.prepare(owner.solanaAddress,"1"));
        var d=draft();assertThrows(IOException.class,()->service.submit(d,new byte[64],()->true));
        assertThrows(IOException.class,()->service.signReviewed(d,seed,signer,()->false));
        ShadowSystemClock.advanceBy(Duration.ofSeconds(61));assertThrows(IOException.class,()->sign(d));assertEquals(0,rpc.sends);
    }
    @Test public void compilerUsesCheckedUsdcDecimalsAndNoAdditionalSigner() {
        var message=NativeUsdcTransfers.compile(owner.solanaAddress,recipient,source,destination,key(55),BigInteger.valueOf(1000001),true);
        assertEquals(1,message.signatures);assertEquals(2,message.instructions.size());
        assertArrayEquals(new byte[]{12,65,66,15,0,0,0,0,0,6},message.instructions.get(1).data());
    }
}
