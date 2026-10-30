package com.jamddmaj.ai;

import android.Manifest;
import android.app.*;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

/** Data-only user-visible notices. Notification clicks never execute financial actions. */
public class MarketPushService extends FirebaseMessagingService {
    static final String CHANNEL="jamddmaj-market-alerts";
    @Override public void onMessageReceived(RemoteMessage message) {
        if(!"com.jamddmaj.ai".equals(getPackageName()) || !getSharedPreferences("market-push",0).getBoolean("enabled",false))return;
        if(Build.VERSION.SDK_INT>=33 && ContextCompat.checkSelfPermission(this,Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)return;
        String kind=message.getData().get("kind"),body=message.getData().get("body"),id=message.getData().get("eventId");
        if(!("price".equals(kind)||"signal".equals(kind)||"test".equals(kind))||body==null||body.length()>240||id==null||!id.matches("[a-zA-Z0-9_-]{8,100}"))return;
        if(Build.VERSION.SDK_INT>=26)getSystemService(NotificationManager.class).createNotificationChannel(new NotificationChannel(CHANNEL,"JamdDmaj alerts",NotificationManager.IMPORTANCE_DEFAULT));
        Intent intent=new Intent(this,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP|Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent open=PendingIntent.getActivity(this,0,intent,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        NotificationCompat.Builder notice=new NotificationCompat.Builder(this,CHANNEL).setSmallIcon(android.R.drawable.ic_dialog_info).setContentTitle("JamdDmaj").setContentText(body).setStyle(new NotificationCompat.BigTextStyle().bigText(body)).setAutoCancel(true).setContentIntent(open).setVisibility(NotificationCompat.VISIBILITY_PRIVATE);
        NotificationManagerCompat.from(this).notify(id.hashCode(),notice.build());
    }
}
