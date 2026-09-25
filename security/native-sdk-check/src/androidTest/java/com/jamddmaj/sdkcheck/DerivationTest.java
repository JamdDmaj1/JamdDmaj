package com.jamddmaj.sdkcheck;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import java.math.BigInteger;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import javax.crypto.Mac;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;
import javax.crypto.spec.SecretKeySpec;
import org.bouncycastle.asn1.sec.SECNamedCurves;
import org.bouncycastle.crypto.params.Ed25519PrivateKeyParameters;
import org.bouncycastle.crypto.signers.Ed25519Signer;
import org.junit.Test;
import org.junit.runner.RunWith;
import wallet.core.jni.*;
import static org.junit.Assert.*;

/** Public zero-entropy fixture only. Independent JCA/BC derivation; never funds these keys. */
@RunWith(AndroidJUnit4.class)
public class DerivationTest {
    static { System.loadLibrary("TrustWalletCore"); }
    // Official Trezor BIP39 256-bit zero entropy vector, with app's empty passphrase.
    private static final String WORDS = String.join(" ", java.util.Collections.nCopies(23, "abandon")) + " art";
    private byte[] seed() throws Exception {
        return SecretKeyFactory.getInstance("PBKDF2WithHmacSHA512").generateSecret(
            new PBEKeySpec(WORDS.toCharArray(), "mnemonic".getBytes(StandardCharsets.US_ASCII), 2048, 512)).getEncoded();
    }
    private byte[] hmac(byte[] key, byte[] data) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA512"); mac.init(new SecretKeySpec(key, "HmacSHA512")); return mac.doFinal(data);
    }
    private byte[] derive(boolean ed, int[] path) throws Exception {
        byte[] material = hmac((ed ? "ed25519 seed" : "Bitcoin seed").getBytes(StandardCharsets.US_ASCII), seed());
        byte[] key = Arrays.copyOf(material,32), chain = Arrays.copyOfRange(material,32,64);
        var curve = SECNamedCurves.getByName("secp256k1");
        for (int index : path) {
            byte[] data = new byte[37];
            if (index < 0) System.arraycopy(key,0,data,1,32);
            else System.arraycopy(curve.getG().multiply(new BigInteger(1,key)).getEncoded(true),0,data,0,33);
            ByteBuffer.wrap(data,33,4).putInt(index);
            material = hmac(chain,data);
            if (ed) key = Arrays.copyOf(material,32);
            else {
                BigInteger left = new BigInteger(1,Arrays.copyOf(material,32));
                assertTrue(left.compareTo(curve.getN()) < 0);
                byte[] scalar = left.add(new BigInteger(1,key)).mod(curve.getN()).toByteArray();
                key = new byte[32]; System.arraycopy(scalar,Math.max(0,scalar.length-32),key,Math.max(0,32-scalar.length),Math.min(32,scalar.length));
            }
            chain = Arrays.copyOfRange(material,32,64);
        }
        return key;
    }
    @Test public void interoperableRecoveryMatchesIndependentSeed() throws Exception {
        HDWallet wallet = new HDWallet(new byte[32], "");
        assertEquals(WORDS,wallet.mnemonic()); assertArrayEquals(seed(),wallet.seed());
        HDWallet recovered = new HDWallet(WORDS, "");
        assertArrayEquals(new byte[32],recovered.entropy());
        assertArrayEquals(wallet.seed(),recovered.seed());
    }
    @Test public void solanaPathAndSignatureMatchIndependentEd25519() throws Exception {
        byte[] expected = derive(true,new int[]{0x8000002c,0x800001f5,0x80000000,0x80000000});
        PrivateKey key = new HDWallet(new byte[32],"").getKey(CoinType.SOLANA,"m/44'/501'/0'/0'");
        assertArrayEquals(expected,key.data());
        byte[] message = "offline-public-vector-not-a-transaction".getBytes(StandardCharsets.US_ASCII);
        Ed25519Signer signer = new Ed25519Signer(); signer.init(true,new Ed25519PrivateKeyParameters(expected,0)); signer.update(message,0,message.length);
        assertArrayEquals(signer.generateSignature(),key.sign(message,Curve.ED25519));
    }
    @Test public void bnbEvmPathMatchesIndependentBip32() throws Exception {
        byte[] expected = derive(false,new int[]{0x8000002c,0x8000003c,0x80000000,0,0});
        PrivateKey key = new HDWallet(new byte[32],"").getKey(CoinType.ETHEREUM,"m/44'/60'/0'/0/0");
        assertArrayEquals(expected,key.data());
        assertEquals(CoinType.ETHEREUM.deriveAddress(key),CoinType.ETHEREUM.deriveAddress(new PrivateKey(expected)));
    }
}
