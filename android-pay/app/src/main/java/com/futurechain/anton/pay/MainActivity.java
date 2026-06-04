package com.futurechain.anton.pay;

import android.content.pm.ApplicationInfo;
import android.os.Bundle;
import android.view.WindowManager;

import com.getcapacitor.BridgeActivity;

import com.futurechain.anton.pay.plugins.FcSecureSignerPlugin;
import com.futurechain.anton.pay.plugins.FcDeviceAttestationPlugin;
import com.futurechain.anton.pay.bgpoll.BackgroundPollingPlugin;

/**
 * MainActivity for ANTON Pay.
 *
 * SECURITY: in release builds we apply FLAG_SECURE so the app window is
 * excluded from screenshots, screen recording, and the system Recents
 * thumbnail. A payments app showing wallet addresses and amounts
 * should not leak into OS snapshots. Users can still describe what
 * they see verbally; cameras pointed at the screen also still work.
 * This is best-effort defence-in-depth.
 *
 * In debug builds the flag is OFF so adb-screenshot still works for
 * development. BuildConfig.DEBUG is set by Gradle per buildType.
 */
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Register FcSecureSigner before super.onCreate so it's
        // available to the WebView from the first JS call. Wave 7
        // native Ed25519 signing.
        registerPlugin(FcSecureSignerPlugin.class);

        // FcDeviceAttestation — Play Integrity hook (Phase 1 scaffold;
        // Phase 2 real Play Integrity SDK wiring pending Windows
        // machine + test phone). See PAY_DEVICE_ATTESTATION_SPEC.md.
        registerPlugin(FcDeviceAttestationPlugin.class);

        // BackgroundPolling — on-device WorkManager payment poll (push-
        // notifications plan, Phase 2). Notifies on incoming payments while
        // the app is backgrounded/killed, using only the public get_utxos read.
        registerPlugin(BackgroundPollingPlugin.class);

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
