package com.jamddmaj.ai.wallet;

import java.math.BigInteger;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.Map;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk=30)
public class NativePerpsCloseProtocolEffectsTest {
    private static final long NOW=1792279214;
    static final class Fixture {
        final NativePerpsCloseIntent intent=NativePerpsCloseBindingsTest.intent();
        final NativePerpsCustody market=NativePerpsCloseBindingsTest.custody(),usdc;
        final Map<String,NativePerpsSimulation.Account> before=new LinkedHashMap<>(),after=new LinkedHashMap<>();
        Fixture()throws Exception{
            byte[] usdcData=NativePerpsCustodyTest.fixture();System.arraycopy(DevnetSolana.decode(NativePerpsCustody.mint("USDC"),32),0,usdcData,40,32);usdcData[104]=6;usdcData[105]=1;
            System.arraycopy(NativePerpsTransactionTest.publicKey(10),0,usdcData,72,32);System.arraycopy(NativePerpsTransactionTest.publicKey(11),0,usdcData,384,32);
            usdc=NativePerpsCustody.decode("USDC",NativePerpsCustody.address("USDC"),NativePerpsCustody.PROGRAM,false,usdcData);
            byte[] position=NativePerpsPositionTest.fixture();System.arraycopy(DevnetSolana.decode(intent.payer,32),0,position,8,32);position[209]=(byte)NativePerpsAddresses.positionDerivation(intent.payer,"SOL",1).bump;
            before.put(intent.positionAddress,account(NativePerpsCustody.PROGRAM,position));
            for(NativePerpsCustody custody:new NativePerpsCustody[]{market,usdc}){
                boolean sol=custody==market;byte[] old=sol?NativePerpsCustodyTest.fixture():usdcData.clone();
                Arrays.fill(old,214,286,(byte)0);ByteBuffer b=ByteBuffer.wrap(old).order(ByteOrder.LITTLE_ENDIAN);
                b.putLong(222,10000000).putLong(278,NOW);if(sol)b.putLong(230,199720000).putLong(238,intent.sizeUsd.subtract(intent.collateralUsd).longValueExact());
                byte[] next=old.clone();ByteBuffer n=ByteBuffer.wrap(next).order(ByteOrder.LITTLE_ENDIAN);if(sol)n.putLong(222,9000000).putLong(230,0).putLong(238,0);
                before.put(custody.address,account(NativePerpsCustody.PROGRAM,old));after.put(custody.address,account(NativePerpsCustody.PROGRAM,next));
                before.put(custody.tokenAccount,vault(custody,10000000));after.put(custody.tokenAccount,vault(custody,sol?9000000:10000000));
            }
            ByteBuffer pool=ByteBuffer.allocate(320).order(ByteOrder.LITTLE_ENDIAN);
            pool.put(Arrays.copyOf(MessageDigest.getInstance("SHA-256").digest("account:Pool".getBytes(java.nio.charset.StandardCharsets.US_ASCII)),8));
            pool.putInt(4).put(new byte[]{'t','e','s','t'}).putInt(2).put(DevnetSolana.decode(market.address,32)).put(DevnetSolana.decode(usdc.address,32));
            before.put(NativePerpsCustody.POOL,account(NativePerpsCustody.PROGRAM,pool.array()));after.put(NativePerpsCustody.POOL,account(NativePerpsCustody.PROGRAM,pool.array()));
        }
        void check()throws Exception{NativePerpsCloseProtocolEffects.check(intent,market,market,usdc,before,after,BigInteger.valueOf(1000000));}
    }
    private static NativePerpsSimulation.Account account(String owner,byte[] data)throws Exception{return NativePerpsCloseOracleContextTest.account(owner,data);}
    private static NativePerpsSimulation.Account vault(NativePerpsCustody custody,long amount)throws Exception{
        ByteBuffer b=ByteBuffer.allocate(165).order(ByteOrder.LITTLE_ENDIAN);b.put(DevnetSolana.decode(custody.mint,32)).put(NativePerpsAddresses.transferAuthority()).putLong(amount).put(108,(byte)1);
        boolean sol="SOL".equals(custody.asset);if(sol)b.putInt(109,1).putLong(113,2039280);
        return NativePerpsCloseOracleContextTest.account(SplTokenAccount.PROGRAM,b.array(),2039280+(sol?amount:0));
    }
    @Test public void verifiesReserveReleaseVaultDebitAndUnchangedPoolConfiguration()throws Exception{new Fixture().check();}
    @Test public void rejectsWrongReserveVaultDebitAndCustodyFeeConfiguration()throws Exception{
        for(int offset:new int[]{230,222,175}){
            Fixture fixture=new Fixture();NativePerpsSimulation.Account old=fixture.after.get(fixture.market.address);byte[] data=old.data();data[offset]^=1;
            fixture.after.put(fixture.market.address,account(old.owner,data));assertThrows(Exception.class,fixture::check);
        }
    }
    @Test public void refusesPoolFeeChangesAndUnrelatedUsdcWithdrawal()throws Exception{
        Fixture pool=new Fixture();NativePerpsSimulation.Account old=pool.after.get(NativePerpsCustody.POOL);byte[] data=old.data();data[84+16]^=1;
        pool.after.put(NativePerpsCustody.POOL,account(old.owner,data));assertThrows(Exception.class,pool::check);
        Fixture usdc=new Fixture();usdc.after.put(usdc.usdc.tokenAccount,vault(usdc.usdc,9999999));assertThrows(Exception.class,usdc::check);
    }
}
