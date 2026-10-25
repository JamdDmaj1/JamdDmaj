package com.jamddmaj.ai.wallet;

import java.math.BigInteger;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.Map;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;

/** All six markets/directions and both close layouts, with unfunded synthetic
 * snapshots. This does not claim mainnet signing or economic execution proof. */
@RunWith(RobolectricTestRunner.class)
@Config(sdk=30)
public class NativePerpsCloseRoutesTest {
    private static final long NOW=1792279214,RENT=2039280,FEE=15000,PAYOUT=1000000;
    private static String payer(){return NativePerpsTransactionTest.payer();}
    private static int id(String asset){return "SOL".equals(asset)?0:"ETH".equals(asset)?1:"BTC".equals(asset)?2:3;}
    private static NativePerpsCustody custody(String asset){
        byte[] data=NativePerpsCustodyTest.fixture();System.arraycopy(DevnetSolana.decode(NativePerpsCustody.mint(asset),32),0,data,40,32);
        data[104]=(byte)("SOL".equals(asset)?9:"USDC".equals(asset)?6:8);data[105]=(byte)("USDC".equals(asset)?1:0);
        System.arraycopy(NativePerpsTransactionTest.publicKey(30+id(asset)),0,data,72,32);
        byte[] ag=SolanaProgramAddress.find(NativePerpsCloseOracleContext.DOVES,Arrays.asList("ag_feed".getBytes(StandardCharsets.US_ASCII),DevnetSolana.decode(NativePerpsCustody.mint(asset),32))).key();System.arraycopy(ag,0,data,384,32);
        return NativePerpsCustody.decode(asset,NativePerpsCustody.address(asset),NativePerpsCustody.PROGRAM,false,data);
    }
    private static NativePerpsSimulation.Account account(String owner,byte[] data,long lamports)throws Exception{return NativePerpsCloseOracleContextTest.account(owner,data,lamports);}
    private static NativePerpsSimulation.Account token(String owner,NativePerpsCustody c,long amount)throws Exception{
        ByteBuffer b=ByteBuffer.allocate(165).order(ByteOrder.LITTLE_ENDIAN);b.put(DevnetSolana.decode(c.mint,32)).put(DevnetSolana.decode(owner,32)).putLong(amount).put(108,(byte)1);
        boolean sol="SOL".equals(c.asset);if(sol)b.putInt(109,1).putLong(113,RENT);return account(SplTokenAccount.PROGRAM,b.array(),RENT+(sol?amount:0));
    }
    private static void oracles(NativePerpsCustody c,Map<String,NativePerpsSimulation.Account> before,Map<String,NativePerpsSimulation.Account> after)throws Exception{
        ByteBuffer ag=ByteBuffer.allocate(266).order(ByteOrder.LITTLE_ENDIAN);ag.put(new byte[]{112,(byte)249,(byte)139,(byte)217,(byte)215,(byte)208,(byte)249,54});ag.put(DevnetSolana.decode(c.mint,32));
        ag.putLong(168,103000000).put(176,(byte)-6).putLong(177,NOW).putInt(185,30).putInt(189,60);
        SolanaProgramAddress.Derived pda=SolanaProgramAddress.find(NativePerpsCloseOracleContext.DOVES,Arrays.asList("ag_feed".getBytes(StandardCharsets.US_ASCII),DevnetSolana.decode(c.mint,32)));
        ag.put(201,(byte)pda.bump);ag.position(202);byte[] lazer=NativePerpsTransactionTest.publicKey(50+id(c.asset));ag.put(lazer);
        NativePerpsSimulation.Account aggregate=account(NativePerpsCloseOracleContext.DOVES,ag.array(),RENT);before.put(c.dovesAgOracle,aggregate);after.put(c.dovesAgOracle,aggregate);
        ByteBuffer feed=ByteBuffer.allocate(96).order(ByteOrder.LITTLE_ENDIAN);feed.put(new byte[]{(byte)189,103,(byte)252,23,(byte)152,35,(byte)243,(byte)156});
        feed.putLong(73,103000000).put(81,(byte)-6).putLong(82,NOW).putInt(91,1+id(c.asset));
        String address=DevnetSolana.encode(lazer);NativePerpsSimulation.Account f=account(NativePerpsCloseOracleContext.DOVES,feed.array(),RENT);before.put(address,f);after.put(address,f);
    }
    static NativePerpsCloseServiceTest.Rpc fixture(String asset,int side,boolean v2)throws Exception{
        NativePerpsCustody market=custody(asset),usdc=custody("USDC"),collateral=side==1?market:usdc;
        byte[] position=NativePerpsPositionTest.fixture();System.arraycopy(DevnetSolana.decode(payer(),32),0,position,8,32);
        System.arraycopy(DevnetSolana.decode(market.address,32),0,position,72,32);System.arraycopy(DevnetSolana.decode(collateral.address,32),0,position,104,32);
        position[152]=(byte)side;position[209]=(byte)NativePerpsAddresses.positionDerivation(payer(),asset,side).bump;
        String positionAddress=DevnetSolana.encode(NativePerpsAddresses.position(payer(),asset,side));
        NativePerpsPosition decoded=NativePerpsPosition.decode(positionAddress,NativePerpsCustody.PROGRAM,false,position,payer(),asset,side);
        NativePerpsCloseIntent intent=new NativePerpsCloseIntent(payer(),asset,side,decoded,"103",50);
        NativePerpsTransaction transaction=NativePerpsCloseBindingsTest.transaction(v2,-1,false,true,intent,market,collateral);
        NativePerpsCloseServiceTest.Rpc rpc=new NativePerpsCloseServiceTest.Rpc(transaction,false);
        rpc.before.put(positionAddress,account(NativePerpsCustody.PROGRAM,position,3000000));rpc.after.put(positionAddress,null);
        rpc.before.put(payer(),account(NativePerpsFunding.SYSTEM,new byte[0],100000000));rpc.after.put(payer(),account(NativePerpsFunding.SYSTEM,new byte[0],100000000+3000000-FEE-RENT));
        String recipient=DevnetSolana.encode(NativePerpsTokenBoundary.associated(DevnetSolana.decode(payer(),32),collateral.mint));
        rpc.before.put(recipient,null);rpc.after.put(recipient,token(payer(),collateral,PAYOUT));
        String source=DevnetSolana.encode(NativePerpsTokenBoundary.associated(DevnetSolana.decode(payer(),32),usdc.mint));if(!source.equals(recipient)){rpc.before.put(source,null);rpc.after.put(source,null);}
        Map<String,NativePerpsCustody> unique=new LinkedHashMap<>();unique.put(market.address,market);unique.put(usdc.address,usdc);
        for(NativePerpsCustody c:unique.values()){
            byte[] old=NativePerpsCustodyTest.fixture();System.arraycopy(DevnetSolana.decode(c.mint,32),0,old,40,32);System.arraycopy(DevnetSolana.decode(c.tokenAccount,32),0,old,72,32);
            System.arraycopy(DevnetSolana.decode(c.dovesAgOracle,32),0,old,384,32);old[104]=(byte)c.decimals;old[105]=(byte)(c.stable?1:0);Arrays.fill(old,214,286,(byte)0);
            boolean isMarket=c.address.equals(market.address),isCollateral=c.address.equals(collateral.address);ByteBuffer b=ByteBuffer.wrap(old).order(ByteOrder.LITTLE_ENDIAN);
            b.putLong(222,10000000).putLong(278,NOW);if(isCollateral)b.putLong(230,decoded.lockedTokens.longValueExact());
            if(isMarket&&side==1)b.putLong(238,intent.sizeUsd.subtract(intent.collateralUsd).longValueExact());if(isMarket&&side==2)b.putLong(246,intent.sizeUsd.longValueExact());
            byte[] next=old.clone();ByteBuffer n=ByteBuffer.wrap(next).order(ByteOrder.LITTLE_ENDIAN);if(isCollateral)n.putLong(222,9000000).putLong(230,0);if(isMarket)n.putLong(side==1?238:246,0);
            rpc.before.put(c.address,account(NativePerpsCustody.PROGRAM,old,RENT));rpc.after.put(c.address,account(NativePerpsCustody.PROGRAM,next,RENT));
            String authority=DevnetSolana.encode(NativePerpsAddresses.transferAuthority());rpc.before.put(c.tokenAccount,token(authority,c,10000000));rpc.after.put(c.tokenAccount,token(authority,c,isCollateral?9000000:10000000));
            oracles(c,rpc.before,rpc.after);
        }
        ByteBuffer pool=ByteBuffer.allocate(320).order(ByteOrder.LITTLE_ENDIAN);pool.put(Arrays.copyOf(MessageDigest.getInstance("SHA-256").digest("account:Pool".getBytes(StandardCharsets.US_ASCII)),8));
        pool.putInt(4).put(new byte[]{'t','e','s','t'}).putInt(2).put(DevnetSolana.decode(market.address,32)).put(DevnetSolana.decode(usdc.address,32));
        NativePerpsSimulation.Account p=account(NativePerpsCustody.PROGRAM,pool.array(),RENT);rpc.before.put(NativePerpsCustody.POOL,p);rpc.after.put(NativePerpsCustody.POOL,p);
        NativePerpsSimulation.Account storage=account(NativePerpsCloseOracleData.PYTH,NativePerpsCloseOracleDataTest.storage(),RENT),treasury=account(NativePerpsFunding.SYSTEM,new byte[0],RENT);
        rpc.before.put(NativePerpsCloseOracleData.STORAGE,storage);rpc.after.put(NativePerpsCloseOracleData.STORAGE,storage);rpc.before.put(NativePerpsCloseOracleData.TREASURY,treasury);rpc.after.put(NativePerpsCloseOracleData.TREASURY,treasury);
        return rpc;
    }
    @Test public void verifiesAllSixRoutesBothVariantsAndRepeatedFreshReadWithoutNewPreparation()throws Exception{
        for(String asset:new String[]{"BTC","ETH","SOL"})for(int side:new int[]{1,2})for(boolean v2:new boolean[]{false,true}){
            NativePerpsCloseServiceTest.Rpc rpc=fixture(asset,side,v2);NativePerpsCloseService service=rpc.service();
            NativePerpsCloseService.Review review=service.review(payer(),asset,side,"103",50);
            assertEquals(asset,review.intent.asset);assertEquals(side==1?asset:"USDC",review.intent.receiveToken);assertEquals(BigInteger.valueOf(PAYOUT),review.amounts.receivedUnits);
            service.revalidate(review);assertEquals(2,rpc.simulations);assertEquals(1,rpc.preparations);
        }
    }
}
