package com.jamddmaj.ai;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(LearnNotificationsPlugin.class);
        registerPlugin(ExternalWalletPlugin.class);
        registerPlugin(DevnetWalletPlugin.class);
        registerPlugin(NativeWalletPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
