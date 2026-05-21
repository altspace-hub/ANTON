/*
 * FcSecureSignerPlugin — Capacitor plugin for native-bound Ed25519
 * signing. Wave 7 of the security hardening plan.
 *
 * Goal: the 32-byte Ed25519 private key NEVER appears as a
 * Uint8Array in the WebView's JS heap. Stored encrypted under a HW-
 * backed Android Keystore AES-256-GCM key; signing happens in
 * native JVM code via i2p.crypto.eddsa; only the 64-byte signature
 * crosses back to JS.
 *
 * Storage layout:
 *   - Per-alias AES-256-GCM key in Android Keystore (alias =
 *     "fc.signer.<walletId>"). Hardware-backed where supported.
 *   - Wrapped priv (ciphertext + 12-byte IV, both hex) in a per-
 *     alias SharedPreferences file ("fc_secure_signer_<walletId>"),
 *     MODE_PRIVATE — only this app's UID can read it.
 *
 * The biometric gate intentionally lives one layer up
 * (services/biometric.ts), not on the Keystore key itself.
 * setUserAuthenticationRequired(true) on the Keystore key would
 * force a second prompt that doesn't add real assurance and breaks
 * the existing UX of "one biometric, then sign."
 *
 * API:
 *   wrap({alias, privHex})    → {ok}
 *   sign({alias, digestHex})  → {signature}
 *   has({alias})              → {exists}
 *   clear({alias})            → {ok}
 *   unwrap({alias})           → {privHex}   — backup-export path only
 */
package com.futurechain.anton.pay.plugins;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import net.i2p.crypto.eddsa.EdDSAEngine;
import net.i2p.crypto.eddsa.EdDSAPrivateKey;
import net.i2p.crypto.eddsa.spec.EdDSANamedCurveTable;
import net.i2p.crypto.eddsa.spec.EdDSANamedCurveSpec;
import net.i2p.crypto.eddsa.spec.EdDSAPrivateKeySpec;

import java.security.KeyStore;
import java.security.MessageDigest;
import java.util.Arrays;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

@CapacitorPlugin(name = "FcSecureSigner")
public class FcSecureSignerPlugin extends Plugin {

    private static final String ANDROID_KEYSTORE = "AndroidKeyStore";
    private static final String PREF_PREFIX = "fc_secure_signer_";
    private static final String PREF_CT = "ct";
    private static final String PREF_IV = "iv";
    private static final String CIPHER = "AES/GCM/NoPadding";
    private static final int GCM_TAG_BITS = 128;

    private static String aliasKey(String alias) { return "fc.signer." + alias; }
    private static String prefFile(String alias) { return PREF_PREFIX + alias; }

    private static byte[] hexToBytes(String hex) {
        int n = hex.length();
        byte[] out = new byte[n / 2];
        for (int i = 0; i < out.length; i++) {
            int hi = Character.digit(hex.charAt(i * 2), 16);
            int lo = Character.digit(hex.charAt(i * 2 + 1), 16);
            out[i] = (byte) ((hi << 4) | lo);
        }
        return out;
    }

    private static String bytesToHex(byte[] bytes) {
        StringBuilder sb = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) sb.append(String.format("%02x", b & 0xFF));
        return sb.toString();
    }

    private SecretKey getOrCreateAesKey(String alias) throws Exception {
        KeyStore ks = KeyStore.getInstance(ANDROID_KEYSTORE);
        ks.load(null);
        java.security.Key existing = ks.getKey(aliasKey(alias), null);
        if (existing instanceof SecretKey) return (SecretKey) existing;
        KeyGenerator kg = KeyGenerator.getInstance(
                KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE);
        KeyGenParameterSpec spec = new KeyGenParameterSpec.Builder(
                aliasKey(alias),
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .setRandomizedEncryptionRequired(true)
                .build();
        kg.init(spec);
        return kg.generateKey();
    }

    @PluginMethod
    public void wrap(PluginCall call) {
        String alias = call.getString("alias");
        String privHex = call.getString("privHex");
        if (alias == null || privHex == null) {
            call.reject("alias and privHex required");
            return;
        }
        if (privHex.length() != 64) {
            call.reject("privHex must be 32 bytes (64 hex chars)");
            return;
        }
        byte[] priv = null;
        try {
            priv = hexToBytes(privHex);
            SecretKey key = getOrCreateAesKey(alias);
            Cipher cipher = Cipher.getInstance(CIPHER);
            cipher.init(Cipher.ENCRYPT_MODE, key);
            byte[] ct = cipher.doFinal(priv);
            byte[] iv = cipher.getIV();
            SharedPreferences prefs = getContext()
                    .getSharedPreferences(prefFile(alias), Context.MODE_PRIVATE);
            prefs.edit()
                    .putString(PREF_CT, bytesToHex(ct))
                    .putString(PREF_IV, bytesToHex(iv))
                    .apply();
            JSObject res = new JSObject();
            res.put("ok", true);
            call.resolve(res);
        } catch (Exception e) {
            call.reject("wrap failed: " + e.getMessage(), e);
        } finally {
            if (priv != null) Arrays.fill(priv, (byte) 0);
        }
    }

    @PluginMethod
    public void sign(PluginCall call) {
        String alias = call.getString("alias");
        String digestHex = call.getString("digestHex");
        if (alias == null || digestHex == null) {
            call.reject("alias and digestHex required");
            return;
        }
        if (digestHex.length() != 64) {
            call.reject("digestHex must be 32 bytes (64 hex chars)");
            return;
        }
        byte[] priv = null;
        try {
            SharedPreferences prefs = getContext()
                    .getSharedPreferences(prefFile(alias), Context.MODE_PRIVATE);
            String ctHex = prefs.getString(PREF_CT, null);
            String ivHex = prefs.getString(PREF_IV, null);
            if (ctHex == null || ivHex == null) {
                call.reject("alias has no wrapped priv");
                return;
            }
            KeyStore ks = KeyStore.getInstance(ANDROID_KEYSTORE);
            ks.load(null);
            java.security.Key k = ks.getKey(aliasKey(alias), null);
            if (!(k instanceof SecretKey)) {
                call.reject("Keystore key missing for alias");
                return;
            }
            Cipher cipher = Cipher.getInstance(CIPHER);
            cipher.init(Cipher.DECRYPT_MODE, (SecretKey) k,
                    new GCMParameterSpec(GCM_TAG_BITS, hexToBytes(ivHex)));
            priv = cipher.doFinal(hexToBytes(ctHex));

            EdDSANamedCurveSpec spec =
                    EdDSANamedCurveTable.getByName(EdDSANamedCurveTable.ED_25519);
            EdDSAPrivateKey privKey = new EdDSAPrivateKey(new EdDSAPrivateKeySpec(priv, spec));
            EdDSAEngine engine =
                    new EdDSAEngine(MessageDigest.getInstance(spec.getHashAlgorithm()));
            engine.initSign(privKey);
            engine.update(hexToBytes(digestHex));
            byte[] sig = engine.sign();

            JSObject res = new JSObject();
            res.put("signature", bytesToHex(sig));
            call.resolve(res);
        } catch (Exception e) {
            call.reject("sign failed: " + e.getMessage(), e);
        } finally {
            // Wipe the priv from JVM heap as soon as we can.
            if (priv != null) Arrays.fill(priv, (byte) 0);
        }
    }

    @PluginMethod
    public void has(PluginCall call) {
        String alias = call.getString("alias");
        if (alias == null) { call.reject("alias required"); return; }
        SharedPreferences prefs = getContext()
                .getSharedPreferences(prefFile(alias), Context.MODE_PRIVATE);
        boolean exists = prefs.contains(PREF_CT) && prefs.contains(PREF_IV);
        JSObject res = new JSObject();
        res.put("exists", exists);
        call.resolve(res);
    }

    @PluginMethod
    public void clear(PluginCall call) {
        String alias = call.getString("alias");
        if (alias == null) { call.reject("alias required"); return; }
        try {
            SharedPreferences prefs = getContext()
                    .getSharedPreferences(prefFile(alias), Context.MODE_PRIVATE);
            prefs.edit().clear().apply();
            KeyStore ks = KeyStore.getInstance(ANDROID_KEYSTORE);
            ks.load(null);
            if (ks.containsAlias(aliasKey(alias))) ks.deleteEntry(aliasKey(alias));
            JSObject res = new JSObject();
            res.put("ok", true);
            call.resolve(res);
        } catch (Exception e) {
            call.reject("clear failed: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void unwrap(PluginCall call) {
        String alias = call.getString("alias");
        if (alias == null) { call.reject("alias required"); return; }
        byte[] priv = null;
        try {
            SharedPreferences prefs = getContext()
                    .getSharedPreferences(prefFile(alias), Context.MODE_PRIVATE);
            String ctHex = prefs.getString(PREF_CT, null);
            String ivHex = prefs.getString(PREF_IV, null);
            if (ctHex == null || ivHex == null) {
                call.reject("alias has no wrapped priv");
                return;
            }
            KeyStore ks = KeyStore.getInstance(ANDROID_KEYSTORE);
            ks.load(null);
            java.security.Key k = ks.getKey(aliasKey(alias), null);
            if (!(k instanceof SecretKey)) {
                call.reject("Keystore key missing for alias");
                return;
            }
            Cipher cipher = Cipher.getInstance(CIPHER);
            cipher.init(Cipher.DECRYPT_MODE, (SecretKey) k,
                    new GCMParameterSpec(GCM_TAG_BITS, hexToBytes(ivHex)));
            priv = cipher.doFinal(hexToBytes(ctHex));
            JSObject res = new JSObject();
            res.put("privHex", bytesToHex(priv));
            call.resolve(res);
        } catch (Exception e) {
            call.reject("unwrap failed: " + e.getMessage(), e);
        } finally {
            if (priv != null) Arrays.fill(priv, (byte) 0);
        }
    }
}
