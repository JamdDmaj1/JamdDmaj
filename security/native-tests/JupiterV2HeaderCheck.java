import com.jamddmaj.ai.wallet.JupiterV2Header;
import java.math.BigInteger;
import java.util.Arrays;
import java.util.Base64;

public final class JupiterV2HeaderCheck {
    // Public read-only /build response for a disposable test address, 2026-09-28.
    static final byte[] LIVE=Base64.getDecoder().decode("0ZhTk3z+2OkGgJaYAAAAAABzExIAAAAAADIAAAAAAAMAAAARAe8kAAIRASECAAJoARAnAgM=");
    static void reject(Runnable action){try{action.run();throw new AssertionError("Accepted mismatched route");}catch(IllegalArgumentException expected){}}
    static JupiterV2Header parse(byte[] data){return JupiterV2Header.parse(JupiterV2Header.PROGRAM,data);}
    static void match(JupiterV2Header header){header.requireIntent(new BigInteger("10000000"),new BigInteger("1184627"),new BigInteger("1178704"),50);}
    public static void main(String[] args){
        JupiterV2Header header=parse(LIVE);match(header);
        if(!header.sharedAccounts||header.authorityId!=6||header.routeSteps!=3)throw new AssertionError();
        byte[] copy=header.bytes();copy[9]=0;match(header);
        for(int size=0;size<35;size++){byte[] partial=Arrays.copyOf(LIVE,size);reject(()->parse(partial));}
        reject(()->JupiterV2Header.parse("wrong",LIVE));
        reject(()->header.requireIntent(new BigInteger("9999999"),header.quotedOutput,header.minimumOutputWithoutFees(),50));
        reject(()->header.requireIntent(header.inputAmount,header.quotedOutput,new BigInteger("1178703"),50));
        reject(()->header.requireIntent(header.inputAmount,header.quotedOutput,header.minimumOutputWithoutFees(),51));
        byte[] fee=LIVE.clone();fee[27]=1;reject(()->parse(fee).minimumOutputWithoutFees());
        byte[] positive=LIVE.clone();positive[29]=1;reject(()->parse(positive).minimumOutputWithoutFees());
        byte[] unknown=LIVE.clone();unknown[0]=0;reject(()->parse(unknown));
        byte[] route=new byte[LIVE.length-1];System.arraycopy(LIVE,9,route,8,LIVE.length-9);
        byte[] magic={(byte)187,100,(byte)250,(byte)204,49,(byte)196,(byte)175,20};System.arraycopy(magic,0,route,0,8);
        match(parse(route));if(parse(route).sharedAccounts)throw new AssertionError();
        System.out.println("Jupiter V2 monetary header and exact intent matching verified");
    }
}
