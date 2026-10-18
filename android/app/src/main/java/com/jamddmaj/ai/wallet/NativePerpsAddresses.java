package com.jamddmaj.ai.wallet;

import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;

/** Position/request public identities. Derivation never authorizes spending. */
final class NativePerpsAddresses {
    private NativePerpsAddresses(){}
    static byte[] perpetuals(){
        return SolanaProgramAddress.find(NativePerpsCustody.PROGRAM,Arrays.asList("perpetuals".getBytes(StandardCharsets.US_ASCII))).key();
    }
    static byte[] eventAuthority(){
        return SolanaProgramAddress.find(NativePerpsCustody.PROGRAM,Arrays.asList("__event_authority".getBytes(StandardCharsets.US_ASCII))).key();
    }
    static byte[] position(String owner,String asset,int side){
        return positionDerivation(owner,asset,side).key();
    }
    static SolanaProgramAddress.Derived positionDerivation(String owner,String asset,int side){
        if((side!=1&&side!=2)||!("SOL".equals(asset)||"BTC".equals(asset)||"ETH".equals(asset)))throw invalid();
        return SolanaProgramAddress.find(NativePerpsCustody.PROGRAM,Arrays.asList(
            "position".getBytes(StandardCharsets.US_ASCII),DevnetSolana.decode(owner,32),
            DevnetSolana.decode(NativePerpsCustody.POOL,32),DevnetSolana.decode(NativePerpsCustody.address(asset),32),
            DevnetSolana.decode(NativePerpsCustody.address(side==1?asset:"USDC"),32),new byte[]{(byte)side}));
    }
    static byte[] exitRequest(byte[] position,BigInteger counter){
        return exitDerivation(position,counter).key();
    }
    static SolanaProgramAddress.Derived exitDerivation(byte[] position,BigInteger counter){
        if(position==null||position.length!=32||counter==null||counter.signum()<0||counter.bitLength()>64)throw invalid();
        byte[] little=new byte[8];BigInteger remaining=counter;
        for(int i=0;i<8;i++){little[i]=remaining.byteValue();remaining=remaining.shiftRight(8);}
        return SolanaProgramAddress.find(NativePerpsCustody.PROGRAM,Arrays.asList(
            "position_request".getBytes(StandardCharsets.US_ASCII),position,little,new byte[]{2}));
    }
    private static IllegalArgumentException invalid(){return new IllegalArgumentException("Invalid perps address intent");}
}
