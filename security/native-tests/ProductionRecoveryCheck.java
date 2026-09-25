import com.jamddmaj.ai.wallet.PortableWalletBackup;
import com.jamddmaj.ai.wallet.PortableTestBackup;
import com.jamddmaj.ai.wallet.WalletRecoveryProfile;
import com.jamddmaj.ai.wallet.WalletVaultDomain;
import com.jamddmaj.ai.wallet.TestVaultEnvelope;
import java.util.Arrays;
import java.util.HexFormat;

public final class ProductionRecoveryCheck {
    private interface Check { void run() throws Exception; }
    private static void rejects(Check check) throws Exception {
        try { check.run(); throw new AssertionError("Unsafe recovery accepted"); }
        catch (IllegalArgumentException | javax.crypto.AEADBadTagException expected) {}
    }
    public static void main(String[] args) throws Exception {
        // PUBLIC deterministic fixture; never a wallet for deposits.
        byte[] entropy = new byte[32];
        for (int i = 0; i < entropy.length; i++) entropy[i] = (byte) i;
        char[] password = "Public recovery fixture: español 🔐".toCharArray();
        byte[] encoded = PortableWalletBackup.seal(entropy, password);
        if (!Arrays.equals(entropy, PortableWalletBackup.open(encoded, password)))
            throw new AssertionError("Entropy changed during recovery");
        byte[] second = PortableWalletBackup.seal(entropy, password);
        if (Arrays.equals(encoded, second)) throw new AssertionError("Randomness reused");
        rejects(() -> PortableTestBackup.open(encoded, password));
        byte[] devnet = PortableTestBackup.seal(entropy, password);
        rejects(() -> PortableWalletBackup.open(devnet, password));
        // Relabeling a devnet file must still fail authentication, not convert its seed.
        System.arraycopy(encoded, 0, devnet, 0, 8);
        rejects(() -> PortableWalletBackup.open(devnet, password));
        for (int offset : new int[]{0, 7, 8, 24, 36, 83}) {
            byte[] tampered = encoded.clone(); tampered[offset] ^= 1;
            rejects(() -> PortableWalletBackup.open(tampered, password));
        }
        rejects(() -> PortableWalletBackup.open(encoded, "Different password entirely".toCharArray()));
        rejects(() -> PortableWalletBackup.open(Arrays.copyOf(encoded, 85), password));
        rejects(() -> PortableWalletBackup.open(null, password));
        rejects(() -> PortableWalletBackup.seal(new byte[64], password));
        rejects(() -> PortableWalletBackup.seal(entropy, "short".toCharArray()));
        rejects(() -> PortableWalletBackup.seal(entropy, "Invalid surrogate \uD800".toCharArray()));
        if (!WalletRecoveryProfile.SOLANA_PATH.equals("m/44'/501'/0'/0'") ||
            !WalletRecoveryProfile.EVM_PATH.equals("m/44'/60'/0'/0/0")) throw new AssertionError("Recovery paths changed");
        String id = "11111111111111111111111111111111", owner = "22222222222222222222222222222222";
        WalletVaultDomain test = WalletVaultDomain.devnet("com.jamddmaj.ai", id);
        WalletVaultDomain real = WalletVaultDomain.production("com.jamddmaj.ai", owner, id);
        WalletVaultDomain other = WalletVaultDomain.production("com.jamddmaj.ai", id, id);
        byte[] iv = new byte[12], ciphertext = new byte[48];
        if (!Arrays.equals(test.encode(iv, ciphertext), TestVaultEnvelope.encode(iv, ciphertext)))
            throw new AssertionError("Existing devnet envelope changed");
        if (!new String(test.aad(), java.nio.charset.StandardCharsets.UTF_8).equals(
            "com.jamddmaj.ai.test-vault.v1." + id + ":solana:devnet:test-only")) throw new AssertionError("Existing devnet AAD changed");
        if (real.directory.equals(test.directory) || real.alias.equals(test.alias) ||
            real.directory.equals(other.directory) || real.alias.equals(other.alias) ||
            Arrays.equals(real.aad(), other.aad())) throw new AssertionError("Owner/domain collision");
        rejects(() -> real.validate(test.encode(iv, ciphertext)));
        rejects(() -> test.validate(real.encode(iv, ciphertext)));
        rejects(() -> WalletVaultDomain.production("com.jamddmaj.ai", "../other", id));
        rejects(() -> WalletVaultDomain.devnet("com.jamddmaj.ai", "../other"));
        // Even if ciphertext and wrapping key were copied, authenticated owner identity must reject it.
        javax.crypto.spec.SecretKeySpec fixtureKey = new javax.crypto.spec.SecretKeySpec(new byte[32], "AES");
        javax.crypto.Cipher encrypt = javax.crypto.Cipher.getInstance("AES/GCM/NoPadding");
        encrypt.init(javax.crypto.Cipher.ENCRYPT_MODE, fixtureKey, new javax.crypto.spec.GCMParameterSpec(128, iv));
        encrypt.updateAAD(real.aad());
        byte[] sealed = encrypt.doFinal(entropy);
        javax.crypto.Cipher decrypt = javax.crypto.Cipher.getInstance("AES/GCM/NoPadding");
        decrypt.init(javax.crypto.Cipher.DECRYPT_MODE, fixtureKey, new javax.crypto.spec.GCMParameterSpec(128, iv));
        decrypt.updateAAD(other.aad());
        rejects(() -> decrypt.doFinal(sealed));
        System.out.println("PUBLIC_HD_BACKUP=" + HexFormat.of().formatHex(encoded));
        System.out.println("Production recovery container passed; no real keys, addresses or transfers created.");
        Arrays.fill(entropy, (byte) 0);
        Arrays.fill(password, '\0');
    }
}
