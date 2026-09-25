package com.jamddmaj.ai.wallet;

import android.content.Context;
import android.content.ContextWrapper;
import android.util.Base64;
import java.io.File;
import java.io.IOException;
import java.math.BigInteger;
import java.time.Duration;
import java.util.Arrays;
import org.json.*;
import org.junit.*;
import org.junit.rules.TemporaryFolder;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;
import org.robolectric.shadows.ShadowSystemClock;
import static org.junit.Assert.*;

/** Public disposable signer fixture and fake transport only. No network or real funds. */
@RunWith(RobolectricTestRunner.class)
@Config(sdk=30)
public class SolanaNativeTransfersTest {
    @Rule public TemporaryFolder folder = new TemporaryFolder();
    private Context context;
    private NativeWalletProfiles.Profile owner;
    private SolanaNativeTransfers service;
    private Rpc rpc;
    private byte[] fixture;
    private String recipient;
    private final SolanaNativeTransfers.Signer signer = new SolanaNativeTransfers.Signer() {
        public String address(byte[] value) { return DevnetSolana.address(value); }
        public byte[] sign(byte[] value, byte[] message) { return DevnetSolana.sign(value, message); }
    };
    @Before public void setup() throws Exception {
        context = new ContextWrapper(RuntimeEnvironment.getApplication()) { @Override public File getNoBackupFilesDir() { return folder.getRoot(); } };
        fixture = new byte[32]; Arrays.fill(fixture, (byte) 51);
        byte[] to = new byte[32]; Arrays.fill(to, (byte) 52); recipient = DevnetSolana.encode(to);
        owner = new NativeWalletProfiles.Profile("1".repeat(32), "2".repeat(32), "Test fixture", DevnetSolana.address(fixture), "0x" + "1".repeat(40), 1000);
        rpc = new Rpc(); service = new SolanaNativeTransfers(context, owner, rpc);
    }
    private class Rpc implements NativeWalletRpc.Transport {
        String genesis = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d", confirmation = "processed";
        long funds = 5000000000L, fee = 5000, height = 1;
        boolean timeout, simulationFailure, failed;
        int sends, signatures;
        public Object request(String method, JSONArray params) throws Exception {
            switch (method) {
                case "getGenesisHash": return genesis;
                case "getBalance": return new JSONObject().put("value", funds);
                case "getLatestBlockhash": return new JSONObject().put("value", new JSONObject().put("blockhash", "11111111111111111111111111111111").put("lastValidBlockHeight", 100));
                case "getFeeForMessage": return new JSONObject().put("value", fee);
                case "getBlockHeight": return height;
                case "simulateTransaction": if (params.getJSONObject(1).getBoolean("sigVerify")) signatures++;
                    return new JSONObject().put("value", new JSONObject().put("err", simulationFailure ? "failure" : JSONObject.NULL));
                case "sendTransaction":
                    sends++;
                    assertEquals(NativeTransferJournal.Phase.UNKNOWN, new NativeTransferJournal(context, owner, WalletNetwork.SOLANA_MAINNET).latest().phase);
                    assertFalse(params.getJSONObject(1).getBoolean("skipPreflight"));
                    assertEquals(0, params.getJSONObject(1).getInt("maxRetries"));
                    if (timeout) throw new IOException("Unknown broadcast result");
                    return DevnetSolana.encode(Arrays.copyOfRange(Base64.decode(params.getString(0), Base64.DEFAULT), 1, 65));
                case "getSignatureStatuses": return new JSONObject().put("value", new JSONArray().put(new JSONObject()
                    .put("confirmationStatus", confirmation).put("err", failed ? "failure" : JSONObject.NULL)));
                default: throw new AssertionError("Unexpected method " + method);
            }
        }
    }
    interface Check { void run() throws Exception; }
    private void rejects(Check action) throws Exception { try { action.run(); fail("Unsafe transfer accepted"); } catch (IOException | IllegalArgumentException expected) {} }
    private SolanaNativeTransfers.Draft draft() throws Exception { return service.prepare(recipient, "1.000000001"); }
    @Test public void prepareAndSignDoNotBroadcastAndAmountIsNotDevnetCapped() throws Exception {
        var draft = draft(); assertEquals(new BigInteger("1000000001"), draft.units);
        assertEquals(64, service.signReviewed(draft, fixture, signer).length);
        assertEquals(0, rpc.sends); assertEquals(0, rpc.signatures);
    }
    @Test public void manualSubmissionRecordsBeforeSendAndConfirmsSeparately() throws Exception {
        var draft = draft(); byte[] signature = service.signReviewed(draft, fixture, signer);
        service.submit(draft, signature, () -> true); assertEquals(1, rpc.sends); assertEquals(1, rpc.signatures);
        assertEquals(NativeTransferJournal.Phase.SUBMITTED, service.checkLatest().phase);
        rpc.confirmation = "finalized"; assertEquals(NativeTransferJournal.Phase.CONFIRMED, service.checkLatest().phase);
        rejects(() -> service.submit(draft, signature, () -> true)); assertEquals(1, rpc.sends);
    }
    @Test public void broadcastTimeoutBlocksReplayAcrossRestart() throws Exception {
        var draft = draft(); rpc.timeout = true;
        rejects(() -> service.submit(draft, service.signReviewed(draft, fixture, signer), () -> true));
        service = new SolanaNativeTransfers(context, owner, rpc); rejects(() -> draft());
        assertEquals(NativeTransferJournal.Phase.UNKNOWN, service.checkLatest().phase); assertEquals(1, rpc.sends);
    }
    @Test public void wrongNetworkBalanceAndSimulationFailBeforeSigning() throws Exception {
        rpc.genesis = DevnetWalletService.GENESIS; rejects(() -> draft());
        rpc.genesis = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d"; rpc.funds = 0; rejects(() -> draft());
        rpc.funds = 5000000000L; rpc.simulationFailure = true; rejects(() -> draft()); assertEquals(0, rpc.sends);
    }
    @Test public void changedFeeAndExpiredBlockhashRequireNewReview() throws Exception {
        var first = draft(); byte[] signature = service.signReviewed(first, fixture, signer); rpc.fee++;
        rejects(() -> service.submit(first, signature, () -> true)); rpc.fee--;
        var second = draft(); rpc.height = 101;
        rejects(() -> service.submit(second, service.signReviewed(second, fixture, signer), () -> true)); assertEquals(0, rpc.sends);
    }
    @Test public void lockedExpiredOrWrongSignatureCannotSend() throws Exception {
        var first = draft(); rejects(() -> service.submit(first, service.signReviewed(first, fixture, signer), () -> false));
        var second = draft(); rejects(() -> service.submit(second, new byte[64], () -> true));
        var third = draft(); ShadowSystemClock.advanceBy(Duration.ofSeconds(61)); rejects(() -> service.signReviewed(third, fixture, signer));
        assertEquals(0, rpc.sends);
    }
    @Test public void pendingFailureIsNotFinalUntilConfirmed() throws Exception {
        var draft = draft(); service.submit(draft, service.signReviewed(draft, fixture, signer), () -> true);
        rpc.failed = true; assertEquals(NativeTransferJournal.Phase.SUBMITTED, service.checkLatest().phase);
        rpc.confirmation = "finalized"; assertEquals(NativeTransferJournal.Phase.FAILED, service.checkLatest().phase);
    }
    @Test public void anotherWalletCannotSignReviewedTransaction() throws Exception {
        var draft = draft(); rejects(() -> service.signReviewed(draft, new byte[32], signer)); assertEquals(0, rpc.sends);
    }
}
