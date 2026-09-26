package com.jamddmaj.ai.wallet;

import android.content.Context;
import android.util.AtomicFile;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileNotFoundException;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Public metadata only, selected by the native wallet UI, independent of chat sessions.
 * A native profile is not server authentication. No keys or passwords are stored here.
 * Call saveRecovered only AFTER native backup recovery and durable hardware wrapping.
 */
public final class NativeWalletProfiles {
    private static final Object LOCK = new Object();
    private static final int MAX_PROFILES = 32;
    private final AtomicFile file;
    private final File privateRoot;

    public NativeWalletProfiles(Context context) {
        privateRoot=context.getNoBackupFilesDir();
        file = new AtomicFile(new File(context.getNoBackupFilesDir(), "native-wallet-profiles-v1.json"));
    }

    public static final class Profile {
        public final String ownerId, vaultId, name, solanaAddress, bnbAddress;
        public final long createdAt;
        Profile(String ownerId, String vaultId, String name, String solanaAddress, String bnbAddress, long createdAt) {
            WalletVaultDomain.production("com.jamddmaj.ai", ownerId, vaultId);
            if (name == null || name.trim().isEmpty() || name.length() > 60 || name.chars().anyMatch(Character::isISOControl))
                throw new IllegalArgumentException("Invalid native wallet profile name");
            DevnetSolana.decode(solanaAddress, 32);
            if (createdAt <= 0)
                throw new IllegalArgumentException("Invalid native wallet profile");
            this.ownerId = ownerId; this.vaultId = vaultId; this.name = name;
            this.solanaAddress = solanaAddress; this.bnbAddress = NativeEvmAddress.recipient(bnbAddress); this.createdAt = createdAt;
        }
        public String address(WalletNetwork network) {
            if (network == WalletNetwork.SOLANA_MAINNET) return solanaAddress;
            if (network == WalletNetwork.BNB_MAINNET) return bnbAddress;
            throw new IllegalArgumentException("Production profile cannot select a test network");
        }
        JSONObject json() throws Exception {
            return new JSONObject().put("ownerId", ownerId).put("vaultId", vaultId).put("name", name)
                .put("profile", WalletRecoveryProfile.ID).put("solanaAddress", solanaAddress)
                .put("bnbAddress", bnbAddress).put("createdAt", createdAt);
        }
    }

    public List<Profile> list() throws Exception {
        synchronized (LOCK) { return Collections.unmodifiableList(read()); }
    }

    public Profile require(String nativeOwnerId) throws Exception {
        synchronized (LOCK) {
            for (Profile profile : read()) if (profile.ownerId.equals(nativeOwnerId)) return profile;
            throw new IOException("Select an existing native wallet profile");
        }
    }

    public void saveRecovered(Profile profile) throws Exception {
        if (profile == null) throw new IllegalArgumentException("Recovered profile required");
        synchronized (LOCK) {
            ArrayList<Profile> values = read();
            if (values.size() >= MAX_PROFILES) throw new IOException("Native wallet profile limit reached");
            for (Profile existing : values) {
                if (existing.ownerId.equals(profile.ownerId) || existing.vaultId.equals(profile.vaultId) ||
                    existing.solanaAddress.equals(profile.solanaAddress) || existing.bnbAddress.equalsIgnoreCase(profile.bnbAddress))
                    throw new IOException("Wallet already exists; recover its access instead of replacing it");
            }
            values.add(profile); write(values);
        }
    }

    public void replaceRecoveredAccess(String ownerId, String expectedVaultId, String newVaultId,
                                       String solanaAddress, String bnbAddress) throws Exception {
        synchronized (LOCK) {
            ArrayList<Profile> values = read();
            for (Profile p : values) if (p.vaultId.equals(newVaultId)) throw new IOException("New wrapping key required");
            for (int i = 0; i < values.size(); i++) {
                Profile existing = values.get(i);
                if (!existing.ownerId.equals(ownerId)) continue;
                if (!existing.vaultId.equals(expectedVaultId) || !existing.solanaAddress.equals(solanaAddress) ||
                    !existing.bnbAddress.equalsIgnoreCase(bnbAddress)) throw new IOException("Backup or recovery state does not match this profile");
                values.set(i, new Profile(ownerId, newVaultId, existing.name, existing.solanaAddress, existing.bnbAddress, existing.createdAt));
                write(values); return;
            }
            throw new IOException("Wallet profile missing");
        }
    }

    private ArrayList<Profile> read() throws Exception {
        byte[] bytes;
        try (FileInputStream input = file.openRead()) { bytes = DevnetWalletService.readBounded(input, 32768); }
        catch (FileNotFoundException absent) {
            // An inaccessible or interrupted existing record must not be treated as an empty registry.
            if (file.getBaseFile().exists() || new File(file.getBaseFile() + ".bak").exists() || new File(file.getBaseFile() + ".new").exists())
                throw new IOException("Wallet profiles require storage recovery", absent);
            return new ArrayList<>();
        }
        JSONObject root = new JSONObject(new String(bytes, StandardCharsets.UTF_8));
        if (!Integer.valueOf(1).equals(root.get("version"))) throw new IOException("Unsupported wallet profile registry");
        JSONArray entries = root.getJSONArray("profiles");
        if (entries.length() > MAX_PROFILES) throw new IOException("Invalid wallet profile count");
        ArrayList<Profile> result = new ArrayList<>();
        for (int i = 0; i < entries.length(); i++) {
            JSONObject value = entries.getJSONObject(i);
            if (!WalletRecoveryProfile.ID.equals(value.getString("profile"))) throw new IOException("Unsupported recovery profile");
            Object created = value.get("createdAt");
            if (!(created instanceof Long || created instanceof Integer)) throw new IOException("Invalid profile timestamp");
            Profile profile = new Profile(value.getString("ownerId"), value.getString("vaultId"), value.getString("name"),
                value.getString("solanaAddress"), value.getString("bnbAddress"), ((Number) created).longValue());
            for (Profile prior : result) {
                if (prior.ownerId.equals(profile.ownerId) || prior.vaultId.equals(profile.vaultId) ||
                    prior.solanaAddress.equals(profile.solanaAddress) || prior.bnbAddress.equalsIgnoreCase(profile.bnbAddress))
                    throw new IOException("Ambiguous wallet profile registry");
            }
            result.add(profile);
        }
        return result;
    }

    private void write(List<Profile> profiles) throws Exception {
        JSONArray entries = new JSONArray(); for (Profile profile : profiles) entries.put(profile.json());
        byte[] expected = new JSONObject().put("version", 1).put("profiles", entries).toString().getBytes(StandardCharsets.UTF_8);
        if (expected.length > 32768) throw new IOException("Wallet metadata exceeds storage limit");
        FileOutputStream output = null;
        try {
            output = file.startWrite(); output.write(expected); output.getFD().sync(); file.finishWrite(output); output = null;
            try (FileInputStream input = file.openRead()) {
                if (!Arrays.equals(expected, DevnetWalletService.readBounded(input, 32768))) throw new IOException("Wallet metadata storage failed");
            }
            WalletStorageBarrier.syncParents(file.getBaseFile(),privateRoot);
        } catch (Exception failure) { if (output != null) file.failWrite(output); throw failure; }
    }
}
