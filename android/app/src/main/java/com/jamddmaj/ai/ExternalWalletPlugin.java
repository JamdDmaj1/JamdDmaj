package com.jamddmaj.ai;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "ExternalWallet")
public class ExternalWalletPlugin extends Plugin {
    private static final String PHANTOM_PACKAGE = "app.phantom";
    private static final String PHANTOM_HOST = "phantom.app";
    private static final String PHANTOM_CONNECT_PATH = "/ul/v1/connect";

    @PluginMethod
    public void openPhantom(PluginCall call) {
        String rawUrl = call.getString("url", "");
        if (rawUrl.length() == 0 || rawUrl.length() > 12_000) {
            call.reject("invalid-phantom-url");
            return;
        }

        final Uri uri;
        try {
            uri = Uri.parse(rawUrl);
        } catch (RuntimeException error) {
            call.reject("invalid-phantom-url");
            return;
        }

        if (!"https".equals(uri.getScheme())
            || !PHANTOM_HOST.equals(uri.getHost())
            || !PHANTOM_CONNECT_PATH.equals(uri.getPath())) {
            call.reject("invalid-phantom-url");
            return;
        }

        Intent intent = new Intent(Intent.ACTION_VIEW, uri);
        intent.setPackage(PHANTOM_PACKAGE);
        intent.addCategory(Intent.CATEGORY_BROWSABLE);
        try {
            getActivity().startActivity(intent);
            call.resolve();
        } catch (ActivityNotFoundException error) {
            call.reject("phantom-not-installed");
        } catch (SecurityException error) {
            call.reject("phantom-launch-blocked");
        }
    }
}
