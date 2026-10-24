package com.jamddmaj.ai.wallet;

import java.math.BigInteger;
import java.nio.ByteBuffer;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

/** Pinned pool/custody configuration, reserve release and vault conservation.
 * Not a minimum-return approval, journal or authorization to sign. */
final class NativePerpsCloseProtocolEffects {
    static void check(NativePerpsCloseIntent intent,NativePerpsCustody market,NativePerpsCustody collateral,NativePerpsCustody usdc,
            Map<String,NativePerpsSimulation.Account> before,Map<String,NativePerpsSimulation.Account> after,BigInteger received)throws Exception{
        if(intent==null||market==null||collateral==null||usdc==null||before==null||after==null||received==null||received.signum()<0
                ||!market.asset.equals(intent.asset)||!collateral.asset.equals(intent.receiveToken)||!"USDC".equals(usdc.asset))throw invalid();
        pool(before.get(NativePerpsCustody.POOL),after.get(NativePerpsCustody.POOL),new HashSet<>(Arrays.asList(market.address,collateral.address,usdc.address)));
        NativePerpsSimulation.Account positionAccount=before.get(intent.positionAddress);if(positionAccount==null)throw invalid();
        NativePerpsPosition position=NativePerpsPosition.decode(intent.positionAddress,positionAccount.owner,positionAccount.executable,positionAccount.data(),intent.payer,intent.asset,intent.side);
        if(position.lockedTokens.signum()<=0||!position.sizeUsd.equals(intent.sizeUsd)||!position.collateralUsd.equals(intent.collateralUsd)
                ||intent.side==1&&position.collateralUsd.compareTo(position.sizeUsd)>0)throw invalid();
        Map<String,NativePerpsCustody> unique=new LinkedHashMap<>();for(NativePerpsCustody c:new NativePerpsCustody[]{market,collateral,usdc})unique.put(c.address,c);
        String authority=DevnetSolana.encode(NativePerpsAddresses.transferAuthority());
        for(NativePerpsCustody c:unique.values()){
            NativePerpsSimulation.Account a=before.get(c.address),b=after.get(c.address);byte[] old=program(a,286),next=program(b,286);
            NativePerpsCustody prior=NativePerpsCustody.decode(c.asset,c.address,a.owner,a.executable,old),following=NativePerpsCustody.decode(c.asset,c.address,b.owner,b.executable,next);
            if(!sameCustody(c,prior)||!sameCustody(prior,following)||!a.lamports.equals(b.lamports)||old.length!=next.length
                    ||!region(old,next,0,214)||!region(old,next,286,old.length))throw invalid();
            BigInteger expectedDebit=c.address.equals(collateral.address)?received:BigInteger.ZERO;
            NativePerpsSimulation.Account av=before.get(c.tokenAccount),bv=after.get(c.tokenAccount);
            SplTokenAccount oldVault=token(av,authority,c.mint),newVault=token(bv,authority,c.mint);
            BigInteger actual=oldVault.amount.subtract(newVault.amount);if(!expectedDebit.equals(actual))throw invalid();
            byte[] ad=av.data(),bd=bv.data();Arrays.fill(ad,64,72,(byte)0);Arrays.fill(bd,64,72,(byte)0);
            if(!Arrays.equals(ad,bd)||!av.lamports.subtract(bv.lamports).equals("SOL".equals(c.asset)?actual:BigInteger.ZERO))throw invalid();
            if(!number(old,214).add(number(old,222)).subtract(number(next,214).add(number(next,222))).equals(actual))throw invalid();
            boolean isCollateral=c.address.equals(collateral.address),isMarket=c.address.equals(market.address);
            if(!number(old,230).subtract(number(next,230)).equals(isCollateral?position.lockedTokens:BigInteger.ZERO)
                    ||!number(old,246).subtract(number(next,246)).equals(isMarket&&intent.side==2?position.sizeUsd:BigInteger.ZERO)
                    ||!number(old,238).subtract(number(next,238)).equals(isMarket&&intent.side==1?position.sizeUsd.subtract(position.collateralUsd):BigInteger.ZERO)
                    ||(intent.side==1||!isMarket)&&!number(old,254).equals(number(next,254)))throw invalid();
            BigInteger oldInterest=number(old,262).add(number(old,270).shiftLeft(64)),nextInterest=number(next,262).add(number(next,270).shiftLeft(64));
            if(nextInterest.compareTo(oldInterest)<0||number(old,278).bitLength()>63||number(next,278).bitLength()>63
                    ||number(next,278).compareTo(number(old,278))<0||isCollateral&&oldInterest.compareTo(position.cumulativeInterestSnapshot)<0)throw invalid();
        }
    }
    private static void pool(NativePerpsSimulation.Account a,NativePerpsSimulation.Account b,Set<String> required)throws Exception{
        byte[] old=program(a,16),next=program(b,16);int offset=poolOffset(old,required),newOffset=poolOffset(next,required);
        if(offset!=newOffset||old.length!=next.length||!a.lamports.equals(b.lamports)||number(next,offset+144).compareTo(number(old,offset+144))<0
                ||number(next,offset+203).compareTo(number(old,offset+203))<0||number(next,offset+228).compareTo(number(old,offset+228))<0)throw invalid();
        for(int[] mutable:new int[][]{{offset,16},{offset+144,8},{offset+203,8},{offset+228,8}}){Arrays.fill(old,mutable[0],mutable[0]+mutable[1],(byte)0);Arrays.fill(next,mutable[0],mutable[0]+mutable[1],(byte)0);}
        if(!Arrays.equals(old,next))throw invalid();
    }
    private static int poolOffset(byte[] data,Set<String> required)throws Exception{
        byte[] tag=Arrays.copyOf(MessageDigest.getInstance("SHA-256").digest("account:Pool".getBytes(StandardCharsets.US_ASCII)),8);
        if(data.length>8192||!Arrays.equals(tag,Arrays.copyOf(data,8)))throw invalid();long nameLength=u32(data,8);
        if(nameLength<1||nameLength>64||data.length<16+nameLength)throw invalid();int length=(int)nameLength;
        byte[] name=Arrays.copyOfRange(data,12,12+length);for(byte value:name)if(value==0)throw invalid();
        StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(name));
        long count=u32(data,12+length);if(count<1||count>16)throw invalid();int start=16+length,offset=start+(int)count*32;
        if(data.length<offset+236||(data[offset+219]&255)>1||number(data,offset+128).bitLength()>63||number(data,offset+203).bitLength()>63)throw invalid();
        Set<String> custodies=new HashSet<>();for(int i=0;i<count;i++)if(!custodies.add(DevnetSolana.encode(Arrays.copyOfRange(data,start+32*i,start+32*(i+1)))))throw invalid();
        if(!custodies.containsAll(required))throw invalid();return offset;
    }
    private static SplTokenAccount token(NativePerpsSimulation.Account account,String owner,String mint){
        if(account==null)throw invalid();SplTokenAccount token=SplTokenAccount.decode(account.owner,account.executable,account.data());byte[] close=token.closeAuthority(),ownerKey=DevnetSolana.decode(owner,32);
        if(!Arrays.equals(token.owner(),ownerKey)||!Arrays.equals(token.mint(),DevnetSolana.decode(mint,32))||token.frozen||token.hasDelegate()||token.delegatedAmount.signum()!=0
                ||close!=null&&!Arrays.equals(close,ownerKey))throw invalid();
        boolean sol=NativePerpsFunding.SOL.equals(mint);if(sol!=(token.nativeReserve!=null)||sol&&account.lamports.compareTo(token.nativeReserve.add(token.amount))<0)throw invalid();return token;
    }
    private static boolean sameCustody(NativePerpsCustody a,NativePerpsCustody b){return a.asset.equals(b.asset)&&a.address.equals(b.address)&&a.mint.equals(b.mint)&&a.tokenAccount.equals(b.tokenAccount)
        &&a.oracle.equals(b.oracle)&&a.dovesAgOracle.equals(b.dovesAgOracle)&&a.decimals==b.decimals&&a.stable==b.stable&&a.allowDecrease==b.allowDecrease&&a.allowIncrease==b.allowIncrease&&a.allowSwap==b.allowSwap&&a.maxLeverageBps.equals(b.maxLeverageBps);}
    private static byte[] program(NativePerpsSimulation.Account account,int min){if(account==null||account.executable||!NativePerpsCustody.PROGRAM.equals(account.owner))throw invalid();byte[] data=account.data();if(data.length<min||data.length>8192)throw invalid();return data;}
    private static boolean region(byte[] a,byte[] b,int start,int end){return Arrays.equals(Arrays.copyOfRange(a,start,end),Arrays.copyOfRange(b,start,end));}
    private static long u32(byte[] data,int at){if(at<0||at>data.length-4)throw invalid();long value=0;for(int i=0;i<4;i++)value|=(long)(data[at+i]&255)<<(8*i);return value;}
    private static BigInteger number(byte[] data,int at){if(at<0||at>data.length-8)throw invalid();byte[] big=new byte[8];for(int i=0;i<8;i++)big[i]=data[at+7-i];return new BigInteger(1,big);}
    private static IllegalArgumentException invalid(){return new IllegalArgumentException("Native close protocol reserves or immutable configuration changed unexpectedly");}
}
