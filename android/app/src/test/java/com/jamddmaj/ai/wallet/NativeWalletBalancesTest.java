package com.jamddmaj.ai.wallet;

import java.io.IOException;
import java.math.BigInteger;
import java.time.Duration;
import java.util.ArrayList;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import org.robolectric.shadows.ShadowSystemClock;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk=30)
public class NativeWalletBalancesTest {
    private static final String SOL = "11111111111111111111111111111111";
    private static final String EVM = "0x0000000000000000000000000000000000000001";
    interface Check { void run() throws Exception; }
    private void rejects(Check check) throws Exception {
        try { check.run(); fail("Invalid balance accepted"); }
        catch (IOException | IllegalArgumentException expected) {}
    }
    @Test public void zeroIsRealOnlyAfterVerifiedResponse() throws Exception {
        ArrayList<String> calls = new ArrayList<>();
        NativeWalletBalances service = new NativeWalletBalances((network, method, params) -> {
            assertEquals(WalletNetwork.BNB_MAINNET, network); calls.add(method);
            if (method.equals("eth_chainId")) return "0x38";
            assertEquals("eth_getBalance", method); assertEquals(EVM, params.getString(0));
            return "0x0";
        });
        var balance = service.read(WalletNetwork.BNB_MAINNET, EVM);
        assertEquals(BigInteger.ZERO, balance.units); assertEquals("0.000000000000000000", balance.decimalAmount());
        assertEquals(java.util.Arrays.asList("eth_chainId", "eth_getBalance", "eth_chainId"), calls);
        assertTrue(balance.isFresh()); ShadowSystemClock.advanceBy(Duration.ofSeconds(31)); assertFalse(balance.isFresh());
    }
    @Test public void wrongNetworkFailsBeforeBalance() throws Exception {
        NativeWalletBalances service = new NativeWalletBalances((network, method, params) -> {
            assertEquals("eth_chainId", method); return "0x61";
        });
        rejects(() -> service.read(WalletNetwork.BNB_MAINNET, EVM));
    }
    @Test public void networkChangeDuringReadDoesNotPublishBalance() throws Exception {
        int[] identityReads = {0};
        NativeWalletBalances service = new NativeWalletBalances((network, method, params) -> {
            if (method.equals("eth_chainId")) return ++identityReads[0] == 1 ? "0x38" : "0x61";
            return "0x123";
        });
        rejects(() -> service.read(WalletNetwork.BNB_MAINNET, EVM));
        assertEquals(2, identityReads[0]);
    }
    @Test public void exactSolanaAndBnbAmountsRetainSmallestUnit() throws Exception {
        var sol = new NativeWalletBalances((network, method, params) -> method.equals("getGenesisHash") ?
            "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d" : new JSONObject().put("value", 1));
        assertEquals("0.000000001", sol.read(WalletNetwork.SOLANA_MAINNET, SOL).decimalAmount());
        var bnb = new NativeWalletBalances((network, method, params) -> method.equals("eth_chainId") ? "0x61" : "0x1");
        assertEquals("0.000000000000000001", bnb.read(WalletNetwork.BNB_TESTNET, EVM).decimalAmount());
    }
    @Test public void providerFailuresAreNotConvertedToZero() throws Exception {
        var offline = new NativeWalletBalances((network, method, params) -> { throw new IOException("offline"); });
        rejects(() -> offline.read(WalletNetwork.SOLANA_MAINNET, SOL));
        var malformed = new NativeWalletBalances((network, method, params) -> method.equals("eth_chainId") ? "0x38" : JSONObject.NULL);
        rejects(() -> malformed.read(WalletNetwork.BNB_MAINNET, EVM));
    }
    @Test public void malformedOrRoundedUnitsAreRejected() throws Exception {
        for (Object value : new Object[]{null, 1.0, -1, "1", BigInteger.ONE.shiftLeft(64)})
            rejects(() -> NativeWalletBalances.solanaUnits(value));
        for (Object value : new Object[]{null, 1, "0x", "0x00", "0x01", "-1", "1e18", "0x" + "f".repeat(65)})
            rejects(() -> NativeWalletBalances.evmUnits(value));
        assertEquals(BigInteger.ONE.shiftLeft(256).subtract(BigInteger.ONE), NativeWalletBalances.evmUnits("0x" + "f".repeat(64)));
    }
    @Test public void malformedAddressesNeverReachProvider() throws Exception {
        var service = new NativeWalletBalances((network, method, params) -> { throw new AssertionError("Unexpected request"); });
        rejects(() -> service.read(WalletNetwork.BNB_MAINNET, SOL));
        rejects(() -> service.read(WalletNetwork.SOLANA_MAINNET, EVM));
        rejects(() -> service.read(null, EVM));
    }
}
