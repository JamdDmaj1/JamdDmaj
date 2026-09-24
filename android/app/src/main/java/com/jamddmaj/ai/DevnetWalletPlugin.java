package com.jamddmaj.ai;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.jamddmaj.ai.wallet.DevnetWalletActivity;

/** Navigation only: no key, account, transfer, signing or import API. */
@CapacitorPlugin(name="DevnetWallet")
public final class DevnetWalletPlugin extends Plugin {
    @PluginMethod public void open(PluginCall call) {
        getActivity().runOnUiThread(()->{
            try {
                Uri page=Uri.parse(getBridge().getWebView().getUrl());
                if(!"https".equals(page.getScheme())||!"localhost".equals(page.getHost())
                    ||page.getPort()!=-1||!"/private-simulator.html".equals(page.getPath())) {
                    call.reject("untrusted-wallet-origin");return;
                }
                if(Build.VERSION.SDK_INT<30){call.reject("android-11-required");return;}
                // No arguments or extras are forwarded from web content.
                getActivity().startActivity(new Intent(getActivity(),DevnetWalletActivity.class));
                call.resolve();
            } catch(Exception unavailable){call.reject("native-test-wallet-unavailable");}
        });
    }
}
