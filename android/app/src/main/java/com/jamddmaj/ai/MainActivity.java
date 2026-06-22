package com.jamddmaj.ai;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(LearnNotificationsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
