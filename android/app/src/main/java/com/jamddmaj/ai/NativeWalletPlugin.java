package com.jamddmaj.ai;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.JSObject;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.jamddmaj.ai.wallet.NativeWalletActivity;
import com.jamddmaj.ai.wallet.NativeWalletPublicSelection;

/** Navigation and public account display only. No vault, signing or transaction arguments. */
@CapacitorPlugin(name="NativeWallet")
public final class NativeWalletPlugin extends Plugin {
    @PluginMethod public void getPublicAccount(PluginCall call){
        try{
            if(!trustedPage(getBridge().getWebView().getUrl())){call.reject("untrusted-wallet-origin");return;}
            call.resolve(new JSObject(new NativeWalletPublicSelection(getContext()).publicAccount().toString()));
        }catch(Exception unavailable){call.reject("native-public-account-unavailable");}
    }
    public static boolean trustedPage(String url) {
        if(url==null)return false;
        Uri page=Uri.parse(url);
        return "https".equals(page.getScheme()) && "localhost".equals(page.getHost())
            && page.getPort()==-1 && page.getUserInfo()==null && "/private-simulator.html".equals(page.getPath());
    }
    @PluginMethod public void open(PluginCall call) {
        openScreen(call,false);
    }
    @PluginMethod public void openSwap(PluginCall call) {
        openScreen(call,true);
    }
    private void openScreen(PluginCall call,boolean swap) {
        getActivity().runOnUiThread(()->{
            try {
                if(!trustedPage(getBridge().getWebView().getUrl())){call.reject("untrusted-wallet-origin");return;}
                if(Build.VERSION.SDK_INT<30){call.reject("android-11-required");return;}
                Intent screen=new Intent(getActivity(),NativeWalletActivity.class);
                if(swap)screen.putExtra("wallet-navigation","swap");
                getActivity().startActivity(screen);
                call.resolve();
            } catch(Exception unavailable){call.reject("native-wallet-unavailable");}
        });
    }
}
