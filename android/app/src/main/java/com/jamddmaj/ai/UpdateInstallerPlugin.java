package com.jamddmaj.ai;

import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.net.Uri;
import android.os.Environment;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;

@CapacitorPlugin(name = "UpdateInstaller")
public class UpdateInstallerPlugin extends Plugin {
    private long downloadId = -1L;

    @PluginMethod
    public void canInstall(PluginCall call) {
        JSObject result = new JSObject();
        result.put("allowed", getContext().getPackageManager().canRequestPackageInstalls());
        call.resolve(result);
    }

    @PluginMethod
    public void openSettings(PluginCall call) {
        Intent intent = new Intent(android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }

    @PluginMethod
    public void install(PluginCall call) {
        String url = call.getString("url", "");
        if (url == null || !url.startsWith("https://")) { call.reject("HTTPS URL required"); return; }
        DownloadManager manager = (DownloadManager) getContext().getSystemService(Context.DOWNLOAD_SERVICE);
        if (manager == null) { call.reject("download-unavailable"); return; }
        DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
        request.setTitle("JamdDmaj");
        request.setDescription("Actualizacion de la app");
        request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE);
        request.setDestinationInExternalFilesDir(getContext(), Environment.DIRECTORY_DOWNLOADS, "updates/jamddmaj-update.apk");
        downloadId = manager.enqueue(request);
        BroadcastReceiver receiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                if (intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1L) != downloadId) return;
                try { context.unregisterReceiver(this); } catch (Exception ignored) {}
                File apk = new File(getContext().getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), "updates/jamddmaj-update.apk");
                if (!apk.exists() || apk.length() < 1024) { notifyListeners("installError", new JSObject().put("message", "download-missing")); return; }
                Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", apk);
                Intent installer = new Intent(Intent.ACTION_VIEW);
                installer.setDataAndType(uri, "application/vnd.android.package-archive");
                installer.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(installer);
            }
        };
        ContextCompat.registerReceiver(getContext(), receiver, new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE), ContextCompat.RECEIVER_EXPORTED);
        call.resolve();
    }
}
