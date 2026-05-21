package com.futurechain.anton.communication;

import android.content.pm.ApplicationInfo;
import android.os.Bundle;
import android.view.WindowManager;

import com.getcapacitor.BridgeActivity;

import com.futurechain.anton.communication.plugins.FcSecureSignerPlugin;

/**
 * MainActivity for ANTON Communication.
 *
 * SECURITY: in release builds we apply FLAG_SECURE so the app window is
 * excluded from screenshots, screen recording, and the system Recents
 * thumbnail. View-once media and disappearing messages would be
 * undermined if the OS itself snapshotted the chat. Users can still
 * describe what they see verbally; cameras pointed at the screen also
 * still work. This is best-effort defence-in-depth.
 *
 * In debug builds the flag is OFF so adb-screenshot still works for
 * development. BuildConfig.DEBUG is set by Gradle per buildType.
 */
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Register FcSecureSigner before super.onCreate (Wave 7).
        registerPlugin(FcSecureSignerPlugin.class);

        boolean isDebuggable = (getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
        if (!isDebuggable) {
            getWindow().setFlags(
                WindowManager.LayoutParams.FLAG_SECURE,
                WindowManager.LayoutParams.FLAG_SECURE
            );
        }
        super.onCreate(savedInstanceState);
    }
}
