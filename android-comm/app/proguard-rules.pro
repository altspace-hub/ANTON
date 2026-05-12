# R8 / ProGuard rules for ANTON Comm App release builds.
#
# Phase 1 release-readiness audit (B7): R8 minify is now ON. Without
# explicit keeps, the Capacitor JS↔Java bridge + every Capacitor plugin
# would be stripped, causing runtime ClassNotFoundException on first
# WebView load. The rules below preserve the surfaces that need to be
# reachable from JS via reflection / JavascriptInterface.

# ── Capacitor core + bridge ────────────────────────────────────────
-keep public class com.getcapacitor.** { *; }
-keep public interface com.getcapacitor.** { *; }
-keepclassmembers class com.getcapacitor.** { *; }

# Plugins surfaced via @CapacitorPlugin annotation rely on reflection.
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }
-keep class * extends com.getcapacitor.Plugin { *; }
-keep class * extends com.getcapacitor.BridgeActivity { *; }

# Cordova compat shim used by some plugins.
-keep class org.apache.cordova.** { *; }
-keep public class * extends org.apache.cordova.CordovaPlugin

# ── JS-accessible attributes ───────────────────────────────────────
-keepattributes JavascriptInterface
-keepattributes Signature, *Annotation*, EnclosingMethod, InnerClasses

# ── Capacitor plugins shipped in this app ──────────────────────────
# (mirror capacitor.plugins.json — every plugin's main class)
-keep class com.aparajita.capacitor.securestorage.** { *; }
-keep class com.capacitorjs.plugins.app.** { *; }
-keep class com.capacitorjs.plugins.camera.** { *; }
-keep class com.capacitorjs.plugins.haptics.** { *; }
-keep class com.capacitorjs.plugins.keyboard.** { *; }
-keep class com.capacitorjs.plugins.localnotifications.** { *; }
-keep class com.capacitorjs.plugins.network.** { *; }
-keep class com.capacitorjs.plugins.pushnotifications.** { *; }
-keep class com.capacitorjs.plugins.share.** { *; }
-keep class com.capacitorjs.plugins.splashscreen.** { *; }
-keep class com.capacitorjs.plugins.statusbar.** { *; }
-keep class com.capacitorjs.plugins.geolocation.** { *; }
-keep class com.aparajita.capacitor.biometric.** { *; }
-keep class com.capacitorcommunity.speechrecognition.** { *; }
-keep class io.capawesome.capacitorjs.plugins.mlkit.** { *; }
-keep class com.whitestein.securestorage.** { *; }

# ── WebView JS interop ─────────────────────────────────────────────
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# ── Standard Android keeps that R8 sometimes drops ─────────────────
-keepclassmembers enum * { *; }
-keep class * implements android.os.Parcelable {
    public static final android.os.Parcelable$Creator *;
}
