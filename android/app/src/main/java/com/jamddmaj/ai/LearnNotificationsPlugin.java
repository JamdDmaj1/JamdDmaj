package com.jamddmaj.ai;

import android.Manifest;
import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.List;

@CapacitorPlugin(
    name = "LearnNotifications",
    permissions = {
        @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS })
    }
)
public class LearnNotificationsPlugin extends Plugin {
    private static final int REQUEST_CODE = 12501;

    @PluginMethod
    public void requestNotificationPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            call.resolve(permissionResult(true));
            return;
        }
        if (getPermissionState("notifications") == PermissionState.GRANTED) {
            call.resolve(permissionResult(true));
            return;
        }
        requestPermissionForAlias("notifications", call, "notificationPermissionCallback");
    }

    @PermissionCallback
    private void notificationPermissionCallback(PluginCall call) {
        call.resolve(permissionResult(getPermissionState("notifications") == PermissionState.GRANTED));
    }

    @PluginMethod
    public void scheduleDaily(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
            && getPermissionState("notifications") != PermissionState.GRANTED) {
            call.reject("Notification permission is required.");
            return;
        }
        int hour = clamp(call.getInt("hour", 9), 0, 23);
        int minute = clamp(call.getInt("minute", 0), 0, 59);
        String title = call.getString("title", "JamdDmaj Learn");
        String[] phrases = readPhrases(call.getArray("phrases"));
        if (phrases.length == 0) phrases = new String[] { "Open JamdDmaj Learn for today's practice." };

        Intent intent = new Intent(getContext(), LearnReminderReceiver.class);
        intent.putExtra("title", title);
        intent.putExtra("phrases", phrases);
        PendingIntent pendingIntent = PendingIntent.getBroadcast(
            getContext(),
            REQUEST_CODE,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        Calendar next = Calendar.getInstance();
        next.set(Calendar.HOUR_OF_DAY, hour);
        next.set(Calendar.MINUTE, minute);
        next.set(Calendar.SECOND, 0);
        next.set(Calendar.MILLISECOND, 0);
        if (next.getTimeInMillis() <= System.currentTimeMillis()) next.add(Calendar.DAY_OF_YEAR, 1);
        AlarmManager alarms = (AlarmManager) getContext().getSystemService(Context.ALARM_SERVICE);
        alarms.setInexactRepeating(
            AlarmManager.RTC_WAKEUP,
            next.getTimeInMillis(),
            AlarmManager.INTERVAL_DAY,
            pendingIntent
        );
        JSObject result = new JSObject();
        result.put("scheduled", true);
        result.put("nextAt", next.getTimeInMillis());
        call.resolve(result);
    }

    @PluginMethod
    public void cancelDaily(PluginCall call) {
        Intent intent = new Intent(getContext(), LearnReminderReceiver.class);
        PendingIntent pendingIntent = PendingIntent.getBroadcast(
            getContext(),
            REQUEST_CODE,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        AlarmManager alarms = (AlarmManager) getContext().getSystemService(Context.ALARM_SERVICE);
        alarms.cancel(pendingIntent);
        pendingIntent.cancel();
        call.resolve();
    }

    private JSObject permissionResult(boolean granted) {
        JSObject result = new JSObject();
        result.put("granted", granted);
        return result;
    }

    private String[] readPhrases(JSArray array) {
        if (array == null) return new String[0];
        List<String> values = new ArrayList<>();
        try {
            for (int index = 0; index < array.length() && values.size() < 20; index++) {
                String value = array.getString(index);
                if (value != null && !value.trim().isEmpty()) values.add(value.trim());
            }
        } catch (Exception ignored) {}
        return values.toArray(new String[0]);
    }

    private int clamp(int value, int minimum, int maximum) {
        return Math.min(maximum, Math.max(minimum, value));
    }
}
