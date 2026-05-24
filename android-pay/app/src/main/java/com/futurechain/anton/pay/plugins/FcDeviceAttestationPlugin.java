/*
 * FcDeviceAttestationPlugin — Capacitor plugin for Play Integrity.
 *
 * Spec: docs/PAY_DEVICE_ATTESTATION_SPEC.md
 *
 * PHASE 1 (this file, shipped 2026-05-24): scaffold only — the JS
 * layer (src/pay/services/device-attestation.ts) checks
 * isAvailable(); when this returns false (current scaffold), JS
 * falls back to the DEV_NO_ATTESTATION dev-mode escape, which
 * Bahnhof's /attest accepts only when BAHNHOF_DEV_ATTESTATION_ALLOWED=true.
 * In production this env is unset → dev tokens 401 → user gets a
 * clear "device security check failed" UX.
 *
 * PHASE 2 (TODO — needs Windows machine + a test phone):
 *   1. Add to app/build.gradle:
 *        implementation 'com.google.android.play:integrity:1.3.0'
 *   2. Set the GoogleCloudProjectNumber in AndroidManifest.xml under
 *      <application>:
 *        <meta-data
 *          android:name="com.google.android.play.integrity.PROJECT_NUMBER"
 *          android:value="@string/google_cloud_project_number"/>
 *   3. Replace requestIntegrityToken() body below with the real
 *      Play Integrity standard-request flow:
 *        IntegrityManager m = IntegrityManagerFactory.create(getContext());
 *        IntegrityTokenRequest req =
 *            IntegrityTokenRequest.builder()
 *                .setNonce(nonce)
 *                .setCloudProjectNumber(<cloud number>)
 *                .build();
 *        m.requestIntegrityToken(req)
 *            .addOnSuccessListener(resp -> {
 *                JSObject ret = new JSObject();
 *                ret.put("token", resp.token());
 *                ret.put("verdict", "");   // server-side decodes
 *                call.resolve(ret);
 *            })
 *            .addOnFailureListener(e -> call.reject(e.getMessage()));
 *   4. Flip isAvailable() to return { available: true } on devices
 *      that have Google Play Services. Existing GoogleApiAvailability
 *      check handles that.
 *   5. Register on Google Play Console: project number, app's
 *      signing cert SHA-256 fingerprint(s).
 *   6. Phone smoke test: real device → 200 on /submit_signed_transaction;
 *      emulator → 401.
 *
 * Registered in MainActivity.onCreate():
 *   registerPlugin(FcDeviceAttestationPlugin.class);
 */
package com.futurechain.anton.pay.plugins;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "FcDeviceAttestation")
public class FcDeviceAttestationPlugin extends Plugin {

    /**
     * Probe whether this device can produce a real Play Integrity
     * token. PHASE 1: hardcoded false so JS falls back to dev-mode.
     * PHASE 2: check GoogleApiAvailability + cached cloud project
     * number, return true iff both are usable.
     */
    @PluginMethod
    public void isAvailable(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("available", false); // PHASE 2 flips this
        call.resolve(ret);
    }

    /**
     * Request a Play Integrity verdict token for the given nonce.
     * PHASE 1: rejects so the JS layer treats it as "no plugin
     * available" and uses the dev-mode token. PHASE 2: implements
     * the real Play Integrity standard-request flow per the comment
     * block at the top of this file.
     */
    @PluginMethod
    public void requestIntegrityToken(PluginCall call) {
        String nonce = call.getString("nonce");
        if (nonce == null || nonce.length() < 16) {
            call.reject("nonce must be at least 16 chars");
            return;
        }
        // PHASE 2: real Play Integrity flow here.
        call.reject(
            "FcDeviceAttestation: Phase 2 not implemented — "
            + "real Play Integrity SDK call to be wired on the "
            + "Windows machine with a test phone. See "
            + "docs/PAY_DEVICE_ATTESTATION_SPEC.md §4.5."
        );
    }
}
