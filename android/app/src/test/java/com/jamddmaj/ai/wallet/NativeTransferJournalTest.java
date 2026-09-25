package com.jamddmaj.ai.wallet;

import android.content.Context;
import android.content.ContextWrapper;
import java.io.File;
import java.io.IOException;
import java.math.BigInteger;
import java.nio.file.Files;
import org.junit.*;
import org.junit.rules.TemporaryFolder;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk=30)
public class NativeTransferJournalTest {
    @Rule public TemporaryFolder folder = new TemporaryFolder();
    private Context context;
    private NativeWalletProfiles.Profile owner;
    private NativeTransferJournal journal;
    private static final String TX = "0x" + "1".repeat(64), OTHER = "0x" + "2".repeat(64);
    private static final String TO = "0x" + "3".repeat(40);
    @Before public void setup() throws Exception {
        context = new ContextWrapper(RuntimeEnvironment.getApplication()) { @Override public File getNoBackupFilesDir() { return folder.getRoot(); } };
        owner = new NativeWalletProfiles.Profile("1".repeat(32), "2".repeat(32), "Owner", "11111111111111111111111111111111", "0x" + "1".repeat(40), 1000);
        journal = new NativeTransferJournal(context, owner, WalletNetwork.BNB_MAINNET);
    }
    private void begin(String id) throws Exception { journal.begin(id, TO, BigInteger.ONE, BigInteger.TEN); }
    interface Check { void run() throws Exception; }
    private void rejects(Check check) throws Exception { try { check.run(); fail("Unsafe journal update accepted"); } catch (IOException | IllegalArgumentException | org.json.JSONException expected) {} }
    @Test public void uncertainBroadcastSurvivesRestartAndBlocksReplay() throws Exception {
        begin(TX); journal = new NativeTransferJournal(context, owner, WalletNetwork.BNB_MAINNET);
        assertEquals(NativeTransferJournal.Phase.UNKNOWN, journal.latest().phase);
        rejects(() -> journal.requireNoPending()); rejects(() -> begin(OTHER)); rejects(() -> begin(TX));
    }
    @Test public void onlyMatchingIdentityCanAdvanceAndTerminalStateCannotRegress() throws Exception {
        begin(TX); rejects(() -> journal.submitted(OTHER)); journal.submitted(TX);
        assertEquals(NativeTransferJournal.Phase.SUBMITTED, journal.latest().phase);
        journal.settled(TX, true); journal.requireNoPending(); rejects(() -> journal.submitted(TX)); rejects(() -> journal.settled(TX, false));
        rejects(() -> begin(TX)); begin(OTHER); assertEquals(OTHER, journal.latest().transactionId);
    }
    @Test public void networksHaveSeparateRecordsWithoutTestReuse() throws Exception {
        begin(TX); var sol = new NativeTransferJournal(context, owner, WalletNetwork.SOLANA_MAINNET);
        assertNull(sol.latest()); sol.requireNoPending();
        rejects(() -> new NativeTransferJournal(context, owner, WalletNetwork.SOLANA_DEVNET));
    }
    @Test public void storageObstructionPreventsBegin() throws Exception {
        File path = new File(folder.getRoot(), "wallet-transfers-v1/" + owner.ownerId + "/bsc-mainnet.json");
        assertTrue(path.mkdir()); Files.write(new File(path, "keep").toPath(), new byte[]{1});
        rejects(() -> begin(TX));
    }
    @Test public void corruptedOwnerMetadataCannotBeSilentlyReset() throws Exception {
        begin(TX); File path = new File(folder.getRoot(), "wallet-transfers-v1/" + owner.ownerId + "/bsc-mainnet.json");
        String text = new String(Files.readAllBytes(path.toPath()), java.nio.charset.StandardCharsets.UTF_8);
        Files.write(path.toPath(), text.replace(owner.ownerId, "9".repeat(32)).getBytes(java.nio.charset.StandardCharsets.UTF_8));
        rejects(() -> journal.latest()); rejects(() -> begin(OTHER));
    }
}
