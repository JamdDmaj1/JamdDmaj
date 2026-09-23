import com.jamddmaj.ai.wallet.TestVaultEnvelope;
import java.util.Arrays;

public class TestVaultEnvelopeCheck {
    private static void rejects(byte[] data) {
        try {TestVaultEnvelope.validate(data);throw new AssertionError("Accepted damaged envelope");}
        catch(IllegalArgumentException expected){}
    }
    public static void main(String[] args) {
        byte[] iv=new byte[12],sealed=new byte[48];Arrays.fill(iv,(byte)7);Arrays.fill(sealed,(byte)9);
        byte[] encoded=TestVaultEnvelope.encode(iv,sealed);
        if(!Arrays.equals(iv,TestVaultEnvelope.iv(encoded))||!Arrays.equals(sealed,TestVaultEnvelope.ciphertext(encoded)))throw new AssertionError("Roundtrip");
        byte[] detached=TestVaultEnvelope.iv(encoded);detached[0]=0;if(TestVaultEnvelope.iv(encoded)[0]!=7)throw new AssertionError("Mutable reference");
        rejects(null);rejects(new byte[63]);rejects(new byte[65]);encoded[3]=2;rejects(encoded);
        try{TestVaultEnvelope.encode(new byte[11],sealed);throw new AssertionError("Bad IV accepted");}catch(IllegalArgumentException expected){}
        System.out.println("Native test envelope: roundtrip, bounded parsing, version rejection and defensive copies passed.");
    }
}
