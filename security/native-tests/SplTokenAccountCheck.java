import com.jamddmaj.ai.wallet.SplTokenAccount;
import java.math.BigInteger;
import java.util.Arrays;

public final class SplTokenAccountCheck {
    static byte[] fixture() { byte[] bytes=new byte[165];bytes[0]=7;bytes[32]=8;bytes[64]=1;bytes[108]=1;return bytes; }
    static SplTokenAccount decode(byte[] value) { return SplTokenAccount.decode(SplTokenAccount.PROGRAM,false,value); }
    static void require(boolean ok) { if(!ok)throw new AssertionError(); }
    static void reject(Runnable action) { try{action.run();throw new AssertionError("Accepted invalid token");}catch(IllegalArgumentException expected){} }
    public static void main(String[] args) {
        byte[] bytes=fixture();SplTokenAccount account=decode(bytes);
        require(account.amount.equals(BigInteger.ONE)&&account.owner()[0]==8&&account.mint()[0]==7&&!account.frozen&&!account.hasDelegate());
        bytes[0]=0;byte[] owner=account.owner();owner[0]=0;require(account.mint()[0]==7&&account.owner()[0]==8);
        bytes=fixture();Arrays.fill(bytes,64,72,(byte)255);require(decode(bytes).amount.equals(BigInteger.ONE.shiftLeft(64).subtract(BigInteger.ONE)));
        bytes=fixture();bytes[108]=2;require(decode(bytes).frozen);
        bytes=fixture();bytes[72]=1;bytes[76]=9;bytes[121]=5;require(decode(bytes).hasDelegate()&&decode(bytes).delegate()[0]==9&&decode(bytes).delegatedAmount.intValue()==5);
        bytes=fixture();bytes[109]=1;bytes[113]=9;require(decode(bytes).nativeReserve.intValue()==9);
        bytes=fixture();bytes[129]=1;bytes[133]=10;require(decode(bytes).closeAuthority()[0]==10);
        for(int state:new int[]{0,3,255}){byte[] bad=fixture();bad[108]=(byte)state;reject(()->decode(bad));}
        for(int offset:new int[]{72,109,129}){byte[] bad=fixture();bad[offset]=2;reject(()->decode(bad));bad[offset]=1;bad[offset+1]=1;reject(()->decode(bad));}
        reject(()->decode(new byte[164]));reject(()->decode(new byte[166]));
        reject(()->SplTokenAccount.decode("wrong",false,fixture()));reject(()->SplTokenAccount.decode(SplTokenAccount.PROGRAM,true,fixture()));
        System.out.println("SPL amounts, ownership fields, flags, options and copies verified");
    }
}
