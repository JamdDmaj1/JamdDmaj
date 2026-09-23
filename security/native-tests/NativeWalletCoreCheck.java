import com.jamddmaj.ai.wallet.PortableTestBackup;
import com.jamddmaj.ai.wallet.DevnetSolana;
import java.util.Arrays;
import java.util.HexFormat;

public class NativeWalletCoreCheck {
    public static void main(String[] args)throws Exception{
        HexFormat hex=HexFormat.of();
        // Public RFC8032 test vector, NEVER a funding address.
        byte[] seed=hex.parseHex("9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60");
        byte[] publicKey=DevnetSolana.decode(DevnetSolana.address(seed),32);
        if(!hex.formatHex(publicKey).equals("d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a"))throw new AssertionError("Ed25519 public key vector");
        if(!hex.formatHex(DevnetSolana.sign(seed,new byte[0])).equals("e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b"))throw new AssertionError("Ed25519 signature vector");
        char[] password="Disposable native backup test password".toCharArray();byte[] backup=PortableTestBackup.seal(seed,password);
        if(!Arrays.equals(seed,PortableTestBackup.open(backup,password)))throw new AssertionError("Recovery changed seed");
        byte[] second=PortableTestBackup.seal(seed,password);if(Arrays.equals(backup,second))throw new AssertionError("Reused randomness");
        System.out.println("BACKUP_HEX="+hex.formatHex(second)); // Public RFC fixture only.
        for(int length:new int[]{0,83,85})try{PortableTestBackup.open(new byte[length],password);throw new AssertionError("Malformed backup accepted");}catch(IllegalArgumentException expected){}
        byte[] header=second.clone();header[0]^=1;try{PortableTestBackup.open(header,password);throw new AssertionError("Wrong domain accepted");}catch(IllegalArgumentException expected){}
        backup[83]^=1;try{PortableTestBackup.open(backup,password);throw new AssertionError("Tamper accepted");}catch(javax.crypto.AEADBadTagException expected){}
        try{PortableTestBackup.open(second,"Wrong password 1234567890".toCharArray());throw new AssertionError("Wrong password accepted");}catch(javax.crypto.AEADBadTagException expected){}
        if(DevnetSolana.lamports("0.000000001")!=1)throw new AssertionError("Unit conversion");
        for(String bad:new String[]{"1e-3","-1","0","0.100000001","0.0000000001"})try{DevnetSolana.lamports(bad);throw new AssertionError("Bad amount accepted");}catch(IllegalArgumentException expected){}
        byte[] recipient=new byte[32];Arrays.fill(recipient,(byte)7);
        byte[] message=DevnetSolana.message(DevnetSolana.address(seed),DevnetSolana.encode(recipient),"11111111111111111111111111111111",1000000);
        System.out.println("MESSAGE_HEX="+hex.formatHex(message));
        System.out.println("Native core passed: RFC8032, encrypted recovery, tamper/password rejection, exact units.");
        Arrays.fill(seed,(byte)0);Arrays.fill(password,'\0');
    }
}
