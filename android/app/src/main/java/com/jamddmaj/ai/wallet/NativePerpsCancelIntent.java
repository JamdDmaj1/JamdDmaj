package com.jamddmaj.ai.wallet;

import java.math.BigInteger;
import java.util.Arrays;

/** Independently decoded, still-pending USDC TP/SL. Not signing authority. */
final class NativePerpsCancelIntent {
    final String payer,asset,positionAddress,requestAddress,ownerAta,requestAta;
    final int side;final BigInteger sizeUsd,triggerPrice,counter;
    final boolean takeProfit,entirePosition;
    private final byte[] state;
    private NativePerpsCancelIntent(String payer,String asset,int side,String request,byte[] data){
        this.payer=payer;this.asset=asset;this.side=side;requestAddress=request;state=data.clone();
        positionAddress=DevnetSolana.encode(NativePerpsAddresses.position(payer,asset,side));
        ownerAta=DevnetSolana.encode(NativePerpsTokenBoundary.associated(DevnetSolana.decode(payer,32),NativePerpsFunding.USDC));
        requestAta=DevnetSolana.encode(NativePerpsTokenBoundary.associated(DevnetSolana.decode(request,32),NativePerpsFunding.USDC));
        sizeUsd=number(data,184);triggerPrice=number(data,207);counter=number(data,220);
        takeProfit=(data[216]==1)==(side==1);entirePosition=data[218]==1;
    }
    static NativePerpsCancelIntent decode(String payer,String asset,int side,String request,NativePerpsSimulation.Account account){
        if(account==null||account.executable||!NativePerpsCustody.PROGRAM.equals(account.owner))throw invalid();
        byte[] data=account.data();String position=DevnetSolana.encode(NativePerpsAddresses.position(payer,asset,side));
        if(data.length<230||data.length>4096||!Arrays.equals(Arrays.copyOf(data,8),new byte[]{12,38,(byte)250,(byte)199,46,(byte)154,32,(byte)216})
                ||!key(data,8,payer)||!key(data,40,NativePerpsCustody.POOL)||!key(data,72,NativePerpsCustody.address(asset))
                ||!key(data,104,position)||!key(data,136,NativePerpsFunding.USDC)||number(data,168).signum()<=0||number(data,168).bitLength()>63
                ||number(data,176).bitLength()>63||number(data,176).compareTo(number(data,168))<0||number(data,184).signum()<=0
                ||number(data,192).signum()!=0||data[200]!=2||data[201]!=1||data[202]!=side||data[203]!=0||data[204]!=0||data[205]!=0
                ||data[206]!=1||number(data,207).signum()<=0||data[215]!=1||(data[216]!=0&&data[216]!=1)||data[217]!=1||(data[218]!=0&&data[218]!=1)
                ||data[219]!=0||data[229]!=0)throw invalid();
        SolanaProgramAddress.Derived derived=NativePerpsAddresses.exitDerivation(DevnetSolana.decode(position,32),number(data,220));
        if(!derived.address().equals(request)||derived.bump!=(data[228]&255))throw invalid();for(int i=230;i<data.length;i++)if(data[i]!=0)throw invalid();
        return new NativePerpsCancelIntent(payer,asset,side,request,data);
    }
    void requireState(NativePerpsSimulation.Account account){
        if(account==null||account.executable||!NativePerpsCustody.PROGRAM.equals(account.owner)||!Arrays.equals(state,account.data()))throw invalid();
    }
    void requireClosedPosition(NativePerpsSimulation.Account account){
        if(account==null)return;
        if(NativePerpsFunding.SYSTEM.equals(account.owner)&&!account.executable&&account.lamports.signum()==0&&account.data().length==0)return;
        NativePerpsPosition position=NativePerpsPosition.decode(positionAddress,account.owner,account.executable,account.data(),payer,asset,side);
        if(position.sizeUsd.signum()!=0||position.collateralUsd.signum()!=0||position.lockedTokens.signum()!=0)throw invalid();
    }
    private static boolean key(byte[] data,int offset,String expected){return Arrays.equals(Arrays.copyOfRange(data,offset,offset+32),DevnetSolana.decode(expected,32));}
    private static BigInteger number(byte[] data,int at){byte[] big=new byte[8];for(int i=0;i<8;i++)big[i]=data[at+7-i];return new BigInteger(1,big);}
    private static IllegalArgumentException invalid(){return new IllegalArgumentException("TP/SL is not a verified pending request of this closed position");}
}
