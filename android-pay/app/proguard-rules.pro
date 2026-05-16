# R8 / ProGuard rules for ANTON Comm App release builds.
#
# Two passes have shaped this file:
#   Phase 1 (B7) — minify ON, baseline keeps for Capacitor + every
#                  plugin so the JS↔Java bridge doesn't get stripped.
#   Phase 7 (P7-2) — tightening:
#     · Strip android.util.Log.v/d/i calls from release bytecode so
#       they aren't even invoked at runtime (Android best practice for
#       release builds; debug builds keep all log levels because
#       minifyEnabled is off on debug).
#     · Fix @capgo/capacitor-native-biometric classpath — it lives at
#       ee.forgr.biometric, NOT com.aparajita.capacitor.biometric. The
#       Phase 1 rule kept the wrong package; biometric calls would
#       NoClassDefFoundError on a release build.
#     · Add -dontwarn for libraries that ship Kotlin/coroutines
#       metadata classes R8 can't always resolve.

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
-keepattributes Signature, *Annotation*, EnclosingMethod, InnerClasses, SourceFile, LineNumberTable

# Stack traces stay useful: rename SourceFile so stack traces don't
# leak the obfuscated class name, but keep LineNumberTable so we can
# de-obfuscate with the published mapping.txt from Play.
-renamesourcefileattribute SourceFile

# ── Capacitor plugins shipped in this app ──────────────────────────
# (mirror src/main/assets/capacitor.plugins.json — every plugin's main class)
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
-keep class com.getcapacitor.community.speechrecognition.** { *; }
-keep class io.capawesome.capacitorjs.plugins.mlkit.** { *; }
-keep class com.whitestein.securestorage.** { *; }
# @capgo/capacitor-native-biometric ships its plugin class at this
# package, NOT under com.aparajita. The Phase 1 baseline had it wrong.
-keep class ee.forgr.biometric.** { *; }

# ── WebView JS interop ─────────────────────────────────────────────
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# ── Standard Android keeps that R8 sometimes drops ─────────────────
-keepclassmembers enum * { *; }
-keep class * implements android.os.Parcelable {
    public static final android.os.Parcelable$Creator *;
}

# ── P7-2 release log stripping ─────────────────────────────────────
# Treat verbose / debug / info log calls as side-effect-free so R8
# eliminates them entirely from release bytecode. We keep warn and
# error — they go through Crashlytics-equivalent paths if/when wired.
-assumenosideeffects class android.util.Log {
    public static *** v(...);
    public static *** d(...);
    public static *** i(...);
}

# ── -dontwarn for libraries with unresolvable optional deps ────────
# Kotlin / coroutines metadata classes that R8 sometimes complains
# about even though everything works at runtime.
-dontwarn kotlin.**
-dontwarn kotlinx.**
-dontwarn org.jetbrains.annotations.**
# ML Kit ships a few optional Google Play Services hooks that aren't
# present in a webview-only app.
-dontwarn com.google.android.gms.**
-dontwarn com.google.firebase.**
