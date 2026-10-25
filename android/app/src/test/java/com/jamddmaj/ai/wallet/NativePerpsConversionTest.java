package com.jamddmaj.ai.wallet;

import android.content.*;
import android.util.Base64;
import java.io.*;
import java.math.BigInteger;
import java.nio.*;
import java.util.*;
import org.bouncycastle.math.ec.rfc8032.Ed25519;
import org.json.*;
import org.junit.*;
import org.junit.rules.TemporaryFolder;
import org.junit.runner.RunWith;
import org.robolectric.*;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;

/** Synthetic close signatures, local persistence and fake chain/build transports.
 * No live provider or funded wallet is used. Run durability tests on POSIX. */
@RunWith(RobolectricTestRunner.class) @Config(sdk=30)
public class NativePerpsConversionTest {
    @Rule public TemporaryFolder folder=new TemporaryFolder();
    Context context;NativeWalletProfiles.Profile owner;
    static final String GENESIS="5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
    @Before public void setup(){context=new ContextWrapper(RuntimeEnvironment.getApplication()){@Override public File getNoBackupFilesDir(){return folder.getRoot();}};
        owner=new NativeWalletProfiles.Profile("1".repeat(32),"2".repeat(32),"Conversion fixture",NativePerpsTransactionTest.payer(),"0x"+"1".repeat(40),1000);}
    static byte[] sign(byte[] message,int seed){byte[] signature=new byte[64];Ed25519.sign(NativePerpsTransactionTest.seed(seed),0,message,0,message.length,signature,0);return signature;}
    static byte[] signed(SolanaMessage m){byte[] message=m.bytes(),wire=new byte[1+64*m.signatures+message.length];wire[0]=(byte)m.signatures;
        for(int i=0;i<m.signatures;i++)System.arraycopy(sign(message,i+1),0,wire,1+64*i,64);System.arraycopy(message,0,wire,1+64*m.signatures,message.length);return wire;}
    static String b64(byte[] b){return Base64.encodeToString(b,Base64.NO_WRAP);}
    static JSONObject account(String program,byte[] bytes,long lam)throws Exception{return new JSONObject().put("owner",program).put("executable",false).put("lamports",lam).put("data",new JSONArray().put(b64(bytes)).put("base64"));}
    static JSONObject token(String owner,String mint,long amount,int decimals)throws Exception{
        byte[] b=new byte[165];System.arraycopy(DevnetSolana.decode(mint,32),0,b,0,32);System.arraycopy(DevnetSolana.decode(owner,32),0,b,32,32);
        ByteBuffer.wrap(b).order(ByteOrder.LITTLE_ENDIAN).putLong(64,amount);b[108]=1;boolean sol=NativeSwapSetup.SOL.equals(mint);
        if(sol)ByteBuffer.wrap(b).order(ByteOrder.LITTLE_ENDIAN).putInt(109,1).putLong(113,2039280);
        return account(SplTokenAccount.PROGRAM,b,2039280+(sol?amount:0));
    }
    static JSONObject tx(SolanaMessage message,Map<String,NativePerpsSimulation.Account> before,Map<String,NativePerpsSimulation.Account> after)throws Exception{
        JSONArray pre=new JSONArray(),post=new JSONArray(),preTokens=new JSONArray(),postTokens=new JSONArray();
        for(int i=0;i<message.staticAccountCount();i++){
            String key=DevnetSolana.encode(message.staticKey(i));NativePerpsSimulation.Account a=before.get(key),b=after.get(key);
            pre.put(a==null?"0":a.lamports.toString());post.put(b==null?"0":b.lamports.toString());
            tokenMeta(preTokens,i,a);tokenMeta(postTokens,i,b);
        }
        return new JSONObject().put("slot",100).put("version",message.version==-1?"legacy":0).put("transaction",new JSONArray().put(b64(signed(message))).put("base64"))
            .put("meta",new JSONObject().put("err",JSONObject.NULL).put("fee",15000).put("preBalances",pre).put("postBalances",post).put("preTokenBalances",preTokens).put("postTokenBalances",postTokens));
    }
    static void tokenMeta(JSONArray a,int index,NativePerpsSimulation.Account account)throws Exception{
        if(account==null||!SplTokenAccount.PROGRAM.equals(account.owner)||account.data().length!=165)return;
        SplTokenAccount t=SplTokenAccount.decode(account.owner,false,account.data());String mint=DevnetSolana.encode(t.mint());
        a.put(new JSONObject().put("accountIndex",index).put("mint",mint).put("owner",DevnetSolana.encode(t.owner())).put("programId",SplTokenAccount.PROGRAM)
            .put("uiTokenAmount",new JSONObject().put("amount",t.amount.toString()).put("decimals",NativeSwapSetup.SOL.equals(mint)?9:NativeSolanaTokens.USDC.equals(mint)?6:8)));
    }
    final class ReceiptRpc implements NativeWalletRpc.Transport {
        JSONObject transaction;String signature;String confirmation="finalized";boolean badGenesis,failed;int calls;
        ReceiptRpc(JSONObject transaction)throws Exception{this.transaction=transaction;signature=DevnetSolana.encode(Arrays.copyOfRange(NativePerpsSettlementStore.decode(transaction.getJSONArray("transaction").getString(0)),1,65));}
        public Object request(String method,JSONArray params)throws Exception{calls++;
            if(method.equals("getGenesisHash"))return badGenesis?"wrong":GENESIS;
            assertEquals(signature,method.equals("getTransaction")?params.getString(0):params.getJSONArray(0).getString(0));
            if(method.equals("getSignatureStatuses"))return new JSONObject().put("context",new JSONObject().put("slot",100)).put("value",new JSONArray().put(new JSONObject().put("slot",100).put("confirmationStatus",confirmation).put("err",failed?"failed":JSONObject.NULL)));
            if(method.equals("getTransaction")){assertEquals("finalized",params.getJSONObject(1).getString("commitment"));return transaction;}
            throw new AssertionError("No financial RPC allowed: "+method);
        }
    }
    static NativePerpsCloseServiceTest.Rpc closeRpc(String asset,int side,boolean nativeSol)throws Exception{
        var rpc=nativeSol?new NativePerpsCloseServiceTest.Rpc():NativePerpsCloseRoutesTest.fixture(asset,side,false);
        if(nativeSol){var funding=new NativePerpsCloseFundingTest.Fixture(true,-1);rpc.before.putAll(funding.before);rpc.after.putAll(funding.after);}
        return rpc;
    }
    NativePerpsSettlementStore.Close record(String asset,int side,boolean nativeSol)throws Exception{
        NativePerpsCloseServiceTest.Rpc rpc=closeRpc(asset,side,nativeSol);
        var review=rpc.service().review(owner.solanaAddress,asset,side,"103",50);
        var envelope=NativePerpsSignedEnvelope.attach(review.transaction,sign(review.transaction.message.bytes(),1));
        new NativePerpsSettlementStore(context,owner).remember(envelope,review.intent,review.amounts,BigInteger.valueOf(100));
        return new NativePerpsSettlementStore(context,owner).latest(asset,side);
    }
    @Test public void finalizedReceiptsMeasureActualReturnForAllSixRoutesNotWholeWallet()throws Exception{
        for(String asset:new String[]{"BTC","ETH","SOL"})for(int side:new int[]{1,2}){
            var rpc=NativePerpsCloseRoutesTest.fixture(asset,side,false);var close=record(asset,side,false);ReceiptRpc evidence=new ReceiptRpc(tx(rpc.transaction.message,rpc.before,rpc.after));
            var payout=new NativePerpsSettlementReader(evidence).close(owner.solanaAddress,close);
            assertEquals(BigInteger.valueOf(1000000),payout.amount);assertEquals(NativePerpsCustody.mint(side==1?asset:"USDC"),payout.mint);
        }
        var rpc=closeRpc("SOL",1,true);var close=record("SOL",1,true);
        var payout=new NativePerpsSettlementReader(new ReceiptRpc(tx(rpc.transaction.message,rpc.before,rpc.after))).close(owner.solanaAddress,close);
        assertTrue(payout.nativeSol);assertEquals(BigInteger.valueOf(1000000),payout.amount);
    }
    @Test public void rejectsConfirmedFailedWrongNetworkChangedWireOrOwnerTokenMetadata()throws Exception{
        var rpc=NativePerpsCloseRoutesTest.fixture("BTC",1,false);var close=record("BTC",1,false);JSONObject good=tx(rpc.transaction.message,rpc.before,rpc.after);
        ReceiptRpc confirmed=new ReceiptRpc(good);confirmed.confirmation="confirmed";assertThrows(Exception.class,()->new NativePerpsSettlementReader(confirmed).close(owner.solanaAddress,close));
        ReceiptRpc network=new ReceiptRpc(good);network.badGenesis=true;assertThrows(Exception.class,()->new NativePerpsSettlementReader(network).close(owner.solanaAddress,close));
        for(int mutation=0;mutation<5;mutation++){
            JSONObject bad=new JSONObject(good.toString());
            if(mutation==0)bad.getJSONObject("meta").put("err","failed");
            if(mutation==1)bad.put("slot",99);
            if(mutation==2){byte[] wire=NativePerpsSettlementStore.decode(bad.getJSONArray("transaction").getString(0));wire[65]^=1;bad.getJSONArray("transaction").put(0,b64(wire));}
            if(mutation==3)bad.getJSONObject("meta").getJSONArray("postTokenBalances").getJSONObject(0).put("owner",NativeJupiterRouteTest.key(50));
            if(mutation==4)bad.getJSONObject("meta").getJSONArray("postTokenBalances").put(bad.getJSONObject("meta").getJSONArray("postTokenBalances").getJSONObject(0));
            ReceiptRpc evidence=new ReceiptRpc(bad);assertThrows(Exception.class,()->new NativePerpsSettlementReader(evidence).close(owner.solanaAddress,close));
        }
    }
    final class SwapRpc implements NativeWalletRpc.Transport {
        final String mint,source,dest;final boolean nativeSol;final int decimals;
        NativeSwapServiceTest.Clock clock=new NativeSwapServiceTest.Clock();int sends;boolean timeout,badOutput;long bank=100,existingWrapped;String sent;SolanaMessage sentMessage;
        SwapRpc(String asset,boolean nativeSol){mint=NativePerpsCustody.mint(asset);this.nativeSol=nativeSol;decimals="SOL".equals(asset)?9:8;
            source=DevnetSolana.encode(NativePerpsTokenBoundary.associated(DevnetSolana.decode(owner.solanaAddress,32),mint));dest=DevnetSolana.encode(NativePerpsTokenBoundary.associated(DevnetSolana.decode(owner.solanaAddress,32),NativeSolanaTokens.USDC));}
        JSONObject fixture(NativeSwapPreparation.Intent intent)throws Exception{
            assertEquals("1000000",intent.amount);assertEquals(NativeSolanaTokens.USDC,intent.outputMint);assertEquals(nativeSol||!mint.equals(NativeSwapSetup.SOL),intent.wrapAndUnwrapSol);
            String raw=NativeJupiterRouteTest.fixture().toString();
            int[] old={1,2,3,10,13};String[] next={owner.solanaAddress,mint,NativeSolanaTokens.USDC,source,dest};
            for(int i=0;i<old.length;i++)raw=raw.replace("\""+NativeJupiterRouteTest.key(old[i])+"\"","\""+next[i]+"\"");
            JSONObject envelope=new JSONObject(raw),body=envelope.getJSONObject("preparation"),route=body.getJSONArray("instructions").getJSONObject(0);
            body.put("inAmount","1000000");byte[] data=NativePerpsSettlementStore.decode(route.getString("data"));ByteBuffer.wrap(data).order(ByteOrder.LITTLE_ENDIAN).putLong(9,1000000);route.put("data",b64(data));
            if(nativeSol){
                JSONArray original=body.getJSONArray("instructions"),list=new JSONArray();
                list.put(ix(NativeSwapSetup.SYSTEM,ByteBuffer.allocate(12).order(ByteOrder.LITTLE_ENDIAN).putInt(2).putLong(1000000).array(),owner.solanaAddress,source));
                list.put(ix(SplTokenAccount.PROGRAM,new byte[]{17},source));for(int i=0;i<original.length();i++)list.put(original.get(i));
                list.put(ix(SplTokenAccount.PROGRAM,new byte[]{9},source,owner.solanaAddress,owner.solanaAddress));body.put("instructions",list);
            }return envelope;
        }
        JSONObject ix(String program,byte[] data,String... keys)throws Exception{JSONArray accounts=new JSONArray();for(String k:keys)accounts.put(new JSONObject().put("pubkey",k).put("isSigner",k.equals(owner.solanaAddress)).put("isWritable",k.equals(owner.solanaAddress)||k.equals(source)));
            return new JSONObject().put("programId",program).put("data",b64(data)).put("accounts",accounts);}
        public Object request(String method,JSONArray params)throws Exception{
            if(method.equals("getGenesisHash"))return GENESIS;if(method.equals("getSlot"))return bank;if(method.equals("getBlockHeight"))return 100;
            if(method.equals("getMinimumBalanceForRentExemption"))return 2039280;
            JSONObject response=new JSONObject().put("context",new JSONObject().put("slot",bank));
            if(method.equals("getFeeForMessage"))return response.put("value",5000);
            if(method.equals("getMultipleAccounts")){
                JSONArray addresses=params.getJSONArray(0),values=new JSONArray();for(int i=0;i<addresses.length();i++){
                    String key=addresses.getString(i);JSONObject a=account(NativeSwapSetup.SYSTEM,new byte[0],1000000000);
                    if(key.equals(source))a=token(owner.solanaAddress,mint,nativeSol?existingWrapped:1000000,decimals);
                    if(key.equals(dest))a=token(owner.solanaAddress,NativeSolanaTokens.USDC,0,6);
                    if(key.equals(mint)||key.equals(NativeSolanaTokens.USDC)){byte[] b=new byte[82];b[44]=(byte)(key.equals(mint)?decimals:6);b[45]=1;a=account(SplTokenAccount.PROGRAM,b,2039280);}
                    values.put(a);
                }return response.put("value",values);
            }
            if(method.equals("simulateTransaction")){
                JSONObject options=params.getJSONObject(1),value=new JSONObject().put("err",JSONObject.NULL).put("unitsConsumed",200000);
                if(options.has("accounts"))value.put("accounts",new JSONArray().put(account(NativeSwapSetup.SYSTEM,new byte[0],nativeSol?1001034280+existingWrapped:999995000))
                    .put(nativeSol?JSONObject.NULL:token(owner.solanaAddress,mint,0,decimals)).put(token(owner.solanaAddress,NativeSolanaTokens.USDC,badOutput?1:1184627,6)));
                return response.put("value",value);
            }
            if(method.equals("sendTransaction")){
                sends++;byte[] wire=NativePerpsSettlementStore.decode(params.getString(0));sent=DevnetSolana.encode(Arrays.copyOfRange(wire,1,65));sentMessage=SolanaMessage.parse(Arrays.copyOfRange(wire,65,wire.length));
                var c=new NativePerpsSettlementStore(context,owner).latest(mint.equals(NativeSwapSetup.SOL)?"SOL":mint.equals(NativePerpsCustody.mint("BTC"))?"BTC":"ETH",1);
                assertEquals(sent,c.conversion.getString("signature"));assertEquals(NativeTransferJournal.Phase.UNKNOWN,new NativeTransferJournal(context,owner,WalletNetwork.SOLANA_MAINNET).latest().phase);
                if(timeout)throw new IOException("fixture uncertain send");return sent;
            }throw new AssertionError("Unexpected fake swap RPC "+method);
        }
        NativeSwapTransfers transfers()throws Exception{NativeSwapService s=new NativeSwapService(this::fixture,NativeSwapServiceTest.accounts(clock,false),clock,new NativeSwapSimulation(this),(payer,mint,program)->DevnetSolana.encode(NativePerpsTokenBoundary.associated(DevnetSolana.decode(payer,32),mint)),new NativeSwapChainState(this));return new NativeSwapTransfers(context,owner,s,this);}
    }
    SolanaNativeTransfers.Signer signer(){return new SolanaNativeTransfers.Signer(){public String address(byte[] b){return owner.solanaAddress;}public byte[] sign(byte[] b,byte[] message){return NativePerpsConversionTest.sign(message,1);}};}
    NativePerpsConversionTransfers conversion(String asset,boolean nativeSol,SwapRpc swap)throws Exception{
        var rpc=closeRpc(asset,1,nativeSol);record(asset,1,nativeSol);
        return new NativePerpsConversionTransfers(context,owner,new NativePerpsSettlementReader(new ReceiptRpc(tx(rpc.transaction.message,rpc.before,rpc.after))),swap.transfers());
    }
    @Test public void convertsAllCollateralRoutesWithSeparateExactReviewAndDurableSingleSend()throws Exception{
        for(String asset:new String[]{"BTC","ETH","SOL"}){
            SwapRpc swap=new SwapRpc(asset,false);var transfers=conversion(asset,false,swap);var draft=transfers.prepare(asset,1);
            assertEquals("1.178704",draft.review.minimumOutput);assertTrue(draft.description(false).contains("Separate conversion"));assertEquals(0,swap.sends);
            byte[] signature=transfers.signReviewed(draft,new byte[0],signer(),()->true);assertEquals(0,swap.sends);
            transfers.submit(draft,signature,()->true);assertEquals(1,swap.sends);
            assertThrows(Exception.class,()->transfers.submit(draft,signature,()->true));
            assertThrows(Exception.class,()->transfers.prepare(asset,1));
            var journal=new NativeTransferJournal(context,owner,WalletNetwork.SOLANA_MAINNET);journal.settled(swap.sent,true);
        }
    }
    @Test public void nativeSolPayoutUsesOnlyReturnedLamportsAndRejectsLockExpiryAndBadMinimum()throws Exception{
        SwapRpc swap=new SwapRpc("SOL",true);var transfers=conversion("SOL",true,swap);var draft=transfers.prepare("SOL",1);
        assertEquals("0.001000000",draft.review.inputAmount);
        assertThrows(Exception.class,()->transfers.signReviewed(draft,new byte[0],signer(),()->false));assertEquals(0,swap.sends);
        byte[] signature=transfers.signReviewed(draft,new byte[0],signer(),()->true);assertThrows(Exception.class,()->transfers.signReviewed(draft,new byte[0],signer(),()->true));
        swap.badOutput=true;assertThrows(Exception.class,()->transfers.submit(draft,signature,()->true));assertEquals(0,swap.sends);
        swap.clock.time=16000;assertThrows(Exception.class,()->transfers.submit(draft,signature,()->true));
    }
    @Test public void conversionRejectsPreCloseBalanceBanksAndUnrelatedWrappedSolRefunds()throws Exception{
        SwapRpc stale=new SwapRpc("BTC",false);stale.bank=99;var first=conversion("BTC",false,stale);assertThrows(IOException.class,()->first.prepare("BTC",1));assertEquals(0,stale.sends);
        SwapRpc wrapped=new SwapRpc("SOL",true);wrapped.existingWrapped=500000;var second=conversion("SOL",true,wrapped);assertThrows(IOException.class,()->second.prepare("SOL",1));assertEquals(0,wrapped.sends);
    }
    @Test public void timeoutReservationSurvivesRestartAndPreventsDuplicateConversion()throws Exception{
        SwapRpc swap=new SwapRpc("ETH",false);swap.timeout=true;var transfers=conversion("ETH",false,swap);var draft=transfers.prepare("ETH",1);
        byte[] signature=transfers.signReviewed(draft,new byte[0],signer(),()->true);assertThrows(IOException.class,()->transfers.submit(draft,signature,()->true));
        var store=new NativePerpsSettlementStore(context,owner);assertNotNull(store.latest("ETH",1).conversion);
        assertThrows(Exception.class,()->store.requireAvailable(draft.close));assertThrows(Exception.class,()->new NativeTransferJournal(context,owner,WalletNetwork.SOLANA_MAINNET).requireNoPending());assertEquals(1,swap.sends);
    }
    @Test public void alreadyUsdcCloseNeverRequestsQuoteOrSignature()throws Exception{
        var close=record("BTC",2,false);var rpc=NativePerpsCloseRoutesTest.fixture("BTC",2,false);SwapRpc swap=new SwapRpc("BTC",false);
        var transfers=new NativePerpsConversionTransfers(context,owner,new NativePerpsSettlementReader(new ReceiptRpc(tx(rpc.transaction.message,rpc.before,rpc.after))),swap.transfers());
        assertTrue(transfers.status("BTC",2,false).contains("Already USDC"));assertThrows(IOException.class,()->transfers.prepare("BTC",2));assertEquals(0,swap.sends);
    }
    JSONObject conversionTransaction(SwapRpc swap,long output)throws Exception{
        Map<String,NativePerpsSimulation.Account> before=new LinkedHashMap<>(),after=new LinkedHashMap<>();
        for(int i=0;i<swap.sentMessage.staticAccountCount();i++){
            String key=DevnetSolana.encode(swap.sentMessage.staticKey(i));
            JSONObject result=(JSONObject)swap.request("getMultipleAccounts",new JSONArray().put(new JSONArray().put(key)).put(new JSONObject()));
            NativePerpsSimulation.Account account=NativePerpsSimulation.Account.fromRpc(result.getJSONArray("value").getJSONObject(0));before.put(key,account);after.put(key,account);
        }
        after.put(swap.source,NativePerpsSimulation.Account.fromRpc(token(owner.solanaAddress,swap.mint,0,swap.decimals)));
        after.put(swap.dest,NativePerpsSimulation.Account.fromRpc(token(owner.solanaAddress,NativeSolanaTokens.USDC,output,6)));
        return tx(swap.sentMessage,before,after);
    }
    @Test public void finalConversionVerifiesExactSignedMessageOwnerAndProtectedUsdcMinimum()throws Exception{
        SwapRpc swap=new SwapRpc("BTC",false);var transfers=conversion("BTC",false,swap);var draft=transfers.prepare("BTC",1);
        transfers.submit(draft,transfers.signReviewed(draft,new byte[0],signer(),()->true),()->true);
        var close=new NativePerpsSettlementStore(context,owner).latest("BTC",1);JSONObject transaction=conversionTransaction(swap,1184627);ReceiptRpc evidence=new ReceiptRpc(transaction);
        assertEquals(BigInteger.valueOf(1184627),new NativePerpsSettlementReader(evidence).conversion(owner.solanaAddress,close));
        ReceiptRpc tooLittle=new ReceiptRpc(conversionTransaction(swap,1178703));assertThrows(Exception.class,()->new NativePerpsSettlementReader(tooLittle).conversion(owner.solanaAddress,close));
        evidence.confirmation="confirmed";assertThrows(Exception.class,()->new NativePerpsSettlementReader(evidence).conversion(owner.solanaAddress,close));
        assertThrows(Exception.class,()->new NativePerpsSettlementStore(context,owner).requireAvailable(close));
    }
    @Test public void onlyFinalizedFailedExactConversionCanBeReleasedForExplicitNewReview()throws Exception{
        SwapRpc swap=new SwapRpc("ETH",false);var transfers=conversion("ETH",false,swap);var draft=transfers.prepare("ETH",1);
        transfers.submit(draft,transfers.signReviewed(draft,new byte[0],signer(),()->true),()->true);
        var store=new NativePerpsSettlementStore(context,owner);var close=store.latest("ETH",1);JSONObject transaction=conversionTransaction(swap,0);transaction.getJSONObject("meta").put("err","failed");
        ReceiptRpc failed=new ReceiptRpc(transaction);failed.failed=true;failed.confirmation="confirmed";
        assertThrows(Exception.class,()->new NativePerpsSettlementReader(failed).conversionFailed(owner.solanaAddress,close));
        failed.confirmation="finalized";assertTrue(new NativePerpsSettlementReader(failed).conversionFailed(owner.solanaAddress,close));
        store.releaseFailed(close);store.requireAvailable(store.latest("ETH",1));assertNull(store.latest("ETH",1).conversion);
        // The shared UNKNOWN/SUBMITTED journal still blocks another operation
        // until its separate status recovery records the final chain failure.
        assertThrows(Exception.class,()->new NativeTransferJournal(context,owner,WalletNetwork.SOLANA_MAINNET).requireNoPending());
    }
}
