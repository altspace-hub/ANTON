# ProGuard / R8 rules for ANTON Companion (Capacitor 7).
# Without these, release builds (minifyEnabled=true) strip plugin bridge
# classes registered via @CapacitorPlugin annotation reflection.

# ── Attributes needed by Capacitor + reflection ──────────────────────────
-keepattributes *Annotation*
-keepattributes Signature
-keepattributes InnerClasses
-keepattributes EnclosingMethod
-keepattributes Exceptions
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# ── Capacitor core ──────────────────────────────────────────────────────
-keep class com.getcapacitor.** { *; }
-keep interface com.getcapacitor.** { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }
-keep @com.getcapacitor.PluginMethod class * { *; }
-keepclassmembers class * {
    @com.getcapacitor.PluginMethod *;
}
-keepclassmembers class * extends com.getcapacitor.Plugin {
    public <init>(...);
}
-keep public class * extends com.getcapacitor.BridgeActivity

# JSObject + PluginCall reflective use
-keepclassmembers class com.getcapacitor.JSObject { *; }
-keepclassmembers class com.getcapacitor.PluginCall { *; }

# Cordova fallback bridge
-keep class org.apache.cordova.** { *; }

# ── Capacitor official plugins ───────────────────────────────────────────
-keep class com.capacitorjs.plugins.** { *; }

# ── Community / vendor plugins (from capacitor.build.gradle) ─────────────
-keep class com.aparajita.capacitor.securestorage.** { *; }
-keep class com.getcapacitor.community.speechrecognition.** { *; }
-keep class com.capgo.capacitor.nativebiometric.** { *; }
-keep class com.whitestein.securestorage.** { *; }

# ── ML Kit barcode scanning (used by QR pairing) ─────────────────────────
-keep class com.google.mlkit.** { *; }
-keep class com.google.android.gms.** { *; }
-dontwarn com.google.mlkit.**
-dontwarn com.google.android.gms.**

# ── AndroidX WebView + bridge (Capacitor depends on it for JS interop) ──
-keep class androidx.webkit.** { *; }
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# ── Push notifications: keep FCM service classes if present ─────────────
-keep class com.google.firebase.** { *; }
-dontwarn com.google.firebase.**

# EdDSA (net.i2p.crypto.eddsa, used by the native Ed25519 signer) references a
# JDK-internal X509 class absent on Android; the path is never taken at runtime
# (raw Ed25519 is used). Without this, minifyReleaseWithR8 fails. (go-live)
-dontwarn sun.security.x509.**
-dontwarn net.i2p.crypto.eddsa.**

# ── Reflection-used model classes that get serialized to/from JSObject ──
# Add app-specific model packages here if Java/Kotlin POJOs are introduced.

# ── Suppress noisy warnings from optional deps ──────────────────────────
-dontwarn javax.annotation.**
-dontwarn org.codehaus.mojo.animal_sniffer.**
-dontwarn java.lang.invoke.**
