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
    private static final String PHANTOM_HOST = "phantom.com";
    private static final String PHANTOM_CONNECT_PATH = "/ul/v1/connect";

    static boolean isAllowedConnectUri(Uri uri) {
        try {
            if (!"https".equals(uri.getScheme()) || !PHANTOM_HOST.equals(uri.getHost())
                || !PHANTOM_CONNECT_PATH.equals(uri.getPath()) || uri.getUserInfo() != null
                || uri.getPort() != -1 || uri.getFragment() != null) return false;
            for (String key : uri.getQueryParameterNames()) {
                if (!java.util.Arrays.asList("app_url", "dapp_encryption_public_key", "redirect_link", "cluster").contains(key)
                    || uri.getQueryParameters(key).size() != 1) return false;
            }
            if (!"https://www.jamddmaj.com/".equals(uri.getQueryParameter("app_url"))
                || !"mainnet-beta".equals(uri.getQueryParameter("cluster"))) return false;
            String encryptionKey = uri.getQueryParameter("dapp_encryption_public_key");
            if (encryptionKey == null || !encryptionKey.matches("[1-9A-HJ-NP-Za-km-z]{32,44}")) return false;
            String redirectValue = uri.getQueryParameter("redirect_link");
            if (redirectValue == null) return false;
            Uri redirect = Uri.parse(redirectValue);
            return "jamddmaj".equals(redirect.getScheme()) && "phantom".equals(redirect.getHost())
                && redirect.getUserInfo() == null && redirect.getPort() == -1 && redirect.getFragment() == null
                && "".equals(redirect.getPath()) && redirect.getQueryParameterNames().size() == 1 && redirect.getQueryParameterNames().contains("request")
                && redirect.getQueryParameters("request").size() == 1
                && redirect.getQueryParameter("request").matches("[a-f0-9]{32}");
        } catch (RuntimeException invalid) { return false; }
    }

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

        if (!isAllowedConnectUri(uri)) {
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
