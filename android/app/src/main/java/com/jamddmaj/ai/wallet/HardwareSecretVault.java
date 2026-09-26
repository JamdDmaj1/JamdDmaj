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
import java.security.GeneralSecurityException;
import java.security.KeyStore;
import java.util.Arrays;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.GCMParameterSpec;

/**
 * Native, hardware-authenticated storage shared by strictly separate wallet domains.
 * No web bridge. Caller must cancel on background and authenticate this exact Cipher.
 * Plaintext callback buffers are wiped; this cannot guarantee removal of all VM copies.
 */
public class HardwareSecretVault {
    private static final Object FILE_LOCK = new Object();
    private final AtomicFile file;
    private final File privateRoot;
    private final String alias;
    private final byte[] aad;
    private Operation pending;

    private final WalletVaultDomain domain;

    HardwareSecretVault(Context context, WalletVaultDomain storageDomain) throws Exception {
        if (Build.VERSION.SDK_INT < 30) throw new GeneralSecurityException("Unsupported Android version");
        domain = storageDomain;
        privateRoot=context.getNoBackupFilesDir();
        File directory = new File(context.getNoBackupFilesDir(), domain.directory);
        if (!directory.isDirectory() && !directory.mkdirs()) throw new java.io.IOException("Storage unavailable");
        file = new AtomicFile(new File(directory, domain.walletId + ".vault"));
        alias = domain.alias;
        aad = domain.aad();
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
            if (exists()) throw new GeneralSecurityException("Wallet vault already exists");
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, key(true));
            pending = new Operation(cipher, null); return pending;
        }
    }

    public synchronized Operation prepareOpen() throws Exception {
        cancel();
        byte[] encoded = new byte[WalletVaultDomain.SIZE];
        synchronized (FILE_LOCK) {
            try (FileInputStream input = file.openRead()) {
                int total=0, count;
                while (total < encoded.length && (count=input.read(encoded,total,encoded.length-total)) != -1) total+=count;
                if (total != encoded.length || input.read() != -1) throw new GeneralSecurityException("Damaged wallet vault");
            }
        }
        domain.validate(encoded);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, key(false), new GCMParameterSpec(128, domain.iv(encoded)));
        pending = new Operation(cipher, domain.ciphertext(encoded)); return pending;
    }

    public synchronized void cancel() { if (pending != null) pending.clear(); pending = null; }

    public interface SecretConsumer { void accept(byte[] temporarySecret) throws Exception; }

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

        public void completeCreate(byte[] secret) throws Exception {
            synchronized (HardwareSecretVault.this) {
                byte[] copy=null;
                try {
                    check(false);
                    if(secret==null||secret.length!=32)throw new IllegalArgumentException("Expected 32-byte native wallet secret");
                    copy=secret.clone();cipher.updateAAD(aad);
                    byte[] sealed=domain.encode(cipher.getIV(),cipher.doFinal(copy));
                    synchronized(FILE_LOCK) {
                        if(exists())throw new GeneralSecurityException("Wallet vault already exists");
                        FileOutputStream out=null;
                        try {out=file.startWrite();out.write(sealed);out.getFD().sync();file.finishWrite(out);out=null;
                            try(FileInputStream input=file.openRead()) {
                                byte[] check=new byte[WalletVaultDomain.SIZE];int total=0,count;
                                while(total<check.length&&(count=input.read(check,total,check.length-total))!=-1)total+=count;
                                if(total!=check.length||input.read()!=-1||!Arrays.equals(sealed,check))throw new java.io.IOException("Vault storage verification failed");
                            }
                            WalletStorageBarrier.syncParents(file.getBaseFile(),privateRoot);
                        }
                        catch(Exception failure){if(out!=null)file.failWrite(out);throw failure;}
                    }
                } finally {if(copy!=null)Arrays.fill(copy,(byte)0);clear();if(pending==this)pending=null;}
            }
        }

        public void completeOpen(SecretConsumer consumer) throws Exception {
            synchronized (HardwareSecretVault.this) {
                byte[] plaintext=null;
                try {
                    check(true);cipher.updateAAD(aad);plaintext=cipher.doFinal(encrypted);
                    if(plaintext.length!=32)throw new GeneralSecurityException("Invalid wallet secret");
                    // Native consumer only. Never return or serialize this buffer to WebView.
                    consumer.accept(plaintext);
                } finally {if(plaintext!=null)Arrays.fill(plaintext,(byte)0);clear();if(pending==this)pending=null;}
            }
        }
    }
}
