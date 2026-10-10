package com.biteric.finance;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // App-local plugins must be registered before super.onCreate().
        registerPlugin(PrintPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
