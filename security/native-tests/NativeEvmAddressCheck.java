import com.jamddmaj.ai.wallet.NativeEvmAddress;
import java.util.Locale;

public final class NativeEvmAddressCheck {
    public static void main(String[] args) {
        // Public ERC-55 fixtures from https://eips.ethereum.org/EIPS/eip-55 . Never funding instructions.
        for (String value : new String[]{
            "0x52908400098527886E0F7030069857D2E4169EE7", "0x8617E340B3D01FA5F11F306F4090FD50E238070D",
            "0xde709f2102306220921060314715629080e2fb77", "0x27b1fdb04752bbc536007a920d24acb045561c26",
            "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed", "0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359",
            "0xdbF03B407c01E7cD3CBea99509d93f8DDDC8C6FB", "0xD1220A0cf47c7B9Be7A2E6BA89F429762e7b9aDb"}) {
            if (!NativeEvmAddress.validate(value).equals(value) || !NativeEvmAddress.checksum(value.toLowerCase(Locale.ROOT)).equals(value))
                throw new AssertionError("ERC-55 vector mismatch");
        }
        for (String value : new String[]{null, "", "0x0000000000000000000000000000000000000000",
            "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAEd", "0x000000000000000000000000000000000000000g",
            " 0x52908400098527886E0F7030069857D2E4169EE7"}) {
            try { NativeEvmAddress.recipient(value); throw new AssertionError("Invalid recipient accepted"); }
            catch (IllegalArgumentException expected) {}
        }
        System.out.println("ERC-55 official vectors and recipient rejection passed; no network calls.");
    }
}
