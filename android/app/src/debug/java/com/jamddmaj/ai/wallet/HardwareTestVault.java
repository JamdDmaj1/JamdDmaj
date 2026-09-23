package com.jamddmaj.ai.wallet;

import android.content.Context;
import android.os.Build;
import android.os.SystemClock;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyInfo;
import android.security.keystore.KeyProperties;
import android.util.AtomicFile;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.KeyStore;
import java.util.Arrays;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.GCMParameterSpec;

/**
 * DEBUG SOURCE SET ONLY. Not registered as a Capacitor plugin; no JavaScript API.
 * Stores disposable 32-byte test secrets, never production wallet material.
 * Native caller must pass the cipher to Android BiometricPrompt.CryptoObject and
 * call complete only on authentication success; cancel on app background/cancel.
 * Requires Android 11+, enrolled strong biometrics and hardware-backed keys.
 */
public final class HardwareTestVault {
    private static final Object FILE_LOCK = new Object();
    private final AtomicFile file;
    private final String alias;
    private final byte[] aad;
    private Operation pending;

    public HardwareTestVault(Context context, String testWalletId) throws Exception {
        if (Build.VERSION.SDK_INT < 30) throw new GeneralSecurityException("Unsupported Android version");
        if (testWalletId == null || !testWalletId.matches("[a-f0-9]{32}"))
            throw new IllegalArgumentException("Invalid test wallet ID");
        File directory = new File(context.getNoBackupFilesDir(), "jamddmaj-test-vaults");
        if (!directory.isDirectory() && !directory.mkdirs()) throw new java.io.IOException("Storage unavailable");
        file = new AtomicFile(new File(directory, testWalletId + ".vault"));
        alias = context.getPackageName() + ".test-vault.v1." + testWalletId;
        aad = (alias + ":solana:devnet:test-only").getBytes(StandardCharsets.UTF_8);
    }

    private SecretKey key(boolean create) throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore"); store.load(null);
        if (!store.containsAlias(alias)) {
            if (!create) throw new GeneralSecurityException("Key missing: restore from verified backup");
            KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
            generator.init(new KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setKeySize(256).setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true).setUserAuthenticationRequired(true)
                .setUserAuthenticationParameters(0, KeyProperties.AUTH_BIOMETRIC_STRONG)
                .setInvalidatedByBiometricEnrollment(true).build());
            generator.generateKey();
        }
        SecretKey key = (SecretKey) store.getKey(alias, null);
        KeyInfo info = (KeyInfo) SecretKeyFactory.getInstance(key.getAlgorithm(), "AndroidKeyStore").getKeySpec(key, KeyInfo.class);
        boolean hardware = Build.VERSION.SDK_INT >= 31
            ? info.getSecurityLevel() == KeyProperties.SECURITY_LEVEL_TRUSTED_ENVIRONMENT || info.getSecurityLevel() == KeyProperties.SECURITY_LEVEL_STRONGBOX
            : info.isInsideSecureHardware();
        if (!hardware || !info.isUserAuthenticationRequired() || !info.isUserAuthenticationRequirementEnforcedBySecureHardware()
            || info.getUserAuthenticationValidityDurationSeconds() > 0)
            throw new GeneralSecurityException("Required hardware authentication unavailable");
        return key;
    }

    private boolean exists() {
        // AtomicFile may need to recover an interrupted write; never replace that entry.
        return file.getBaseFile().exists() || new File(file.getBaseFile().getPath() + ".bak").exists()
            || new File(file.getBaseFile().getPath() + ".new").exists();
    }

    public synchronized Operation prepareCreate() throws Exception {
        cancel();
        synchronized (FILE_LOCK) {
            if (exists()) throw new GeneralSecurityException("Test vault already exists");
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, key(true));
            pending = new Operation(cipher, null); return pending;
        }
    }

    public synchronized Operation prepareOpen() throws Exception {
        cancel();
        byte[] encoded = new byte[TestVaultEnvelope.SIZE];
        synchronized (FILE_LOCK) {
            try (FileInputStream input = file.openRead()) {
                int total=0, count;
                while (total < encoded.length && (count=input.read(encoded,total,encoded.length-total)) != -1) total+=count;
                if (total != encoded.length || input.read() != -1) throw new GeneralSecurityException("Damaged test vault");
            }
        }
        TestVaultEnvelope.validate(encoded);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, key(false), new GCMParameterSpec(128, TestVaultEnvelope.iv(encoded)));
        pending = new Operation(cipher, TestVaultEnvelope.ciphertext(encoded)); return pending;
    }

    public synchronized void cancel() { if (pending != null) pending.clear(); pending = null; }

    public interface TestSecretConsumer { void accept(byte[] temporarySecret) throws Exception; }

    public final class Operation {
        private Cipher cipher;
        private byte[] encrypted;
        private final boolean opening;
        private final long started = SystemClock.elapsedRealtime();
        private Operation(Cipher value, byte[] ciphertext) { cipher=value;encrypted=ciphertext;opening=ciphertext!=null; }
        public Cipher authenticationCipher() { return cipher; }
        private void check(boolean expectedOpen) throws GeneralSecurityException {
            if (pending != this || cipher == null || opening != expectedOpen || SystemClock.elapsedRealtime()-started > 60000)
                throw new GeneralSecurityException("Operation expired or cancelled");
        }
        private void clear() { cipher=null; if(encrypted!=null)Arrays.fill(encrypted,(byte)0);encrypted=null; }

        public void completeCreate(byte[] disposableSecret) throws Exception {
            synchronized (HardwareTestVault.this) {
                byte[] copy=null;
                try {
                    check(false);
                    if(disposableSecret==null||disposableSecret.length!=32)throw new IllegalArgumentException("Expected disposable test secret");
                    copy=disposableSecret.clone();cipher.updateAAD(aad);
                    byte[] sealed=TestVaultEnvelope.encode(cipher.getIV(),cipher.doFinal(copy));
                    synchronized(FILE_LOCK) {
                        if(exists())throw new GeneralSecurityException("Test vault already exists");
                        FileOutputStream out=null;
                        try {out=file.startWrite();out.write(sealed);file.finishWrite(out);}
                        catch(Exception failure){if(out!=null)file.failWrite(out);throw failure;}
                    }
                } finally {if(copy!=null)Arrays.fill(copy,(byte)0);clear();if(pending==this)pending=null;}
            }
        }

        public void completeOpen(TestSecretConsumer consumer) throws Exception {
            synchronized (HardwareTestVault.this) {
                byte[] plaintext=null;
                try {
                    check(true);cipher.updateAAD(aad);plaintext=cipher.doFinal(encrypted);
                    if(plaintext.length!=32)throw new GeneralSecurityException("Invalid test secret");
                    // Native test consumer only. Never return or serialize this buffer to WebView.
                    consumer.accept(plaintext);
                } finally {if(plaintext!=null)Arrays.fill(plaintext,(byte)0);clear();if(pending==this)pending=null;}
            }
        }
    }
}
