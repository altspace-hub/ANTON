/*
 * FcDeviceAttestationPlugin — Capacitor plugin for Play Integrity.
 *
 * Spec: docs/PAY_DEVICE_ATTESTATION_SPEC.md
 *
 * Phase 2 (real Play Integrity SDK calls — shipped 2026-05-24,
 * pending APK build + phone E2E test on the Windows machine).
 *
 * What changed vs the Phase 1 scaffold:
 *   • isAvailable() now probes Google Play Services and the cached
 *     cloud project number; returns true iff both are usable. Falls
 *     back to false on emulators or devices without Play Services,
 *     which makes the JS layer use the dev-mode token (which Bahnhof
 *     rejects in prod — exactly the desired failure mode).
 *   • requestIntegrityToken() calls Google's IntegrityManager with
 *     the supplied nonce + the cloud project number declared in
 *     AndroidManifest.xml. The returned token is the raw JWS that
 *     Bahnhof's /attest decodes via google-api-python-client.
 *
 * Build wiring (app/build.gradle):
 *
 *   implementation 'com.google.android.play:integrity:1.4.0'
 *
 * Manifest wiring (AndroidManifest.xml under <application>):
 *
 *   <meta-data
 *     android:name="com.google.android.play.integrity.PROJECT_NUMBER"
 *     android:value="@string/google_cloud_project_number"/>
 *
 * Server-side setup: see bahnhof/docs/PLAY_INTEGRITY_PROD_SETUP.md
 * for the Google Cloud project + service account configuration.
 *
 * Registered in MainActivity.onCreate():
 *   registerPlugin(FcDeviceAttestationPlugin.class);
 */
package com.futurechain.anton.pay.plugins;

import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.os.Bundle;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.common.ConnectionResult;
import com.google.android.gms.common.GoogleApiAvailability;
import com.google.android.play.core.integrity.IntegrityManager;
import com.google.android.play.core.integrity.IntegrityManagerFactory;
import com.google.android.play.core.integrity.IntegrityTokenRequest;
import com.google.android.play.core.integrity.IntegrityTokenResponse;

@CapacitorPlugin(name = "FcDeviceAttestation")
public class FcDeviceAttestationPlugin extends Plugin {

    /** AndroidManifest meta-data key that holds the Google Cloud project
     *  number Play Integrity binds verdicts to. The same number must be
     *  set on Bahnhof as GOOGLE_CLOUD_PROJECT_NUMBER. */
    private static final String META_PROJECT_NUMBER =
        "com.google.android.play.integrity.PROJECT_NUMBER";

    /**
     * Probe whether this device can produce a real Play Integrity
     * token. Two conditions:
     *   (a) Google Play Services is installed + up to date
     *   (b) The cloud project number is configured in the manifest
     *
     * If either fails, JS layer falls back to the dev-mode token.
     * Bahnhof rejects dev-mode tokens in production with BAHNHOF_DEV_ATTESTATION_ALLOWED unset
     * — so an emulator or stripped APK gets a clear "device security check
     * failed" UX instead of a silent bypass.
     */
    @PluginMethod
    public void isAvailable(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("available", computeAvailable());
        call.resolve(ret);
    }

    private boolean computeAvailable() {
        try {
            // (a) Google Play Services check.
            GoogleApiAvailability gaa = GoogleApiAvailability.getInstance();
            int status = gaa.isGooglePlayServicesAvailable(getContext());
            if (status != ConnectionResult.SUCCESS) {
                return false;
            }
            // (b) Cloud project number must be present in the manifest.
            return getCloudProjectNumber() > 0L;
        } catch (Exception e) {
            return false;
        }
    }

    private long getCloudProjectNumber() throws PackageManager.NameNotFoundException {
        ApplicationInfo info = getContext().getPackageManager()
            .getApplicationInfo(
                getContext().getPackageName(),
                PackageManager.GET_META_DATA
            );
        Bundle meta = info.metaData;
        if (meta == null) return 0L;
        // Accept either a long (preferred) or a string the Play console
        // sometimes emits — coerce defensively.
        if (meta.containsKey(META_PROJECT_NUMBER)) {
            Object raw = meta.get(META_PROJECT_NUMBER);
            if (raw instanceof Long) return (Long) raw;
            if (raw instanceof Integer) return ((Integer) raw).longValue();
            if (raw instanceof String) {
                try {
                    return Long.parseLong((String) raw);
                } catch (NumberFormatException e) {
                    return 0L;
                }
            }
        }
        return 0L;
    }

    /**
     * Request a Play Integrity verdict token for the given nonce. The
     * returned token is the raw JWS string that Bahnhof's /attest
     * endpoint decodes via the Google Play Integrity API.
     *
     * The call is asynchronous — Google's IntegrityManager returns a
     * Task that fires either addOnSuccessListener (with the token) or
     * addOnFailureListener (with an exception). We bridge both to the
     * Capacitor PluginCall.
     */
    @PluginMethod
    public void requestIntegrityToken(PluginCall call) {
        String nonce = call.getString("nonce");
        if (nonce == null || nonce.length() < 16) {
            call.reject("nonce must be at least 16 chars");
            return;
        }
        if (!computeAvailable()) {
            call.reject(
                "FcDeviceAttestation unavailable: Google Play Services missing "
                + "or PROJECT_NUMBER not set in AndroidManifest"
            );
            return;
        }
        long cloudProjectNumber;
        try {
            cloudProjectNumber = getCloudProjectNumber();
        } catch (PackageManager.NameNotFoundException e) {
            call.reject("FcDeviceAttestation: cannot read package metadata", e);
            return;
        }
        try {
            IntegrityManager manager =
                IntegrityManagerFactory.create(getContext());
            IntegrityTokenRequest request = IntegrityTokenRequest.builder()
                .setNonce(nonce)
                .setCloudProjectNumber(cloudProjectNumber)
                .build();
            manager.requestIntegrityToken(request)
                .addOnSuccessListener((IntegrityTokenResponse resp) -> {
                    JSObject ret = new JSObject();
                    ret.put("token", resp.token());
                    // verdict empty — Bahnhof decodes the JWS server-side
                    // and returns the verdict-summary in /attest's response.
                    ret.put("verdict", "");
                    call.resolve(ret);
                })
                .addOnFailureListener(e -> {
                    // Common causes: device not Play-certified, no network,
                    // app signature mismatch, project number wrong. The
                    // message is what the user sees in the modal — keep
                    // it concise but actionable.
                    call.reject(
                        "Play Integrity check failed: "
                        + (e.getMessage() != null ? e.getMessage() : e.toString()),
                        e
                    );
                });
        } catch (Throwable t) {
            // Anything not caught by the listeners (e.g. IntegrityManagerFactory
            // throwing on a missing Play Services component) lands here.
            call.reject(
                "Play Integrity initialisation failed: " + t.getMessage(), t
            );
        }
    }
}
