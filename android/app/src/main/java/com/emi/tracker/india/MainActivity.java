package com.emi.tracker.india;

import android.os.Bundle;
import android.view.View;
import androidx.core.view.WindowCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Enable edge-to-edge: app content draws behind the status bar
        // This makes the status bar transparent and seamlessly blends with the app header
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
    }
}
