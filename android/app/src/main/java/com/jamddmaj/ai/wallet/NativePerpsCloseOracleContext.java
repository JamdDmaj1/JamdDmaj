package com.jamddmaj.ai.wallet;

import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;

/** Decodes independently read native oracle configuration, not builder JSON.
 * Read freshness, unchanged simulation state and payload checks are separate. */
final class NativePerpsCloseOracleContext {
    static final String DOVES="DoVEsk76QybCEHQGzkvYPWLQu9gzNoZZZt3TPiL597e";
    static final class Feed {
        final String aggregate,lazer,chainlink,redstone;
        final long id;final int channel;
        private Feed(String aggregate,byte[] ag,byte[] lazerData){
            this.aggregate=aggregate;lazer=key(ag,202);chainlink=key(ag,72);redstone=key(ag,234);
            id=((long)(lazerData[91]&255))|((long)(lazerData[92]&255)<<8)|((long)(lazerData[93]&255)<<16)|((long)(lazerData[94]&255)<<24);channel=lazerData[95]&255;
            if(id==0)throw invalid();
        }
    }
    final Map<String,Feed> feeds;
    final Set<String> lazerFeeds;
    final NativePerpsCloseOracleData.Storage storage;
    private NativePerpsCloseOracleContext(Map<String,Feed> feeds,NativePerpsCloseOracleData.Storage storage){
        this.feeds=Collections.unmodifiableMap(new LinkedHashMap<>(feeds));this.storage=storage;
        Set<String> lazer=new LinkedHashSet<>();for(Feed feed:feeds.values())lazer.add(feed.lazer);lazerFeeds=Collections.unmodifiableSet(lazer);
    }
    static Set<String> aggregateKeys(NativePerpsCustody market,NativePerpsCustody collateral){
        if(market==null||collateral==null)throw invalid();return Collections.unmodifiableSet(new LinkedHashSet<>(Arrays.asList(market.dovesAgOracle,collateral.dovesAgOracle)));
    }
    static Set<String> extraKeys(NativePerpsCustody market,NativePerpsCustody collateral,Map<String,NativePerpsSimulation.Account> accounts){
        Set<String> result=new LinkedHashSet<>();
        for(NativePerpsCustody custody:new NativePerpsCustody[]{market,collateral}){
            byte[] aggregate=aggregate(custody,accounts.get(custody.dovesAgOracle));String lazer=key(aggregate,202);
            if(NativePerpsFunding.SYSTEM.equals(lazer))throw invalid();result.add(lazer);
        }
        if(result.contains(NativePerpsCloseOracleData.STORAGE)||result.contains(NativePerpsCloseOracleData.TREASURY))throw invalid();
        result.add(NativePerpsCloseOracleData.STORAGE);result.add(NativePerpsCloseOracleData.TREASURY);return Collections.unmodifiableSet(result);
    }
    static NativePerpsCloseOracleContext decode(NativePerpsCustody market,NativePerpsCustody collateral,Map<String,NativePerpsSimulation.Account> accounts){
        if(accounts==null)throw invalid();Map<String,Feed> feeds=new LinkedHashMap<>();
        for(NativePerpsCustody custody:new NativePerpsCustody[]{market,collateral}){
            byte[] ag=aggregate(custody,accounts.get(custody.dovesAgOracle));String lazer=key(ag,202);
            NativePerpsSimulation.Account account=accounts.get(lazer);byte[] data=bytes(account,DOVES,96);
            if(!Arrays.equals(Arrays.copyOf(data,8),new byte[]{(byte)189,103,(byte)252,23,(byte)152,35,(byte)243,(byte)156}))throw invalid();
            feeds.put(custody.dovesAgOracle,new Feed(custody.dovesAgOracle,ag,data));
        }
        NativePerpsSimulation.Account account=accounts.get(NativePerpsCloseOracleData.STORAGE);
        if(account==null)throw invalid();NativePerpsCloseOracleData.Storage storage=NativePerpsCloseOracleData.storage(NativePerpsCloseOracleData.STORAGE,account.owner,account.executable,account.data());
        NativePerpsSimulation.Account treasury=accounts.get(NativePerpsCloseOracleData.TREASURY);
        if(treasury==null||treasury.executable||!NativePerpsFunding.SYSTEM.equals(treasury.owner)||treasury.data().length!=0)throw invalid();
        return new NativePerpsCloseOracleContext(feeds,storage);
    }
    private static byte[] aggregate(NativePerpsCustody custody,NativePerpsSimulation.Account account){
        if(custody==null)throw invalid();byte[] data=bytes(account,DOVES,266);
        SolanaProgramAddress.Derived pda=SolanaProgramAddress.find(DOVES,Arrays.asList("ag_feed".getBytes(StandardCharsets.US_ASCII),DevnetSolana.decode(custody.mint,32)));
        if(!pda.address().equals(custody.dovesAgOracle)||(data[201]&255)!=pda.bump||!custody.mint.equals(key(data,8))
                ||!Arrays.equals(Arrays.copyOf(data,8),new byte[]{112,(byte)249,(byte)139,(byte)217,(byte)215,(byte)208,(byte)249,54}))throw invalid();return data;
    }
    private static byte[] bytes(NativePerpsSimulation.Account account,String owner,int min){
        if(account==null||account.executable||!owner.equals(account.owner))throw invalid();byte[] data=account.data();if(data.length<min||data.length>4096)throw invalid();return data;
    }
    private static String key(byte[] data,int offset){return DevnetSolana.encode(Arrays.copyOfRange(data,offset,offset+32));}
    private static IllegalArgumentException invalid(){return new IllegalArgumentException("Native close oracle configuration is not independently verified");}
}
