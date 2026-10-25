package com.jamddmaj.ai.wallet;

import java.math.BigInteger;
import java.security.MessageDigest;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Map;

/** Exact cancellation refunds, closed requests and unchanged position/pool. */
final class NativePerpsCancelEffects {
    final BigInteger fee,returnedUsdc,recoveredRent,addedRent;
    private NativePerpsCancelEffects(BigInteger fee,BigInteger tokens,BigInteger recovered,BigInteger added){this.fee=fee;returnedUsdc=tokens;recoveredRent=recovered;addedRent=added;}
    static NativePerpsCancelEffects check(NativePerpsCancelIntent intent,Map<String,NativePerpsSimulation.Account> before,Map<String,NativePerpsSimulation.Account> after,BigInteger fee,BigInteger rent)throws Exception{
        if(intent==null||before==null||after==null||!before.keySet().equals(after.keySet())||fee==null||fee.signum()<=0||fee.compareTo(BigInteger.valueOf(1000000))>0
                ||rent==null||rent.signum()<=0||rent.compareTo(BigInteger.valueOf(10000000))>0)throw invalid();
        for(String address:new String[]{intent.payer,intent.positionAddress,intent.requestAddress,intent.ownerAta,intent.requestAta,NativePerpsCustody.POOL})if(!before.containsKey(address))throw invalid();
        intent.requireState(before.get(intent.requestAddress));intent.requireClosedPosition(before.get(intent.positionAddress));intent.requireClosedPosition(after.get(intent.positionAddress));
        NativePerpsSimulation.Account pool=before.get(NativePerpsCustody.POOL);
        byte[] tag=Arrays.copyOf(MessageDigest.getInstance("SHA-256").digest("account:Pool".getBytes(StandardCharsets.US_ASCII)),8);
        if(pool==null||pool.executable||!NativePerpsCustody.PROGRAM.equals(pool.owner)||pool.data().length<8||!Arrays.equals(tag,Arrays.copyOf(pool.data(),8)))throw invalid();
        BigInteger oldSol=system(before.get(intent.payer)),nextSol=system(after.get(intent.payer));if(oldSol.compareTo(fee)<0)throw invalid();
        NativePerpsSimulation.Account oldOwner=before.get(intent.ownerAta),newOwner=after.get(intent.ownerAta),requestToken=before.get(intent.requestAta);
        BigInteger returned=token(requestToken,intent.requestAddress),oldTokens=vacant(oldOwner)?BigInteger.ZERO:token(oldOwner,intent.payer);
        if(!closed(after.get(intent.requestAddress))||!closed(after.get(intent.requestAta))||!token(newOwner,intent.payer).equals(oldTokens.add(returned)))throw invalid();
        BigInteger added=BigInteger.ZERO;
        if(vacant(oldOwner)){
            BigInteger oldLamports=lamports(oldOwner),required=oldLamports.max(rent);if(!newOwner.lamports.equals(required))throw invalid();added=required.subtract(oldLamports);
        }else{
            byte[] old=oldOwner.data(),next=newOwner.data();Arrays.fill(old,64,72,(byte)0);Arrays.fill(next,64,72,(byte)0);
            if(!oldOwner.lamports.equals(newOwner.lamports)||!Arrays.equals(old,next))throw invalid();
        }
        BigInteger recovered=before.get(intent.requestAddress).lamports.add(requestToken.lamports);
        if(!oldSol.add(recovered).subtract(fee).subtract(added).equals(nextSol))throw invalid();
        for(String address:before.keySet())if(!Arrays.asList(intent.payer,intent.ownerAta,intent.requestAddress,intent.requestAta).contains(address)&&!same(before.get(address),after.get(address)))throw invalid();
        return new NativePerpsCancelEffects(fee,returned,recovered,added);
    }
    boolean sameAs(NativePerpsCancelEffects b){return b!=null&&fee.equals(b.fee)&&returnedUsdc.equals(b.returnedUsdc)&&recoveredRent.equals(b.recoveredRent)&&addedRent.equals(b.addedRent);}
    private static BigInteger token(NativePerpsSimulation.Account a,String owner){
        if(a==null)throw invalid();SplTokenAccount token=SplTokenAccount.decode(a.owner,a.executable,a.data());byte[] close=token.closeAuthority(),key=DevnetSolana.decode(owner,32);
        if(!Arrays.equals(token.mint(),DevnetSolana.decode(NativePerpsFunding.USDC,32))||!Arrays.equals(token.owner(),key)||token.frozen||token.hasDelegate()||token.delegatedAmount.signum()!=0
                ||token.nativeReserve!=null||close!=null&&!Arrays.equals(close,key))throw invalid();return token.amount;
    }
    private static BigInteger system(NativePerpsSimulation.Account a){if(a==null||!vacant(a))throw invalid();return a.lamports;}
    private static boolean vacant(NativePerpsSimulation.Account a){return a==null||!a.executable&&NativePerpsFunding.SYSTEM.equals(a.owner)&&a.data().length==0;}
    private static boolean closed(NativePerpsSimulation.Account a){return vacant(a)&&lamports(a).signum()==0;}
    private static BigInteger lamports(NativePerpsSimulation.Account a){return a==null?BigInteger.ZERO:a.lamports;}
    private static boolean same(NativePerpsSimulation.Account a,NativePerpsSimulation.Account b){return a==b||a!=null&&b!=null&&a.owner.equals(b.owner)&&a.executable==b.executable&&a.lamports.equals(b.lamports)&&Arrays.equals(a.data(),b.data());}
    private static IllegalArgumentException invalid(){return new IllegalArgumentException("Cancellation refund or unchanged position/pool could not be verified");}
}
