package com.jamddmaj.ai;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.jamddmaj.ai.wallet.NativeWalletActivity;

/** Navigation only. No addresses, keys, transaction arguments or signatures cross this bridge. */
@CapacitorPlugin(name="NativeWallet")
public final class NativeWalletPlugin extends Plugin {
    public static boolean trustedPage(String url) {
        if(url==null)return false;
        Uri page=Uri.parse(url);
        return "https".equals(page.getScheme()) && "localhost".equals(page.getHost())
            && page.getPort()==-1 && page.getUserInfo()==null && "/private-simulator.html".equals(page.getPath());
    }
    @PluginMethod public void open(PluginCall call) {
        getActivity().runOnUiThread(()->{
            try {
                if(!trustedPage(getBridge().getWebView().getUrl())){call.reject("untrusted-wallet-origin");return;}
                if(Build.VERSION.SDK_INT<30){call.reject("android-11-required");return;}
                getActivity().startActivity(new Intent(getActivity(),NativeWalletActivity.class));
                call.resolve();
            } catch(Exception unavailable){call.reject("native-wallet-unavailable");}
        });
    }
}
