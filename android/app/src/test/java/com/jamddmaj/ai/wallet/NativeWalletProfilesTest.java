package com.jamddmaj.ai.wallet;

import android.content.Context;
import android.content.ContextWrapper;
import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import org.json.JSONException;
import org.junit.Before;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk=30)
public class NativeWalletProfilesTest {
    @Rule public TemporaryFolder folder = new TemporaryFolder();
    private Context context;
    private NativeWalletProfiles registry;
    private static String id(int value) { return String.format("%032x", value); }
    private static NativeWalletProfiles.Profile profile(int owner, int vault) {
        byte[] pub = new byte[32]; pub[31] = (byte) owner;
        return new NativeWalletProfiles.Profile(id(owner), id(vault), "Wallet " + owner,
            DevnetSolana.encode(pub), String.format("0x%040x", owner), 1000);
    }
    @Before public void setup() {
        context = new ContextWrapper(RuntimeEnvironment.getApplication()) {
            @Override public File getNoBackupFilesDir() { return folder.getRoot(); }
        };
        registry = new NativeWalletProfiles(context);
    }
    interface Check { void run() throws Exception; }
    private void rejects(Check check) throws Exception {
        try { check.run(); fail("Invalid wallet registry change accepted"); }
        catch (IOException | IllegalArgumentException | JSONException expected) {}
    }
    @Test public void profilesPersistIndependentlyAndCannotOverwrite() throws Exception {
        registry.saveRecovered(profile(1, 10)); registry.saveRecovered(profile(2, 20));
        registry = new NativeWalletProfiles(context);
        assertEquals(2, registry.list().size());
        assertEquals(id(10), registry.require(id(1)).vaultId);
        assertEquals(id(20), registry.require(id(2)).vaultId);
        rejects(() -> registry.saveRecovered(profile(1, 30)));
        assertEquals(id(10), registry.require(id(1)).vaultId);
    }
    @Test public void recoveryChangesOnlyMatchingWrappingKey() throws Exception {
        var first = profile(1, 10); registry.saveRecovered(first); registry.saveRecovered(profile(2, 20));
        registry.replaceRecoveredAccess(first.ownerId, first.vaultId, id(30), first.solanaAddress, first.bnbAddress);
        var recovered = new NativeWalletProfiles(context).require(first.ownerId);
        assertEquals(id(30), recovered.vaultId); assertEquals(first.solanaAddress, recovered.solanaAddress);
        assertEquals(first.createdAt, recovered.createdAt); assertEquals(first.name, recovered.name);
        assertEquals(id(20), registry.require(id(2)).vaultId);
        rejects(() -> registry.replaceRecoveredAccess(first.ownerId, first.vaultId, id(40), first.solanaAddress, first.bnbAddress));
    }
    @Test public void anotherWalletBackupCannotReplaceOwner() throws Exception {
        var first = profile(1, 10); var other = profile(2, 20); registry.saveRecovered(first);
        rejects(() -> registry.replaceRecoveredAccess(first.ownerId, first.vaultId, id(30), other.solanaAddress, other.bnbAddress));
        assertEquals(first.vaultId, registry.require(first.ownerId).vaultId);
        rejects(() -> first.address(WalletNetwork.SOLANA_DEVNET));
        rejects(() -> first.address(WalletNetwork.BNB_TESTNET));
    }
    @Test public void malformedStorageIsNotAnEmptyRegistry() throws Exception {
        File file = new File(folder.getRoot(), "native-wallet-profiles-v1.json");
        Files.write(file.toPath(), "{}".getBytes(StandardCharsets.UTF_8));
        rejects(() -> registry.list()); rejects(() -> registry.saveRecovered(profile(1, 10)));
        assertEquals("{}", new String(Files.readAllBytes(file.toPath()), StandardCharsets.UTF_8));
    }
    @Test public void failedAtomicWriteDoesNotReportARegisteredWallet() throws Exception {
        File file = new File(folder.getRoot(), "native-wallet-profiles-v1.json");
        assertTrue(file.mkdir()); Files.write(new File(file, "keep").toPath(), new byte[]{1});
        rejects(() -> registry.saveRecovered(profile(1, 10)));
    }
    @Test public void metadataContainsNoBackupOrSecretFields() throws Exception {
        registry.saveRecovered(profile(1, 10));
        String text = new String(Files.readAllBytes(new File(folder.getRoot(), "native-wallet-profiles-v1.json").toPath()), StandardCharsets.UTF_8);
        for (String field : new String[]{"password", "entropy", "mnemonic", "privateKey", "seed"}) assertFalse(text.contains(field));
        assertEquals(profile(1, 10).bnbAddress, registry.require(id(1)).address(WalletNetwork.BNB_MAINNET));
    }
}
