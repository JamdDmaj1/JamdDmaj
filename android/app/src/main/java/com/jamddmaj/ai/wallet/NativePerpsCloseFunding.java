package com.jamddmaj.ai.wallet;

import java.math.BigInteger;
import java.util.Arrays;
import java.util.Map;

/** Wallet/vault payout and rent conservation only. Not oracle or pool economics,
 * transaction policy, same-bank provenance, signing review or authorization. */
final class NativePerpsCloseFunding {
    final BigInteger receivedUnits,networkFee,rentLocked,rentRefunded;
    final boolean nativeSol;
    private NativePerpsCloseFunding(BigInteger received,BigInteger fee,BigInteger locked,BigInteger refunded,boolean nativeSol){
        receivedUnits=received;networkFee=fee;rentLocked=locked;rentRefunded=refunded;this.nativeSol=nativeSol;
    }
    static NativePerpsCloseFunding check(NativePerpsCloseIntent intent,NativePerpsCustody collateral,
            NativePerpsCloseBindings binding,Map<String,NativePerpsSimulation.Account> before,
            Map<String,NativePerpsSimulation.Account> after,BigInteger fee,BigInteger tokenRent){
        if(intent==null||collateral==null||binding==null||before==null||after==null||!before.keySet().equals(after.keySet())
                ||fee==null||fee.signum()<=0||fee.compareTo(BigInteger.valueOf(1000000))>0||tokenRent==null||tokenRent.signum()<=0
                ||tokenRent.compareTo(BigInteger.valueOf(10000000))>0||!collateral.asset.equals(intent.receiveToken))throw invalid();
        String owner=intent.payer,position=intent.positionAddress,recipient=binding.collateralAccount;
        String usdc=DevnetSolana.encode(NativePerpsTokenBoundary.associated(DevnetSolana.decode(owner,32),NativePerpsFunding.USDC));
        for(String address:new String[]{owner,position,recipient,usdc,collateral.tokenAccount})if(!before.containsKey(address))throw invalid();
        BigInteger oldSol=system(before.get(owner)),nextSol=system(after.get(owner));if(oldSol.compareTo(fee)<0)throw invalid();
        NativePerpsSimulation.Account priorPosition=before.get(position),nextPosition=after.get(position);
        if(priorPosition==null)throw invalid();
        NativePerpsPosition observed=NativePerpsPosition.decode(position,priorPosition.owner,priorPosition.executable,priorPosition.data(),owner,intent.asset,intent.side);
        if(!observed.sizeUsd.equals(intent.sizeUsd)||!observed.collateralUsd.equals(intent.collateralUsd))throw invalid();
        BigInteger refunded=BigInteger.ZERO,locked=BigInteger.ZERO;
        if(closed(nextPosition))refunded=priorPosition.lamports;
        else{
            NativePerpsPosition next=NativePerpsPosition.decode(position,nextPosition.owner,nextPosition.executable,nextPosition.data(),owner,intent.asset,intent.side);
            byte[] data=nextPosition.data();
            if(next.sizeUsd.signum()!=0||next.collateralUsd.signum()!=0||number(data,177).signum()!=0||number(data,201).signum()!=0
                    ||next.updateTime<observed.updateTime||!priorPosition.lamports.equals(nextPosition.lamports))throw invalid();
        }
        String authority=DevnetSolana.encode(NativePerpsAddresses.transferAuthority());
        NativePerpsSimulation.Account oldVault=before.get(collateral.tokenAccount),nextVault=after.get(collateral.tokenAccount);
        BigInteger received=token(oldVault,authority,collateral.mint).amount.subtract(token(nextVault,authority,collateral.mint).amount);
        if(received.signum()<0)throw invalid();
        sameTokenMetadata(oldVault,nextVault,"SOL".equals(collateral.asset)?received.negate():BigInteger.ZERO);
        NativePerpsSimulation.Account prior=before.get(recipient),next=after.get(recipient);
        BigInteger oldAmount=vacant(prior)?BigInteger.ZERO:token(prior,owner,collateral.mint).amount;
        boolean nativeSol=closed(next)&&intent.side==1&&"SOL".equals(intent.asset);
        if(closed(next)){
            if(!nativeSol||oldAmount.signum()!=0)throw invalid();refunded=refunded.add(lamports(prior));
        }else{
            SplTokenAccount output=token(next,owner,collateral.mint);
            if(!output.amount.equals(oldAmount.add(received)))throw invalid();
            BigInteger nativeIncrement="SOL".equals(collateral.asset)?received:BigInteger.ZERO;
            if(vacant(prior))locked=locked.add(createdToken(prior,next,owner,collateral.mint,tokenRent,nativeIncrement));
            else sameTokenMetadata(prior,next,nativeIncrement);
        }
        if(!usdc.equals(recipient)&&!same(before.get(usdc),after.get(usdc)))throw invalid();
        if(binding.requestAddress!=null){
            if(!before.containsKey(binding.requestAddress)||!before.containsKey(binding.requestAccount)
                    ||!closed(before.get(binding.requestAddress))||!closed(before.get(binding.requestAccount))||!closed(after.get(binding.requestAddress)))throw invalid();
            NativePerpsSimulation.Account requestToken=after.get(binding.requestAccount);
            if(!closed(requestToken)){
                if(token(requestToken,binding.requestAddress,collateral.mint).amount.signum()!=0)throw invalid();
                locked=locked.add(createdToken(before.get(binding.requestAccount),requestToken,binding.requestAddress,collateral.mint,tokenRent,BigInteger.ZERO));
            }
        }
        for(String address:before.keySet()){
            if(address.equals(recipient))continue;
            if((controlled(before.get(address),owner)||controlled(after.get(address),owner))&&!same(before.get(address),after.get(address)))throw invalid();
        }
        BigInteger nativePayout=nativeSol?received:BigInteger.ZERO;
        if(locked.compareTo(BigInteger.valueOf(30000000))>0||!oldSol.add(refunded).add(nativePayout).subtract(fee).subtract(locked).equals(nextSol))throw invalid();
        return new NativePerpsCloseFunding(received,fee,locked,refunded,nativeSol);
    }
    private static BigInteger createdToken(NativePerpsSimulation.Account old,NativePerpsSimulation.Account next,String owner,String mint,BigInteger rent,BigInteger nativeIncrement){
        if(!vacant(old))throw invalid();SplTokenAccount token=token(next,owner,mint);
        BigInteger prior=lamports(old),required=prior.max(rent);
        if("So11111111111111111111111111111111111111112".equals(mint)&&!rent.equals(token.nativeReserve)
                ||!next.lamports.equals(required.add(nativeIncrement)))throw invalid();return required.subtract(prior);
    }
    private static SplTokenAccount token(NativePerpsSimulation.Account account,String owner,String mint){
        if(account==null)throw invalid();SplTokenAccount token=SplTokenAccount.decode(account.owner,account.executable,account.data());
        byte[] expected=DevnetSolana.decode(owner,32),close=token.closeAuthority();boolean sol=NativePerpsFunding.SOL.equals(mint);
        if(!Arrays.equals(token.owner(),expected)||!Arrays.equals(token.mint(),DevnetSolana.decode(mint,32))||token.frozen||token.hasDelegate()||token.delegatedAmount.signum()!=0
                ||close!=null&&!Arrays.equals(close,expected)||sol!=(token.nativeReserve!=null)||sol&&account.lamports.compareTo(token.nativeReserve.add(token.amount))<0)throw invalid();return token;
    }
    private static void sameTokenMetadata(NativePerpsSimulation.Account old,NativePerpsSimulation.Account next,BigInteger nativeIncrement){
        byte[] a=old.data(),b=next.data();Arrays.fill(a,64,72,(byte)0);Arrays.fill(b,64,72,(byte)0);
        if(!old.owner.equals(next.owner)||old.executable||next.executable||!Arrays.equals(a,b)||!next.lamports.subtract(old.lamports).equals(nativeIncrement))throw invalid();
    }
    private static boolean controlled(NativePerpsSimulation.Account account,String owner){
        if(account==null||!(SplTokenAccount.PROGRAM.equals(account.owner)||"TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb".equals(account.owner)))return false;
        byte[] data=account.data(),key=DevnetSolana.decode(owner,32);
        return data.length>=64&&Arrays.equals(key,Arrays.copyOfRange(data,32,64))||data.length>=108&&data[72]!=0&&Arrays.equals(key,Arrays.copyOfRange(data,76,108))
            ||data.length>=165&&data[129]!=0&&Arrays.equals(key,Arrays.copyOfRange(data,133,165));
    }
    private static BigInteger system(NativePerpsSimulation.Account account){if(!vacant(account)||account==null)throw invalid();return account.lamports;}
    private static boolean vacant(NativePerpsSimulation.Account account){return account==null||NativePerpsFunding.SYSTEM.equals(account.owner)&&!account.executable&&account.data().length==0;}
    private static boolean closed(NativePerpsSimulation.Account account){return vacant(account)&&lamports(account).signum()==0;}
    private static BigInteger lamports(NativePerpsSimulation.Account account){return account==null?BigInteger.ZERO:account.lamports;}
    private static boolean same(NativePerpsSimulation.Account a,NativePerpsSimulation.Account b){return a==b||a!=null&&b!=null&&a.owner.equals(b.owner)&&a.executable==b.executable&&a.lamports.equals(b.lamports)&&Arrays.equals(a.data(),b.data());}
    private static BigInteger number(byte[] data,int at){byte[] big=new byte[8];for(int i=0;i<8;i++)big[i]=data[at+7-i];return new BigInteger(1,big);}
    private static IllegalArgumentException invalid(){return new IllegalArgumentException("Native close payout, wallet funds or rent do not reconcile");}
}
