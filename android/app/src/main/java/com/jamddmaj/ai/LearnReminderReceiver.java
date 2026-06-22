package com.jamddmaj.ai;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import java.util.Calendar;

public class LearnReminderReceiver extends BroadcastReceiver {
    private static final String CHANNEL_ID = "jamddmaj_learn_daily";

    @Override
    public void onReceive(Context context, Intent intent) {
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "JamdDmaj Learn",
                NotificationManager.IMPORTANCE_DEFAULT
            );
            channel.setDescription("Daily learning words and practice reminders");
            manager.createNotificationChannel(channel);
        }
        String title = intent.getStringExtra("title");
        String[] phrases = intent.getStringArrayExtra("phrases");
        String body = "Open JamdDmaj Learn for today's practice.";
        if (phrases != null && phrases.length > 0) {
            int day = Calendar.getInstance().get(Calendar.DAY_OF_YEAR);
            body = phrases[Math.floorMod(day, phrases.length)];
        }
        Intent openApp = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        PendingIntent contentIntent = PendingIntent.getActivity(
            context,
            12502,
            openApp,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        NotificationCompat.Builder notification = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title == null ? "JamdDmaj Learn" : title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setAutoCancel(true)
            .setContentIntent(contentIntent)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT);
        manager.notify(12503, notification.build());
    }
}
