package com.jamddmaj.ai.wallet;

import android.content.Context;
import android.os.SystemClock;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.UUID;
import javax.crypto.Cipher;

/** Native UI coordinator. Creating a backup alone never registers a receive address. */
public final class NativeWalletEnrollment {
    private final Context context;
    private final NativeWalletProfiles profiles;
    private Pending pending;
    public NativeWalletEnrollment(Context context) {
        this.context = context.getApplicationContext();
        profiles = new NativeWalletProfiles(this.context);
    }
    /** Export this ciphertext through the native file picker, then reopen it for recovery. */
    public static byte[] createBackup(char[] password) throws Exception {
        byte[] entropy = new byte[WalletRecoveryProfile.ENTROPY_BYTES];
        try { new SecureRandom().nextBytes(entropy); return PortableWalletBackup.seal(entropy,password); }
        finally { Arrays.fill(entropy,(byte)0); }
    }
    /** Existing owner must be chosen in native UI, never supplied by a web page. */
    public synchronized Pending recover(byte[] reopenedBackup, char[] password, String name, String existingOwner) throws Exception {
        cancel();
        byte[] entropy = PortableWalletBackup.open(reopenedBackup,password);
        try {
            NativeHdWallet.Addresses addresses = NativeHdWallet.addresses(entropy);
            NativeWalletProfiles.Profile existing = existingOwner == null ? null : profiles.require(existingOwner);
            if (existing != null && (!existing.solanaAddress.equals(addresses.solana) || !existing.bnbAddress.equalsIgnoreCase(addresses.bnb)))
                throw new IllegalArgumentException("Backup does not match selected wallet");
            if (existing == null) for (NativeWalletProfiles.Profile stored : profiles.list()) {
                if (stored.solanaAddress.equals(addresses.solana) || stored.bnbAddress.equalsIgnoreCase(addresses.bnb))
                    throw new IllegalArgumentException("Select existing wallet to recover its access");
            }
            String owner = existing == null ? id() : existing.ownerId;
            String vaultId = id();
            NativeWalletProfiles.Profile profile = new NativeWalletProfiles.Profile(owner,vaultId,
                existing == null ? name : existing.name,addresses.solana,addresses.bnb,
                existing == null ? System.currentTimeMillis() : existing.createdAt);
            HardwareWalletVault vault = new HardwareWalletVault(context,owner,vaultId);
            HardwareSecretVault.Operation operation = vault.prepareCreate();
            pending = new Pending(entropy.clone(),profile,existing,vault,operation);
            return pending;
        } finally { Arrays.fill(entropy,(byte)0); }
    }
    private static String id() { return UUID.randomUUID().toString().replace("-",""); }
    /** Must be called on native Activity stop/cancel; invalidates late biometric callbacks. */
    public synchronized void cancel() { if (pending != null) pending.clear(); pending = null; }

    public final class Pending {
        private byte[] entropy;
        private final NativeWalletProfiles.Profile profile, previous;
        private final HardwareWalletVault vault;
        private final HardwareSecretVault.Operation operation;
        private final long started = SystemClock.elapsedRealtime();
        private Pending(byte[] entropy, NativeWalletProfiles.Profile profile, NativeWalletProfiles.Profile previous,
                        HardwareWalletVault vault, HardwareSecretVault.Operation operation) {
            this.entropy=entropy; this.profile=profile; this.previous=previous; this.vault=vault; this.operation=operation;
        }
        public Cipher authenticationCipher() { synchronized (NativeWalletEnrollment.this) {
            requireCurrent(); return operation.authenticationCipher();
        } }
        private void requireCurrent() {
            long age=SystemClock.elapsedRealtime()-started;
            if (pending!=this || entropy==null || age<0 || age>60000) throw new IllegalStateException("Recovery expired or cancelled");
        }
        /** Exact Cipher from native BIOMETRIC_STRONG success callback, not a boolean from JavaScript. */
        public NativeWalletProfiles.Profile complete(Cipher authenticatedCipher) throws Exception {
            synchronized (NativeWalletEnrollment.this) {
                try {
                    requireCurrent();
                    if (authenticatedCipher==null || authenticatedCipher!=operation.authenticationCipher())
                        throw new SecurityException("Biometric cipher mismatch");
                    operation.completeCreate(entropy);
                    // No profile/address publication before hardware wrapping succeeds.
                    if(previous==null) profiles.saveRecovered(profile);
                    else profiles.replaceRecoveredAccess(previous.ownerId,previous.vaultId,profile.vaultId,profile.solanaAddress,profile.bnbAddress);
                    return profiles.require(profile.ownerId);
                } finally { clear(); if(pending==this)pending=null; }
            }
        }
        private void clear() { if(entropy!=null)Arrays.fill(entropy,(byte)0); entropy=null; vault.cancel(); }
    }
}
