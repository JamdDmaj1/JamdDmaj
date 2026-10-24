package com.jamddmaj.ai.wallet;

import java.math.BigInteger;
import java.util.Arrays;
import java.util.HashMap;
import java.util.Map;

/** Same-bank oracle configuration and price effects, not signing authority. */
final class NativePerpsCloseOracleEffects {
    private static final BigInteger MILLION=BigInteger.valueOf(1000000);
    static void check(NativePerpsTransaction transaction,SolanaLookupTables.Resolved keys,NativePerpsCloseIntent intent,
            NativePerpsCustody market,NativePerpsCustody collateral,NativePerpsCloseBindings binding,
            Map<String,NativePerpsSimulation.Account> before,Map<String,NativePerpsSimulation.Account> after,long now){
        NativePerpsCloseOracleContext context=NativePerpsCloseOracleContext.decode(market,collateral,before);
        NativePerpsCloseOracleContext.decode(market,collateral,after);
        NativePerpsSimulation.Account storage=before.get(NativePerpsCloseOracleData.STORAGE),nextStorage=after.get(NativePerpsCloseOracleData.STORAGE);
        if(!same(storage,nextStorage))throw invalid();Map<String,NativePerpsCloseOracleData.Observation> signed=new HashMap<>();
        for(int index=0;index<transaction.message.instructions.size();index++){
            SolanaMessage.Instruction ix=transaction.message.instructions.get(index);byte[] data=ix.data();
            if(!NativePerpsCloseOracleContext.DOVES.equals(DevnetSolana.encode(keys.key(ix.program)))||data.length<8
                    ||!Arrays.equals(Arrays.copyOf(data,8),new byte[]{(byte)203,59,95,(byte)176,(byte)236,21,73,(byte)153}))continue;
            byte[] roles=ix.accounts();Map<Long,Integer> expected=new HashMap<>();
            for(int role=6;role<roles.length;role++){
                String address=DevnetSolana.encode(keys.key(roles[role]&255));
                for(NativePerpsCloseOracleContext.Feed feed:context.feeds.values())if(feed.lazer.equals(address))expected.put(feed.id,feed.channel);
            }
            Map<Long,NativePerpsCloseOracleData.Observation> observations=NativePerpsCloseOracleData.checkUpdate(transaction.message,keys,index,context.storage,expected,now);
            for(NativePerpsCloseOracleContext.Feed feed:context.feeds.values())if(expected.containsKey(feed.id)){
                if(signed.put(feed.lazer,observations.get(feed.id))!=null)throw invalid();
            }
        }
        for(NativePerpsCloseOracleContext.Feed feed:context.feeds.values()){
            NativePerpsSimulation.Account old=before.get(feed.aggregate),next=after.get(feed.aggregate);
            byte[] a=bytes(old),b=bytes(next);sameConfiguration(old,next,168,17);
            if(number(b,177).compareTo(number(a,177))<0)throw invalid();fresh(b,168,Math.min(30,maxAge(b,185)),now);
            if(feed.aggregate.equals(market.dovesAgOracle)){
                BigInteger[] range=microPrice(b,168);
                if(intent.side==1?range[0].compareTo(binding.core.price)<0:range[1].compareTo(binding.core.price)>0)throw invalid();
            }
            NativePerpsSimulation.Account oldLazer=before.get(feed.lazer),nextLazer=after.get(feed.lazer);
            byte[] l0=bytes(oldLazer),l1=bytes(nextLazer);
            if(l0.length!=l1.length||!(l0.length==96||l0.length==283)||!oldLazer.lamports.equals(nextLazer.lamports)
                    ||!region(l0,l1,0,73)||!region(l0,l1,90,96)||!region(l0,l1,112,l0.length))throw invalid();
            if(number(l1,82).compareTo(number(l0,82))<0)throw invalid();fresh(l1,73,Math.min(60,maxAge(b,189)),now);
            NativePerpsCloseOracleData.Observation observation=signed.get(feed.lazer);
            boolean changed=!region(l0,l1,73,90)||!region(l0,l1,96,Math.min(112,l0.length));
            if(changed&&(observation==null||!number(l1,73).equals(observation.price)||l1[81]!=observation.exponent
                    ||!number(l1,82).equals(observation.published.divide(MILLION))
                    ||observation.updated!=null&&!number(l1,82).equals(observation.updated.divide(MILLION))))throw invalid();
            if(l0.length==283){
                BigInteger oldMicros=number(l0,96),micros=number(l1,96),confidence=number(l1,104);
                if(oldMicros.signum()>0&&(micros.signum()==0||micros.compareTo(oldMicros)<0))throw invalid();
                if(micros.signum()==0&&confidence.signum()!=0||micros.signum()>0&&(!micros.divide(MILLION).equals(number(l1,82))||confidence.compareTo(BigInteger.valueOf(10000))>0))throw invalid();
                if(changed&&micros.signum()>0&&(observation==null||!micros.equals(observation.published)||observation.updated!=null&&!micros.equals(observation.updated)
                        ||observation.confidence==null||!confidence.equals(observation.confidence.multiply(BigInteger.valueOf(10000)).divide(observation.price))))throw invalid();
            }
        }
    }
    private static void sameConfiguration(NativePerpsSimulation.Account old,NativePerpsSimulation.Account next,int offset,int length){
        byte[] a=bytes(old),b=bytes(next);if(a.length!=b.length||a.length<offset+length||!old.lamports.equals(next.lamports)
                ||!region(a,b,0,offset)||!region(a,b,offset+length,a.length))throw invalid();
    }
    private static byte[] bytes(NativePerpsSimulation.Account account){if(account==null||account.executable||!NativePerpsCloseOracleContext.DOVES.equals(account.owner))throw invalid();return account.data();}
    private static boolean region(byte[] a,byte[] b,int start,int end){if(start>=end)return true;return Arrays.equals(Arrays.copyOfRange(a,start,end),Arrays.copyOfRange(b,start,end));}
    private static int maxAge(byte[] data,int at){long age=0;for(int i=0;i<4;i++)age|=(long)(data[at+i]&255)<<(8*i);if(age<1||age>3600)throw invalid();return (int)age;}
    private static BigInteger[] microPrice(byte[] data,int at){
        BigInteger raw=number(data,at);int expo=data[at+8];if(raw.signum()<=0||expo< -18||expo>0)throw invalid();
        int shift=6+expo;BigInteger numerator=shift>=0?raw.multiply(BigInteger.TEN.pow(shift)):raw,denominator=shift<0?BigInteger.TEN.pow(-shift):BigInteger.ONE;
        return new BigInteger[]{numerator.divide(denominator),numerator.add(denominator).subtract(BigInteger.ONE).divide(denominator)};
    }
    private static void fresh(byte[] data,int at,int maximum,long now){
        microPrice(data,at);BigInteger timestamp=number(data,at+9);
        if(timestamp.bitLength()>63||timestamp.compareTo(BigInteger.valueOf(now-maximum))<0||timestamp.compareTo(BigInteger.valueOf(now+2))>0)throw invalid();
    }
    private static BigInteger number(byte[] data,int at){if(at<0||at>data.length-8)throw invalid();byte[] big=new byte[8];for(int i=0;i<8;i++)big[i]=data[at+7-i];return new BigInteger(1,big);}
    private static boolean same(NativePerpsSimulation.Account a,NativePerpsSimulation.Account b){return a!=null&&b!=null&&a.owner.equals(b.owner)&&a.executable==b.executable&&a.lamports.equals(b.lamports)&&Arrays.equals(a.data(),b.data());}
    private static IllegalArgumentException invalid(){return new IllegalArgumentException("Native close oracle effects differ from authenticated prices or configuration");}
}
