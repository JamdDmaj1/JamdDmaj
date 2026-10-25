package com.jamddmaj.ai.wallet;

import android.util.Base64;
import java.io.ByteArrayOutputStream;
import java.math.BigInteger;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.security.MessageDigest;
import java.util.*;
import org.bouncycastle.math.ec.rfc8032.Ed25519;
import org.json.*;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;

/** Synthetic TP/SL + API key fixtures; no production account or send transport. */
@RunWith(RobolectricTestRunner.class)
@Config(sdk=30)
public class NativePerpsCancelTest {
    static final long RENT=2039280,FEE=15000,NOW=1792279214;
    static String payer(){return NativePerpsTransactionTest.payer();}
    static byte[] request(String asset,int side,boolean tp,boolean entire){
        byte[] data=new byte[230];ByteBuffer b=ByteBuffer.wrap(data).order(ByteOrder.LITTLE_ENDIAN);
        b.put(new byte[]{12,38,(byte)250,(byte)199,46,(byte)154,32,(byte)216});
        for(String key:new String[]{payer(),NativePerpsCustody.POOL,NativePerpsCustody.address(asset),DevnetSolana.encode(NativePerpsAddresses.position(payer(),asset,side)),NativePerpsFunding.USDC})b.put(DevnetSolana.decode(key,32));
        b.putLong(NOW).putLong(NOW).putLong(20000000).putLong(0).put((byte)2).put((byte)1).put((byte)side).put(new byte[3]);
        b.put((byte)1).putLong(110000000).put((byte)1).put((byte)((tp==(side==1))?1:0)).put((byte)1).put((byte)(entire?1:0)).put((byte)0).putLong(4);
        b.put((byte)NativePerpsAddresses.exitDerivation(NativePerpsAddresses.position(payer(),asset,side),BigInteger.valueOf(4)).bump).put((byte)0);return data;
    }
    static NativePerpsSimulation.Account account(String owner,byte[] data,long lamports)throws Exception{return NativePerpsCloseOracleContextTest.account(owner,data,lamports);}
    static NativePerpsSimulation.Account token(String owner,long amount)throws Exception{
        ByteBuffer b=ByteBuffer.allocate(165).order(ByteOrder.LITTLE_ENDIAN);b.put(DevnetSolana.decode(NativePerpsFunding.USDC,32)).put(DevnetSolana.decode(owner,32)).putLong(amount);b.put(108,(byte)1);
        return account(SplTokenAccount.PROGRAM,b.array(),RENT);
    }
    static NativePerpsTransaction transaction(NativePerpsCancelIntent intent,boolean v2,boolean createAta,int changedRole,boolean duplicate){
        String keeper=DevnetSolana.encode(NativePerpsTransactionTest.publicKey(2)),api=DevnetSolana.encode(NativePerpsTransactionTest.publicKey(3));
        String ata="ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",compute="ComputeBudget111111111111111111111111111111",event=DevnetSolana.encode(NativePerpsAddresses.eventAuthority());
        String[] roles=v2?new String[]{keeper,payer(),intent.ownerAta,NativePerpsCustody.POOL,intent.requestAddress,intent.requestAta,intent.positionAddress,NativePerpsFunding.USDC,SplTokenAccount.PROGRAM,NativePerpsFunding.SYSTEM,ata,event,NativePerpsCustody.PROGRAM}
            :new String[]{keeper,payer(),intent.ownerAta,NativePerpsCustody.POOL,intent.requestAddress,intent.requestAta,intent.positionAddress,SplTokenAccount.PROGRAM,event,NativePerpsCustody.PROGRAM};
        if(changedRole>=0)roles[changedRole]=DevnetSolana.encode(NativePerpsTransactionTest.publicKey(9));
        List<String> keys=new ArrayList<>(Arrays.asList(payer(),keeper,api));for(int role:new int[]{2,3,4,5})if(!keys.contains(roles[role]))keys.add(roles[role]);
        int mutable=keys.size();for(String role:roles)if(!keys.contains(role))keys.add(role);for(String key:new String[]{ata,compute,NativePerpsFunding.USDC,NativePerpsFunding.SYSTEM,SplTokenAccount.PROGRAM})if(!keys.contains(key))keys.add(key);
        ByteArrayOutputStream out=new ByteArrayOutputStream();out.writeBytes(new byte[]{3,(byte)(v2?1:2),(byte)(keys.size()-mutable),(byte)keys.size()});for(String key:keys)out.writeBytes(DevnetSolana.decode(key,32));out.writeBytes(new byte[32]);out.write(3+(createAta?1:0)+(duplicate?1:0));
        instruction(out,keys.indexOf(compute),new byte[0],ByteBuffer.allocate(5).order(ByteOrder.LITTLE_ENDIAN).put((byte)2).putInt(300000).array());
        instruction(out,keys.indexOf(compute),new byte[0],ByteBuffer.allocate(9).order(ByteOrder.LITTLE_ENDIAN).put((byte)3).putLong(1000).array());
        if(createAta){byte[] a={(byte)0,(byte)keys.indexOf(intent.ownerAta),0,(byte)keys.indexOf(NativePerpsFunding.USDC),(byte)keys.indexOf(NativePerpsFunding.SYSTEM),(byte)keys.indexOf(SplTokenAccount.PROGRAM)};instruction(out,keys.indexOf(ata),a,new byte[]{1});}
        byte[] indexes=new byte[roles.length];for(int i=0;i<roles.length;i++)indexes[i]=(byte)keys.indexOf(roles[i]);
        byte[] tag=v2?new byte[]{121,68,(byte)162,28,(byte)216,47,(byte)200,66}:new byte[]{40,105,(byte)217,(byte)188,(byte)220,45,109,110};
        instruction(out,keys.indexOf(NativePerpsCustody.PROGRAM),indexes,tag);if(duplicate)instruction(out,keys.indexOf(NativePerpsCustody.PROGRAM),indexes,tag);
        byte[] message=out.toByteArray(),wire=new byte[193+message.length];wire[0]=3;System.arraycopy(message,0,wire,193,message.length);Ed25519.sign(NativePerpsTransactionTest.seed(3),0,message,0,message.length,wire,129);
        return NativePerpsTransaction.decode(wire,payer());
    }
    private static void instruction(ByteArrayOutputStream out,int program,byte[] indexes,byte[] data){out.write(program);out.write(indexes.length);out.writeBytes(indexes);out.write(data.length);out.writeBytes(data);}
    static final class Clock implements NativeSwapService.Clock {long now=NOW*1000;public long wall(){return now;}public long elapsed(){return 1000;}}
    static final class Rpc implements NativeWalletRpc.Transport {
        final Map<String,NativePerpsSimulation.Account> before=new LinkedHashMap<>(),after=new LinkedHashMap<>();
        final NativePerpsCancelIntent intent;NativePerpsTransaction transaction;final Clock clock=new Clock();
        long slot=100;int simulations,preparations;boolean failed,bankMismatch,finalAbsence,badIdentity,badKeeper,badWireType;String signatureState="confirmed";
        NativePerpsSimulation.Account finalizedPosition;
        Rpc(String asset,int side,boolean v2,boolean createAta)throws Exception{
            String address=DevnetSolana.encode(NativePerpsAddresses.exitRequest(NativePerpsAddresses.position(payer(),asset,side),BigInteger.valueOf(4)));
            NativePerpsSimulation.Account request=account(NativePerpsCustody.PROGRAM,NativePerpsCancelTest.request(asset,side,v2,v2),RENT);
            intent=NativePerpsCancelIntent.decode(payer(),asset,side,address,request);transaction=transaction(intent,v2,createAta,-1,false);
            before.put(address,request);after.put(address,null);before.put(intent.requestAta,token(address,500));after.put(intent.requestAta,null);
            before.put(intent.ownerAta,createAta?null:token(payer(),100000));after.put(intent.ownerAta,token(payer(),createAta?500:100500));
            before.put(payer(),account(NativePerpsFunding.SYSTEM,new byte[0],100000000));after.put(payer(),account(NativePerpsFunding.SYSTEM,new byte[0],100000000+2*RENT-FEE-(createAta?RENT:0)));
            before.put(intent.positionAddress,null);after.put(intent.positionAddress,null);
            byte[] tag=Arrays.copyOf(MessageDigest.getInstance("SHA-256").digest("account:Pool".getBytes(java.nio.charset.StandardCharsets.US_ASCII)),8);
            NativePerpsSimulation.Account pool=account(NativePerpsCustody.PROGRAM,tag,RENT);before.put(NativePerpsCustody.POOL,pool);after.put(NativePerpsCustody.POOL,pool);
            String keeper=DevnetSolana.encode(NativePerpsTransactionTest.publicKey(2));NativePerpsSimulation.Account k=account(NativePerpsFunding.SYSTEM,new byte[0],1000000);before.put(keeper,k);after.put(keeper,k);
        }
        public Object request(String method,JSONArray params)throws Exception{
            switch(method){
                case "getGenesisHash":return "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
                case "getSlot":return slot;
                case "getBlockHeight":return 50;
                case "getMinimumBalanceForRentExemption":return RENT;
                case "getMultipleAccounts":
                    boolean finalized="finalized".equals(params.getJSONObject(1).optString("commitment"));Map<String,NativePerpsSimulation.Account> bank=finalized&&finalAbsence?after:before;
                    if(finalized&&finalizedPosition!=null){bank=new LinkedHashMap<>(bank);bank.put(intent.positionAddress,finalizedPosition);}return context(snapshot(params.getJSONArray(0),bank),slot);
                case "getProgramAccounts":return context(new JSONArray().put(new JSONObject().put("pubkey",intent.requestAddress).put("account",json(before.get(intent.requestAddress)))),slot);
                case "getFeeForMessage":assertArrayEquals(transaction.message.bytes(),Base64.decode(params.getString(0),Base64.NO_WRAP));return context(FEE,slot);
                case "getSignatureStatuses":return new JSONObject().put("value",new JSONArray().put(new JSONObject().put("confirmationStatus",signatureState).put("err",JSONObject.NULL)));
                case "simulateTransaction":simulations++;assertArrayEquals(transaction.bytes(),Base64.decode(params.getString(0),Base64.NO_WRAP));JSONObject options=params.getJSONObject(1);assertFalse(options.getBoolean("sigVerify"));assertFalse(options.getBoolean("replaceRecentBlockhash"));
                    return context(new JSONObject().put("err",failed?"fixture":JSONObject.NULL).put("unitsConsumed",100000).put("accounts",snapshot(options.getJSONObject("accounts").getJSONArray("addresses"),after)),slot+(bankMismatch?1:0));
                default:throw new AssertionError("Forbidden cancellation RPC: "+method);
            }
        }
        private JSONObject context(Object value,long slot)throws Exception{return new JSONObject().put("context",new JSONObject().put("slot",slot)).put("value",value);}
        private Object json(NativePerpsSimulation.Account a)throws Exception{return a==null?JSONObject.NULL:new JSONObject().put("owner",a.owner).put("executable",a.executable).put("lamports",a.lamports).put("data",new JSONArray().put(Base64.encodeToString(a.data(),Base64.NO_WRAP)).put("base64"));}
        private JSONArray snapshot(JSONArray keys,Map<String,NativePerpsSimulation.Account> map)throws Exception{JSONArray values=new JSONArray();for(int i=0;i<keys.length();i++)values.put(json(map.get(keys.getString(i))));return values;}
        NativePerpsCancelService service(){return new NativePerpsCancelService(i->{preparations++;assertEquals(i.requestAddress,NativePerpsCancelService.body(i).getString("positionRequestPubkey"));return new JSONObject().put("positionRequestPubkey",badIdentity?i.ownerAta:i.requestAddress).put("requireKeeperSignature",!badKeeper).put("transactionType",badWireType?"v0":"legacy").put("serializedTxBase64",Base64.encodeToString(transaction.bytes(),Base64.NO_WRAP)).put("txMetadata",new JSONObject().put("lastValidBlockHeight","60"));},new NativePerpsCloseChain(this),new NativePerpsSimulation(this,new NativeSolanaAccounts(this),(owner,mint,program)->DevnetSolana.encode(NativePerpsTokenBoundary.associated(DevnetSolana.decode(owner,32),mint))),clock);}
    }
    @Test public void reviewsAllSixRoutesBothLayoutsAndAtaCreationWithoutSending()throws Exception{
        for(String asset:new String[]{"BTC","ETH","SOL"})for(int side:new int[]{1,2})for(boolean v2:new boolean[]{false,true})for(boolean create:new boolean[]{false,true}){
            Rpc rpc=new Rpc(asset,side,v2,create);NativePerpsCancelService service=rpc.service();var review=service.review(rpc.intent);
            assertEquals(BigInteger.valueOf(500),review.amounts.returnedUsdc);assertEquals(BigInteger.valueOf(create?RENT:0),review.amounts.addedRent);assertEquals(BigInteger.valueOf(2*RENT),review.amounts.recoveredRent);
            service.revalidate(review);assertEquals(2,rpc.simulations);assertEquals(1,rpc.preparations);assertTrue(review.description(false).contains("not a trade"));
        }
    }
    @Test public void discoveryAndFinalizedAbsenceAreOwnerPositionAndBankBound()throws Exception{
        Rpc rpc=new Rpc("SOL",1,true,false);NativePerpsCloseChain chain=new NativePerpsCloseChain(rpc);
        assertEquals(rpc.intent.requestAddress,chain.pendingExits(payer(),"SOL",1).exits.get(0).requestAddress);
        assertFalse(chain.cancellationAbsent(rpc.intent.requestAddress,payer(),"SOL",1,BigInteger.valueOf(4),BigInteger.valueOf(100)));
        rpc.finalAbsence=true;assertTrue(chain.cancellationAbsent(rpc.intent.requestAddress,payer(),"SOL",1,BigInteger.valueOf(4),BigInteger.valueOf(100)));
        assertThrows(Exception.class,()->chain.cancellationAbsent(rpc.intent.requestAddress,payer(),"SOL",1,BigInteger.valueOf(4),BigInteger.valueOf(101)));
    }
    @Test public void rejectsForeignChangedExecutedOrMalformedRequest()throws Exception{
        Rpc rpc=new Rpc("SOL",1,false,false);byte[] good=rpc.before.get(rpc.intent.requestAddress).data();
        for(int at:new int[]{0,8,40,72,104,136,192,200,201,202,203,204,205,206,215,217,219,220,228,229}){
            byte[] bad=good.clone();bad[at]^=1;NativePerpsSimulation.Account a=account(NativePerpsCustody.PROGRAM,bad,RENT);
            assertThrows("offset "+at,Exception.class,()->NativePerpsCancelIntent.decode(payer(),"SOL",1,rpc.intent.requestAddress,a));
        }
        for(int length=0;length<230;length++){NativePerpsSimulation.Account a=account(NativePerpsCustody.PROGRAM,Arrays.copyOf(good,length),RENT);assertThrows(Exception.class,()->NativePerpsCancelIntent.decode(payer(),"SOL",1,rpc.intent.requestAddress,a));}
    }
    @Test public void rejectsEveryRedirectedAccountDuplicateCancellationOrActivePosition()throws Exception{
        for(boolean v2:new boolean[]{false,true}){Rpc rpc=new Rpc("SOL",1,v2,false);for(int role=1;role<(v2?13:10);role++){
            int changed=role;assertThrows(Exception.class,()->NativePerpsCancelPolicy.check(transaction(rpc.intent,v2,false,changed,false),new NativePerpsCloseChain(rpc).resolve(transaction(rpc.intent,v2,false,changed,false).message),rpc.intent));
        }
            NativePerpsTransaction duplicate=transaction(rpc.intent,v2,false,-1,true);assertThrows(Exception.class,()->NativePerpsCancelPolicy.check(duplicate,new NativePerpsCloseChain(rpc).resolve(duplicate.message),rpc.intent));
        }
        Rpc active=new Rpc("SOL",1,false,false);byte[] position=NativePerpsPositionTest.fixture();System.arraycopy(DevnetSolana.decode(payer(),32),0,position,8,32);position[209]=(byte)NativePerpsAddresses.positionDerivation(payer(),"SOL",1).bump;
        active.before.put(active.intent.positionAddress,account(NativePerpsCustody.PROGRAM,position,RENT));assertThrows(Exception.class,()->active.service().review(active.intent));assertEquals(0,active.preparations);
    }
    @Test public void refusesWrongRefundPoolMutationFailureBankMismatchAndExpiredReview()throws Exception{
        for(int mode=0;mode<5;mode++){
            Rpc rpc=new Rpc("SOL",1,false,false);
            if(mode==0)rpc.after.put(rpc.intent.ownerAta,token(payer(),100499));if(mode==1)rpc.after.put(NativePerpsCustody.POOL,account(NativePerpsCustody.PROGRAM,new byte[8],RENT));if(mode==2)rpc.failed=true;if(mode==3)rpc.bankMismatch=true;
            if(mode<4)assertThrows(Exception.class,()->rpc.service().review(rpc.intent));else{NativePerpsCancelService service=rpc.service();var review=service.review(rpc.intent);rpc.clock.now+=25000;assertThrows(Exception.class,()->service.requireCurrentReview(review));}
        }
    }
    @Test public void rejectsBuilderIdentitySignatureRequirementTypeAndChangedRequest()throws Exception{
        for(int mode=0;mode<3;mode++){
            Rpc rpc=new Rpc("SOL",1,false,false);rpc.badIdentity=mode==0;rpc.badKeeper=mode==1;rpc.badWireType=mode==2;
            assertThrows(Exception.class,()->rpc.service().review(rpc.intent));assertEquals(0,rpc.simulations);
        }
        Rpc changed=new Rpc("SOL",1,false,false);NativePerpsCancelService service=changed.service();var review=service.review(changed.intent);
        NativePerpsSimulation.Account original=changed.before.get(changed.intent.requestAddress);byte[] data=original.data();data[207]^=1;
        changed.before.put(changed.intent.requestAddress,account(original.owner,data,original.lamports.longValueExact()));assertThrows(Exception.class,()->service.revalidate(review));
        service.invalidate();assertThrows(Exception.class,()->service.requireCurrentReview(review));
    }
    @Test public void aMerelyConfirmedCloseCannotRemoveFinalizedPositionProtection()throws Exception{
        Rpc rpc=new Rpc("SOL",1,false,false);byte[] position=NativePerpsPositionTest.fixture();System.arraycopy(DevnetSolana.decode(payer(),32),0,position,8,32);position[209]=(byte)NativePerpsAddresses.positionDerivation(payer(),"SOL",1).bump;
        rpc.finalizedPosition=account(NativePerpsCustody.PROGRAM,position,RENT);
        assertThrows(Exception.class,()->rpc.service().review(rpc.intent));assertEquals(0,rpc.preparations);assertEquals(0,rpc.simulations);
    }
}
