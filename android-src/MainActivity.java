package com.miqyaslabs.stratum4d;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Stratum's own plugins must be registered before the bridge starts.
        registerPlugin(PrintPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
