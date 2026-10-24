package com.jamddmaj.ai.wallet;

import java.math.BigInteger;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk=30)
public class NativePerpsCloseFundingTest {
    private static final long RENT=2039280,FEE=15000,PAYOUT=1000000;
    static final class Fixture {
        final NativePerpsCloseIntent intent=NativePerpsCloseBindingsTest.intent();
        final NativePerpsCustody collateral=NativePerpsCloseBindingsTest.custody();
        final NativePerpsCloseBindings binding;
        final Map<String,NativePerpsSimulation.Account> before=new LinkedHashMap<>(),after=new LinkedHashMap<>();
        Fixture(boolean unwrap,long existing)throws Exception{
            NativePerpsTransaction transaction=NativePerpsCloseBindingsTest.transaction(false,-1,false,true);
            binding=NativePerpsCloseBindings.check(transaction,SolanaLookupTables.resolve(transaction.message,Collections.emptyList(),BigInteger.ZERO),intent,collateral,collateral,1792279214);
            byte[] position=NativePerpsPositionTest.fixture();System.arraycopy(DevnetSolana.decode(intent.payer,32),0,position,8,32);
            position[209]=(byte)NativePerpsAddresses.positionDerivation(intent.payer,intent.asset,intent.side).bump;
            before.put(intent.positionAddress,account(NativePerpsCustody.PROGRAM,position,3000000));after.put(intent.positionAddress,null);
            before.put(intent.payer,account(NativePerpsFunding.SYSTEM,new byte[0],100000000));
            long oldRent=existing>=0?RENT:0;
            before.put(binding.collateralAccount,existing<0?null:token(intent.payer,existing));
            after.put(binding.collateralAccount,unwrap?null:token(intent.payer,Math.max(0,existing)+PAYOUT));
            long locked=!unwrap&&existing<0?RENT:0,refunded=unwrap?oldRent:0;
            after.put(intent.payer,account(NativePerpsFunding.SYSTEM,new byte[0],100000000+3000000-FEE-locked+refunded+(unwrap?PAYOUT:0)));
            String authority=DevnetSolana.encode(NativePerpsAddresses.transferAuthority());
            before.put(collateral.tokenAccount,token(authority,10000000));after.put(collateral.tokenAccount,token(authority,9000000));
            String usdc=DevnetSolana.encode(NativePerpsTokenBoundary.associated(DevnetSolana.decode(intent.payer,32),NativePerpsFunding.USDC));before.put(usdc,null);after.put(usdc,null);
        }
        NativePerpsCloseFunding check(){return NativePerpsCloseFunding.check(intent,collateral,binding,before,after,BigInteger.valueOf(FEE),BigInteger.valueOf(RENT));}
    }
    private static NativePerpsSimulation.Account account(String owner,byte[] data,long lamports)throws Exception{return NativePerpsCloseOracleContextTest.account(owner,data,lamports);}
    private static NativePerpsSimulation.Account token(String owner,long amount)throws Exception{
        ByteBuffer b=ByteBuffer.allocate(165).order(ByteOrder.LITTLE_ENDIAN);b.put(DevnetSolana.decode(NativePerpsFunding.SOL,32)).put(DevnetSolana.decode(owner,32)).putLong(amount);
        b.putInt(72,0);b.put(108,(byte)1);b.putInt(109,1);b.putLong(113,RENT);return account(SplTokenAccount.PROGRAM,b.array(),RENT+amount);
    }
    @Test public void reconcilesTokenPayoutNewRentAndPreexistingBalances()throws Exception{
        for(long existing:new long[]{-1,500000}){
            Fixture fixture=new Fixture(false,existing);NativePerpsCloseFunding result=fixture.check();assertEquals(BigInteger.valueOf(PAYOUT),result.receivedUnits);assertFalse(result.nativeSol);
            assertEquals(BigInteger.valueOf(existing<0?RENT:0),result.rentLocked);
        }
    }
    @Test public void reconcilesNativeSolPayoutWithoutSpendingPreexistingWrappedSol()throws Exception{
        for(long existing:new long[]{-1,0}){
            Fixture fixture=new Fixture(true,existing);NativePerpsCloseFunding result=fixture.check();assertTrue(result.nativeSol);assertEquals(BigInteger.valueOf(PAYOUT),result.receivedUnits);
        }
        Fixture nonempty=new Fixture(true,500000);assertThrows(IllegalArgumentException.class,nonempty::check);
    }
    @Test public void refusesPartialCloseInventedPayoutAndUnexplainedSolDebit()throws Exception{
        Fixture partial=new Fixture(false,-1);partial.after.put(partial.intent.positionAddress,partial.before.get(partial.intent.positionAddress));assertThrows(IllegalArgumentException.class,partial::check);
        Fixture wrongPayout=new Fixture(false,-1);wrongPayout.after.put(wrongPayout.binding.collateralAccount,token(wrongPayout.intent.payer,PAYOUT+1));assertThrows(IllegalArgumentException.class,wrongPayout::check);
        Fixture drain=new Fixture(false,-1);NativePerpsSimulation.Account owner=drain.after.get(drain.intent.payer);
        drain.after.put(drain.intent.payer,account(owner.owner,owner.data(),owner.lamports.longValueExact()-1));assertThrows(IllegalArgumentException.class,drain::check);
    }
    @Test public void refusesChangedAuthorityMetadataOrUnrelatedWalletToken()throws Exception{
        Fixture authority=new Fixture(false,-1);NativePerpsSimulation.Account output=authority.after.get(authority.binding.collateralAccount);byte[] changed=output.data();changed[32]^=1;
        authority.after.put(authority.binding.collateralAccount,account(output.owner,changed,output.lamports.longValueExact()));assertThrows(IllegalArgumentException.class,authority::check);
        Fixture unrelated=new Fixture(false,-1);String other=DevnetSolana.encode(NativePerpsTransactionTest.publicKey(7));
        unrelated.before.put(other,token(unrelated.intent.payer,1000));unrelated.after.put(other,token(unrelated.intent.payer,999));assertThrows(IllegalArgumentException.class,unrelated::check);
    }
}
