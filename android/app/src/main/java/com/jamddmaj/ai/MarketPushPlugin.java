package com.jamddmaj.ai;

import android.Manifest;
import android.os.Build;
import android.net.Uri;
import com.getcapacitor.*;
import com.getcapacitor.annotation.*;
import com.google.firebase.FirebaseApp;
import com.google.firebase.messaging.FirebaseMessaging;

/** Device registration only. No account, wallet, signing or transaction access. */
@CapacitorPlugin(name="MarketPush", permissions={@Permission(alias="notifications",strings={Manifest.permission.POST_NOTIFICATIONS})})
public class MarketPushPlugin extends Plugin {
    private boolean trusted() {
        if (!"com.jamddmaj.ai".equals(getContext().getPackageName())) return false;
        String url=getBridge().getWebView().getUrl();
        if (url==null) return false;
        Uri u=Uri.parse(url);
        return "https".equals(u.getScheme()) && ("localhost".equals(u.getHost()) || "www.jamddmaj.com".equals(u.getHost())) && (u.getPort()==-1 || u.getPort()==443);
    }
    private boolean configured() { try { return "jamddmaj-2afc8".equals(FirebaseApp.getInstance().getOptions().getProjectId()); } catch (IllegalStateException e) { return false; } }
    private boolean permitted() { return Build.VERSION.SDK_INT<33 || getPermissionState("notifications")==PermissionState.GRANTED; }
    @PluginMethod public void status(PluginCall call) { getActivity().runOnUiThread(()->{
        if(!trusted()){call.reject("PUSH_ORIGIN");return;}
        JSObject out=new JSObject();out.put("configured",configured());out.put("granted",permitted());
        out.put("enabled",getContext().getSharedPreferences("market-push",0).getBoolean("enabled",false));call.resolve(out);
    }); }
    @PluginMethod public void register(PluginCall call) { getActivity().runOnUiThread(()->{
        if(!trusted()||!configured()){call.reject("PUSH_NOT_CONFIGURED");return;}
        if(!permitted()){requestPermissionForAlias("notifications",call,"permissionResult");return;}
        registerOnUi(call);
    }); }
    @PermissionCallback private void permissionResult(PluginCall call) { getActivity().runOnUiThread(()->{
        if(!trusted()||!permitted()){call.reject("PUSH_PERMISSION_DENIED");return;}registerOnUi(call);
    }); }
    private void registerOnUi(PluginCall call) {
        if(!configured()){call.reject("PUSH_NOT_CONFIGURED");return;}
        FirebaseMessaging.getInstance().getToken().addOnCompleteListener(task->{
            if(!task.isSuccessful()||task.getResult()==null){call.reject("PUSH_REGISTRATION_UNAVAILABLE");return;}
            // Registration token must only be sent to the authenticated subscription API; never logged.
            JSObject out=new JSObject();out.put("token",task.getResult());out.put("projectId","jamddmaj-2afc8");call.resolve(out);
        });
    }
    @PluginMethod public void setEnabled(PluginCall call) { getActivity().runOnUiThread(()->{
        if(!trusted()||!configured()){call.reject("PUSH_NOT_CONFIGURED");return;}
        boolean enabled=Boolean.TRUE.equals(call.getBoolean("enabled",false));
        if(enabled&&!permitted()){call.reject("PUSH_PERMISSION_DENIED");return;}
        getContext().getSharedPreferences("market-push",0).edit().putBoolean("enabled",enabled).apply();call.resolve();
    }); }
    @PluginMethod public void unregister(PluginCall call) { getActivity().runOnUiThread(()->{
        if(!trusted()){call.reject("PUSH_ORIGIN");return;}
        getContext().getSharedPreferences("market-push",0).edit().putBoolean("enabled",false).apply();
        if(!configured()){call.resolve();return;}
        FirebaseMessaging.getInstance().setAutoInitEnabled(false);
        FirebaseMessaging.getInstance().deleteToken().addOnCompleteListener(task->{if(task.isSuccessful())call.resolve();else call.reject("PUSH_UNREGISTER_UNAVAILABLE");});
    }); }
}
