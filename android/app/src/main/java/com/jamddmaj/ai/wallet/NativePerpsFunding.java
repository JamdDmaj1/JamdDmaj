package com.jamddmaj.ai.wallet;

import java.math.BigInteger;
import java.util.Arrays;
import java.util.Map;

/** Exact simulated wallet debits/rent accounting, not instruction approval. */
final class NativePerpsFunding {
    static final String SYSTEM="11111111111111111111111111111111";
    static final String USDC="EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
    static final String SOL="So11111111111111111111111111111111111111112";
    static final class State {
        final String owner;final boolean executable;final BigInteger lamports;
        private final byte[] data;
        State(String owner,boolean executable,BigInteger lamports,byte[] data){
            DevnetSolana.decode(owner,32);
            if(lamports==null||lamports.signum()<0||lamports.bitLength()>64||data==null||data.length>16384)throw invalid();
            this.owner=owner;this.executable=executable;this.lamports=lamports;this.data=data.clone();
        }
    }
    static final class Rent {
        final String program,tokenOwner,mint;final BigInteger minimum;
        Rent(String program,BigInteger minimum,String tokenOwner,String mint){
            if(!(NativePerpsCustody.PROGRAM.equals(program)||SplTokenAccount.PROGRAM.equals(program))||minimum==null||minimum.signum()<=0||minimum.bitLength()>64)throw invalid();
            if(SplTokenAccount.PROGRAM.equals(program)){DevnetSolana.decode(tokenOwner,32);DevnetSolana.decode(mint,32);}
            this.program=program;this.minimum=minimum;this.tokenOwner=tokenOwner;this.mint=mint;
        }
    }
    final BigInteger usdcDebit,networkFee,rentLocked,rentRefunded;
    private NativePerpsFunding(BigInteger debit,BigInteger fee,BigInteger locked,BigInteger refunded){usdcDebit=debit;networkFee=fee;rentLocked=locked;rentRefunded=refunded;}
    static NativePerpsFunding inspect(String payer,String source,BigInteger margin,BigInteger fee,
            Map<String,State> before,Map<String,State> after,Map<String,Rent> rents,Map<String,String> emptyFundingClosures){
        byte[] wallet=DevnetSolana.decode(payer,32);DevnetSolana.decode(source,32);
        if(payer.equals(source)||margin==null||margin.signum()<=0||fee==null||fee.signum()<=0||fee.compareTo(BigInteger.valueOf(1000000))>0
                ||before==null||after==null||rents==null||emptyFundingClosures==null||!before.keySet().equals(after.keySet())
                ||!before.containsKey(payer)||!before.containsKey(source))throw invalid();
        State payerBefore=before.get(payer),payerAfter=after.get(payer);system(payerBefore);system(payerAfter);
        State inputBefore=before.get(source),inputAfter=after.get(source);
        SplTokenAccount input=token(inputBefore,payer,USDC);
        if(input.amount.compareTo(margin)<0)throw invalid();
        BigInteger refunded=BigInteger.ZERO,locked=BigInteger.ZERO;
        if(closed(inputAfter)){
            if(!input.amount.equals(margin))throw invalid();refunded=refunded.add(inputBefore.lamports);
        }else{
            SplTokenAccount remaining=token(inputAfter,payer,USDC);
            if(!input.amount.subtract(remaining.amount).equals(margin)||!inputBefore.lamports.equals(inputAfter.lamports))throw invalid();
            byte[] old=inputBefore.data.clone(),next=inputAfter.data.clone();
            Arrays.fill(old,64,72,(byte)0);Arrays.fill(next,64,72,(byte)0);
            if(!Arrays.equals(old,next))throw invalid();
        }
        for(Map.Entry<String,Rent> entry:rents.entrySet()){
            String address=entry.getKey();DevnetSolana.decode(address,32);
            Rent rent=entry.getValue();State old=before.get(address),next=after.get(address);
            if(address.equals(payer)||address.equals(source)||!before.containsKey(address)||rent==null||next==null
                    ||next.executable||!rent.program.equals(next.owner))throw invalid();
            if(SplTokenAccount.PROGRAM.equals(rent.program)&&token(next,rent.tokenOwner,rent.mint).amount.signum()!=0)throw invalid();
            if(closed(old)){
                if(!next.lamports.equals(rent.minimum))throw invalid();locked=locked.add(next.lamports);
            }else if(old.executable||!old.owner.equals(next.owner)||!old.lamports.equals(next.lamports))throw invalid();
        }
        for(String address:before.keySet()){
            State old=before.get(address),next=after.get(address);
            if(address.equals(source)||(!controlled(old,wallet)&&!controlled(next,wallet)))continue;
            if(same(old,next))continue;
            Rent rent=rents.get(address);
            if(closed(old)&&rent!=null&&SplTokenAccount.PROGRAM.equals(rent.program)&&payer.equals(rent.tokenOwner))continue;
            String closingMint=emptyFundingClosures.get(address);
            if(closingMint!=null&&closed(next)&&old!=null&&token(old,payer,closingMint).amount.signum()==0){refunded=refunded.add(old.lamports);continue;}
            throw invalid(); // Any other wallet token, delegate or authority change.
        }
        if(locked.compareTo(BigInteger.valueOf(30000000))>0||!payerBefore.lamports.add(refunded).subtract(fee).subtract(locked).equals(payerAfter.lamports))throw invalid();
        return new NativePerpsFunding(margin,fee,locked,refunded);
    }
    private static SplTokenAccount token(State state,String owner,String mint){
        if(state==null)throw invalid();SplTokenAccount token=SplTokenAccount.decode(state.owner,state.executable,state.data);
        byte[] expected=DevnetSolana.decode(owner,32),close=token.closeAuthority();
        if(!Arrays.equals(expected,token.owner())||!Arrays.equals(DevnetSolana.decode(mint,32),token.mint())||token.frozen||token.hasDelegate()
                ||(close!=null&&!Arrays.equals(close,expected))||SOL.equals(mint)!=(token.nativeReserve!=null))throw invalid();
        return token;
    }
    private static boolean controlled(State state,byte[] wallet){
        if(state==null||!(SplTokenAccount.PROGRAM.equals(state.owner)||"TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb".equals(state.owner)))return false;
        byte[] bytes=state.data;
        return (bytes.length>=64&&Arrays.equals(wallet,Arrays.copyOfRange(bytes,32,64)))
            ||(bytes.length>=108&&bytes[72]!=0&&Arrays.equals(wallet,Arrays.copyOfRange(bytes,76,108)))
            ||(bytes.length>=165&&bytes[129]!=0&&Arrays.equals(wallet,Arrays.copyOfRange(bytes,133,165)));
    }
    private static boolean same(State a,State b){return a==b||(a!=null&&b!=null&&a.owner.equals(b.owner)&&a.executable==b.executable&&a.lamports.equals(b.lamports)&&Arrays.equals(a.data,b.data));}
    private static void system(State state){if(state==null||!SYSTEM.equals(state.owner)||state.executable||state.data.length!=0)throw invalid();}
    static boolean closed(State state){return state==null||(SYSTEM.equals(state.owner)&&!state.executable&&state.lamports.signum()==0&&state.data.length==0);}
    private static IllegalArgumentException invalid(){return new IllegalArgumentException("Simulated perps funding differs from native wallet intent");}
}
