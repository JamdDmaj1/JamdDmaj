package com.jamddmaj.ai.wallet;

import java.lang.reflect.Constructor;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.Map;
import android.util.Base64;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk=30)
public class NativePerpsCloseOracleContextTest {
    static NativePerpsSimulation.Account account(String owner,byte[] data)throws Exception{
        return account(owner,data,2039280);
    }
    static NativePerpsSimulation.Account account(String owner,byte[] data,long lamports)throws Exception{
        Constructor<NativePerpsSimulation.Account> constructor=NativePerpsSimulation.Account.class.getDeclaredConstructor(JSONObject.class);constructor.setAccessible(true);
        return constructor.newInstance(new JSONObject().put("owner",owner).put("executable",false).put("lamports",lamports)
            .put("data",new JSONArray().put(Base64.encodeToString(data,Base64.NO_WRAP)).put("base64")));
    }
    static Map<String,NativePerpsSimulation.Account> fixture()throws Exception{
        NativePerpsCustody market=NativePerpsCloseBindingsTest.custody();Map<String,NativePerpsSimulation.Account> result=new LinkedHashMap<>();
        byte[] ag=new byte[266];System.arraycopy(new byte[]{112,(byte)249,(byte)139,(byte)217,(byte)215,(byte)208,(byte)249,54},0,ag,0,8);
        System.arraycopy(DevnetSolana.decode(market.mint,32),0,ag,8,32);
        SolanaProgramAddress.Derived pda=SolanaProgramAddress.find(NativePerpsCloseOracleContext.DOVES,Arrays.asList("ag_feed".getBytes(java.nio.charset.StandardCharsets.US_ASCII),DevnetSolana.decode(market.mint,32)));
        ag[201]=(byte)pda.bump;byte[] lazer=NativePerpsTransactionTest.publicKey(9);System.arraycopy(lazer,0,ag,202,32);
        result.put(market.dovesAgOracle,account(NativePerpsCloseOracleContext.DOVES,ag));
        byte[] feed=new byte[96];System.arraycopy(new byte[]{(byte)189,103,(byte)252,23,(byte)152,35,(byte)243,(byte)156},0,feed,0,8);feed[91]=1;
        result.put(DevnetSolana.encode(lazer),account(NativePerpsCloseOracleContext.DOVES,feed));
        result.put(NativePerpsCloseOracleData.STORAGE,account(NativePerpsCloseOracleData.PYTH,NativePerpsCloseOracleDataTest.storage()));
        result.put(NativePerpsCloseOracleData.TREASURY,account(NativePerpsFunding.SYSTEM,new byte[0]));return result;
    }
    @Test public void bindsProgramOwnedConfigurationToMarketMintAndDerivedAggregate()throws Exception{
        NativePerpsCustody market=NativePerpsCloseBindingsTest.custody();Map<String,NativePerpsSimulation.Account> fixture=fixture();
        NativePerpsCloseOracleContext context=NativePerpsCloseOracleContext.decode(market,market,fixture);
        assertEquals(1,context.feeds.size());assertEquals(1,context.lazerFeeds.size());assertEquals(1,context.feeds.get(market.dovesAgOracle).id);
        assertEquals(3,NativePerpsCloseOracleContext.extraKeys(market,market,fixture).size());
        assertThrows(UnsupportedOperationException.class,()->context.feeds.clear());
    }
    @Test public void refusesWrongOwnerChangedMintMissingPythStorageOrTreasury()throws Exception{
        NativePerpsCustody market=NativePerpsCloseBindingsTest.custody();
        for(String address:new String[]{market.dovesAgOracle,NativePerpsCloseOracleData.STORAGE,NativePerpsCloseOracleData.TREASURY}){
            Map<String,NativePerpsSimulation.Account> fixture=fixture();fixture.remove(address);
            assertThrows(IllegalArgumentException.class,()->NativePerpsCloseOracleContext.decode(market,market,fixture));
        }
        Map<String,NativePerpsSimulation.Account> fixture=fixture();byte[] ag=fixture.get(market.dovesAgOracle).data();ag[8]^=1;
        fixture.put(market.dovesAgOracle,account(NativePerpsCloseOracleContext.DOVES,ag));
        assertThrows(IllegalArgumentException.class,()->NativePerpsCloseOracleContext.decode(market,market,fixture));
    }
}
