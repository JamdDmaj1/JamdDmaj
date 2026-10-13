package com.jamddmaj.ai;

import android.net.Uri;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 28)
public class ExternalWalletPluginTest {
    private String valid() {
        return Uri.parse("https://phantom.com/ul/v1/connect").buildUpon()
            .appendQueryParameter("app_url", "https://www.jamddmaj.com/")
            .appendQueryParameter("dapp_encryption_public_key", "11111111111111111111111111111111")
            .appendQueryParameter("redirect_link", "jamddmaj://phantom?request=" + "a".repeat(32))
            .appendQueryParameter("cluster", "mainnet-beta").build().toString();
    }
    @Test public void acceptsOnlyOfficialConnectWithBoundReturn() {
        assertTrue(ExternalWalletPlugin.isAllowedConnectUri(Uri.parse(valid())));
        for (String bad : new String[] {
            valid().replace("https://phantom.com", "http://phantom.com"),
            valid().replace("https://phantom.com", "https://phantom.com.evil.example"),
            valid().replace("https://phantom.com", "https://user@phantom.com"),
            valid() + "&cluster=devnet", valid() + "#fragment", valid() + "&unknown=1",
            valid().replace("mainnet-beta", "devnet"),
            valid().replace("jamddmaj%3A%2F%2Fphantom", "evil%3A%2F%2Fphantom")
        }) assertFalse(bad, ExternalWalletPlugin.isAllowedConnectUri(Uri.parse(bad)));
    }
}
