package com.jamddmaj.ai.wallet;
import com.jamddmaj.ai.NativeWalletPlugin;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;
@RunWith(RobolectricTestRunner.class)
@Config(sdk=30)
public class NativeWalletOriginTest {
    @Test public void onlyBundledTerminalMayOpenNativeScreen(){
        assertTrue(NativeWalletPlugin.trustedPage("https://localhost/private-simulator.html#lang=es"));
        for(String url:new String[]{null,"http://localhost/private-simulator.html","https://www.jamddmaj.com/private-simulator.html","https://localhost.evil.example/private-simulator.html","https://localhost:443/private-simulator.html","https://user@localhost/private-simulator.html","https://localhost/index.html"})
            assertFalse(NativeWalletPlugin.trustedPage(url));
    }
}
