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
public class NativePerpsCloseOracleEffectsTest {
    private static final long NOW=1792279214;
    static Map<String,NativePerpsSimulation.Account> snapshot()throws Exception{
        Map<String,NativePerpsSimulation.Account> accounts=new LinkedHashMap<>(NativePerpsCloseOracleContextTest.fixture());
        String aggregate=NativePerpsCloseBindingsTest.custody().dovesAgOracle;NativePerpsSimulation.Account ag=accounts.get(aggregate);byte[] data=ag.data();
        ByteBuffer b=ByteBuffer.wrap(data).order(ByteOrder.LITTLE_ENDIAN);b.putLong(168,103000000).put(176,(byte)-6).putLong(177,NOW).putInt(185,30).putInt(189,60);
        accounts.put(aggregate,NativePerpsCloseOracleContextTest.account(ag.owner,data));
        String lazer=DevnetSolana.encode(NativePerpsTransactionTest.publicKey(9));NativePerpsSimulation.Account feed=accounts.get(lazer);byte[] f=feed.data();
        ByteBuffer.wrap(f).order(ByteOrder.LITTLE_ENDIAN).putLong(73,103000000).put(81,(byte)-6).putLong(82,NOW);
        accounts.put(lazer,NativePerpsCloseOracleContextTest.account(feed.owner,f));return accounts;
    }
    private static void check(Map<String,NativePerpsSimulation.Account> before,Map<String,NativePerpsSimulation.Account> after){
        NativePerpsTransaction transaction=NativePerpsCloseBindingsTest.transaction(true,-1,false,true);
        SolanaLookupTables.Resolved keys=SolanaLookupTables.resolve(transaction.message,Collections.emptyList(),BigInteger.ZERO);
        NativePerpsCustody custody=NativePerpsCloseBindingsTest.custody();NativePerpsCloseIntent intent=NativePerpsCloseBindingsTest.intent();
        NativePerpsCloseBindings binding=NativePerpsCloseBindings.check(transaction,keys,intent,custody,custody,NOW);
        NativePerpsCloseOracleEffects.check(transaction,keys,intent,custody,custody,binding,before,after,NOW);
    }
    @Test public void acceptsFreshUnchangedOracleStateWhenNoUpdateIsNeeded()throws Exception{Map<String,NativePerpsSimulation.Account> snapshot=snapshot();check(snapshot,new LinkedHashMap<>(snapshot));}
    @Test public void rejectsPriceLimitStalenessOrImmutableConfigurationChange()throws Exception{
        for(int mode=0;mode<3;mode++){
            Map<String,NativePerpsSimulation.Account> before=snapshot(),after=new LinkedHashMap<>(before);String address=NativePerpsCloseBindingsTest.custody().dovesAgOracle;
            NativePerpsSimulation.Account account=after.get(address);byte[] data=account.data();ByteBuffer b=ByteBuffer.wrap(data).order(ByteOrder.LITTLE_ENDIAN);
            if(mode==0)b.putLong(168,102999999);if(mode==1)b.putLong(177,NOW-31);if(mode==2)b.putInt(185,31);
            after.put(address,NativePerpsCloseOracleContextTest.account(account.owner,data));assertThrows(IllegalArgumentException.class,()->check(before,after));
        }
    }
    @Test public void rejectsUnsignedFeedMovementAndPythSignerConfigurationChange()throws Exception{
        for(String address:new String[]{DevnetSolana.encode(NativePerpsTransactionTest.publicKey(9)),NativePerpsCloseOracleData.STORAGE}){
            Map<String,NativePerpsSimulation.Account> before=snapshot(),after=new LinkedHashMap<>(before);NativePerpsSimulation.Account account=after.get(address);byte[] data=account.data();
            if(address.equals(NativePerpsCloseOracleData.STORAGE))data[81]^=1;else data[73]^=1;
            after.put(address,NativePerpsCloseOracleContextTest.account(account.owner,data));assertThrows(IllegalArgumentException.class,()->check(before,after));
        }
    }
}
