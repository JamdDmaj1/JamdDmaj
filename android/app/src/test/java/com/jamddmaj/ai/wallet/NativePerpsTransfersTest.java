package com.jamddmaj.ai.wallet;

import android.content.Context;
import android.content.ContextWrapper;
import android.util.Base64;
import java.io.File;
import java.math.BigInteger;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import org.bouncycastle.math.ec.rfc8032.Ed25519;
import org.json.*;
import org.junit.*;
import org.junit.rules.TemporaryFolder;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;

/** Complete review/sign/submit lifecycle using only deterministic unfunded keys
 * and fake transports, with real native account and simulation validators. */
@RunWith(RobolectricTestRunner.class)
@Config(sdk=30)
public class NativePerpsTransfersTest {
    @Rule public TemporaryFolder folder=new TemporaryFolder();
    private Context context;private NativeWalletProfiles.Profile owner;
    private final NativePerpsServiceTest.Clock clock=new NativePerpsServiceTest.Clock();
    static final class Rpc implements NativeWalletRpc.Transport {
        final NativePerpsAccountVerificationTest.Rpc chain=new NativePerpsAccountVerificationTest.Rpc();
        final NativePerpsTransaction transaction;
        final boolean longSide;
        JSONArray watched;long credited=9950000,fee=15000;int simulations;
        Rpc(){this(false);}
        Rpc(boolean longSide){this.longSide=longSide;if(!longSide)NativePerpsPreSwapPlanTest.configureShort(chain.fixture);transaction=chain.transaction();}
        String payer(){return NativePerpsTransactionTest.payer();}
        String source(){return DevnetSolana.encode(chain.fixture.route.swap[1]);}
        String collateralAccount(){return longSide?DevnetSolana.encode(chain.fixture.route.swap[2]):source();}
        String position(){return DevnetSolana.encode(chain.fixture.route.opening[6]);}
        public Object request(String method,JSONArray params)throws Exception{
            if(method.equals("getBlockHeight"))return 50;
            if(method.equals("getMinimumBalanceForRentExemption"))return 2000000;
            if(method.equals("getFeeForMessage"))return context(fee);
            if(method.equals("getMultipleAccounts")&&params.getJSONArray(0).length()>1){watched=params.getJSONArray(0);return context(snapshot(false));}
            if(method.equals("simulateTransaction")){
                simulations++;assertArrayEquals(transaction.bytes(),Base64.decode(params.getString(0),Base64.NO_WRAP));
                return context(new JSONObject().put("err",JSONObject.NULL).put("unitsConsumed",400000).put("accounts",snapshot(true)));
            }
            return chain.request(method,params);
        }
        JSONObject context(Object value)throws Exception{return new JSONObject().put("context",new JSONObject().put("slot",100)).put("value",value);}
        JSONObject account(String program,long lamports,byte[] bytes)throws Exception{
            return new JSONObject().put("owner",program).put("executable",false).put("lamports",lamports)
                .put("data",new JSONArray().put(Base64.encodeToString(bytes,Base64.NO_WRAP)).put("base64"));
        }
        JSONArray snapshot(boolean after)throws Exception{
            JSONArray result=new JSONArray();
            for(int i=0;i<watched.length();i++){
                String address=watched.getString(i);
                if(address.equals(payer()))result.put(account(NativePerpsFunding.SYSTEM,after?100000000-fee-2000000:100000000,new byte[0]));
                else if(address.equals(source())){
                    byte[] token=new byte[165];System.arraycopy(DevnetSolana.decode(NativeSolanaTokens.USDC,32),0,token,0,32);
                    System.arraycopy(DevnetSolana.decode(payer(),32),0,token,32,32);token[108]=1;
                    ByteBuffer.wrap(token).order(ByteOrder.LITTLE_ENDIAN).putLong(64,after?20000000:30000000);
                    result.put(account(SplTokenAccount.PROGRAM,2000000,token));
                }else if(address.equals(position())){
                    if(!after){result.put(JSONObject.NULL);continue;}
                    byte[] position=NativePerpsPositionTest.fixture();
                    System.arraycopy(DevnetSolana.decode(payer(),32),0,position,8,32);
                    if(!longSide)System.arraycopy(DevnetSolana.decode(NativePerpsCustody.address("USDC"),32),0,position,104,32);
                    position[152]=(byte)(longSide?1:2);position[209]=(byte)NativePerpsAddresses.positionDerivation(payer(),"SOL",longSide?1:2).bump;
                    ByteBuffer.wrap(position).order(ByteOrder.LITTLE_ENDIAN).putLong(161,19900000).putLong(169,credited);
                    result.put(account(NativePerpsCustody.PROGRAM,2000000,position));
                }else if(longSide&&address.equals(collateralAccount()))result.put(JSONObject.NULL);
                else if(longSide&&address.equals(DevnetSolana.encode(chain.fixture.route.ledger[0]))){
                    byte[] ledger=NativePerpsTokenLedgerTest.fixture();
                    if(after){System.arraycopy(DevnetSolana.decode(collateralAccount(),32),0,ledger,8,32);ByteBuffer.wrap(ledger).order(ByteOrder.LITTLE_ENDIAN).putLong(40,0);}
                    result.put(account(NativePerpsCustody.PROGRAM,2000000,ledger));
                }else result.put(account(NativePerpsCustody.PROGRAM,2000000,new byte[0]));
            }
            return result;
        }
        NativePerpsService service(NativePerpsServiceTest.Clock clock){
            NativeSolanaAccounts accounts=new NativeSolanaAccounts(chain);
            NativePerpsSimulation simulation=new NativePerpsSimulation(this,accounts,(owner,mint,program)->NativeSolanaTokens.USDC.equals(mint)?source():collateralAccount());
            return new NativePerpsService((payer,intent)->new JSONObject().put("serializedTxBase64",Base64.encodeToString(transaction.bytes(),Base64.NO_WRAP))
                .put("positionPubkey",position()).put("txMetadata",new JSONObject().put("lastValidBlockHeight","100")),
                accounts::verifyPerpsOrderAccounts,clock,simulation);
        }
    }
    @Before public void setup(){
        context=new ContextWrapper(RuntimeEnvironment.getApplication()){@Override public File getNoBackupFilesDir(){return folder.getRoot();}};
        owner=new NativeWalletProfiles.Profile("1".repeat(32),"2".repeat(32),"Fixture",NativePerpsTransactionTest.payer(),"0x"+"1".repeat(40),1000);
        clock.wall=1792277047000L;
    }
    private SolanaNativeTransfers.Signer signer(int[] calls){return new SolanaNativeTransfers.Signer(){
        public String address(byte[] entropy){return owner.solanaAddress;}
        public byte[] sign(byte[] entropy,byte[] message){calls[0]++;byte[] result=new byte[64];Ed25519.sign(NativePerpsTransactionTest.seed(1),0,message,0,message.length,result,0);return result;}
    };}
    @Test public void verifiesRealNativeGatesBeforeFixtureSigningAndJournalFirstSubmission()throws Exception{
        Rpc rpc=new Rpc();int[] broadcasts={0},signatures={0};
        var transfers=new NativePerpsTransfers(context,owner,rpc.service(clock),request->{
            broadcasts[0]++;var recorded=new NativeTransferJournal(context,owner,WalletNetwork.SOLANA_MAINNET).latest();
            assertEquals(NativeTransferJournal.Phase.UNKNOWN,recorded.phase);
            return new JSONObject().put("action","increase-position").put("txid",recorded.transactionId);
        });
        var draft=transfers.prepare(rpc.chain.fixture.intent);
        assertEquals(BigInteger.valueOf(50000),draft.review.amounts.estimatedTradingCostUsd);
        byte[] signature=transfers.signReviewed(draft,new byte[0],signer(signatures),()->true);
        String id=transfers.submit(draft,signature,()->true);
        assertEquals(DevnetSolana.encode(signature),id);assertEquals(1,signatures[0]);assertEquals(1,broadcasts[0]);assertEquals(3,rpc.simulations);
        assertThrows(Exception.class,()->transfers.submit(draft,signature,()->true));
    }
    @Test public void verifiesUsdcLongPreSwapAndLedgerThroughWholeLifecycle()throws Exception{
        Rpc rpc=new Rpc(true);int[] broadcasts={0},signatures={0};
        var transfers=new NativePerpsTransfers(context,owner,rpc.service(clock),request->{
            broadcasts[0]++;var record=new NativeTransferJournal(context,owner,WalletNetwork.SOLANA_MAINNET).latest();
            assertEquals(1,record.perps.side);
            return new JSONObject().put("action","increase-position").put("txid",record.transactionId);
        });
        var draft=transfers.prepare(rpc.chain.fixture.intent);
        byte[] signature=transfers.signReviewed(draft,new byte[0],signer(signatures),()->true);
        assertEquals(DevnetSolana.encode(signature),transfers.submit(draft,signature,()->true));
        assertEquals(3,rpc.simulations);assertEquals(1,signatures[0]);assertEquals(1,broadcasts[0]);
        assertEquals(3,rpc.chain.ledgerReads);
    }
    @Test public void changedVerifiedCostsCannotReachSignerOrBroadcast()throws Exception{
        Rpc rpc=new Rpc();int[] calls={0};
        var transfers=new NativePerpsTransfers(context,owner,rpc.service(clock),request->{fail("No broadcast after cost change");return null;});
        var draft=transfers.prepare(rpc.chain.fixture.intent);rpc.credited=9940000;
        assertThrows(Exception.class,()->transfers.signReviewed(draft,new byte[0],signer(calls),()->true));assertEquals(0,calls[0]);
        assertNull(new NativeTransferJournal(context,owner,WalletNetwork.SOLANA_MAINNET).latest());
    }
    @Test public void expiryAndCancellationCannotReachSigner()throws Exception{
        Rpc rpc=new Rpc();int[] calls={0};
        var transfers=new NativePerpsTransfers(context,owner,rpc.service(clock),request->{fail("No broadcast");return null;});
        var draft=transfers.prepare(rpc.chain.fixture.intent);clock.wall+=15000;
        assertThrows(Exception.class,()->transfers.signReviewed(draft,new byte[0],signer(calls),()->true));
        transfers.invalidate();assertThrows(Exception.class,()->transfers.requireReview(draft,()->true));assertEquals(0,calls[0]);
    }
    @Test public void feeChangeAfterSignatureCannotReachBroadcast()throws Exception{
        Rpc rpc=new Rpc();int[] calls={0};
        var transfers=new NativePerpsTransfers(context,owner,rpc.service(clock),request->{fail("No broadcast after fee change");return null;});
        var draft=transfers.prepare(rpc.chain.fixture.intent);
        byte[] signature=transfers.signReviewed(draft,new byte[0],signer(calls),()->true);rpc.fee=20000;
        assertThrows(Exception.class,()->transfers.submit(draft,signature,()->true));assertEquals(1,calls[0]);
        assertNull(new NativeTransferJournal(context,owner,WalletNetwork.SOLANA_MAINNET).latest());
        assertThrows(Exception.class,()->transfers.signReviewed(draft,new byte[0],signer(calls),()->true));assertEquals(1,calls[0]);
    }
}
