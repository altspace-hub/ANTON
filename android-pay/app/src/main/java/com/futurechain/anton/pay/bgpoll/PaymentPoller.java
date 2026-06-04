/*
 * PaymentPoller — the on-device background payment check.
 *
 * Decision (push-notifications plan, Phase 2): NO server chain-watcher. The
 * phone itself polls the PUBLIC FutureChain read endpoint and fires a native
 * notification when a new incoming payment lands — so no wallet address is ever
 * registered with a server (keeps the local-first posture).
 *
 * Data source: GET <endpoint>/get_utxos/<address>. This endpoint is
 * UNAUTHENTICATED (verified 2026-06-04: 200 public; /iso_received needs an
 * X-API-Key the headless worker can't get). We only need the PUBLIC address +
 * the RPC URL — no token, no keys. The worker aggregates UTXO amounts by tx_id
 * and notifies on a tx_id it hasn't seen.
 *
 * Dedup:
 *   - FIRST run seeds silently — every current tx_id is recorded as "seen"
 *     without notifying, so enabling the feature doesn't dump the whole history.
 *   - The foreground app pushes its known tx_ids (sends + receives) into the
 *     same "seen" set via BackgroundPolling.syncSeen(), so the worker never
 *     notifies for the user's OWN change outputs (it can't read the app's IDB).
 *   - Notification id = the SAME idFor(txId) hash + the SAME channel
 *     (fc-pay-incoming) as the JS path, so Android replaces rather than
 *     duplicates if both fire for one payment.
 *
 * Everything is best-effort and swallows errors — a failed poll just waits for
 * the next tick; it must never crash the worker.
 */
package com.futurechain.anton.pay.bgpoll;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.app.PendingIntent;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

public final class PaymentPoller {
    public static final String PREFS = "fc_bg_poll";
    public static final String CHANNEL_ID = "fc-pay-incoming";
    private static final String DEFAULT_ENDPOINT = "https://rpc.futurechain.eu";

    private PaymentPoller() {}

    /**
     * Run one poll. Returns the number of NEW incoming payments notified
     * (0 on the seeding run, on error, or when nothing is new). Never throws.
     */
    public static int pollAndNotify(Context ctx) {
        try {
            SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            String address = p.getString("address", null);
            if (address == null || address.isEmpty()) return 0;
            String endpoint = p.getString("endpoint", DEFAULT_ENDPOINT);
            if (endpoint == null || endpoint.isEmpty()) endpoint = DEFAULT_ENDPOINT;

            Map<String, Long> satByTx = fetchUtxoSatByTx(endpoint, address);
            if (satByTx == null) return 0; // network/parse error — try next tick

            // Copy the seen set (the one returned by getStringSet must not be mutated).
            Set<String> seen = new HashSet<>(p.getStringSet("seen", new HashSet<String>()));
            boolean seeded = p.getBoolean("seeded", false);

            int notified = 0;
            if (!seeded) {
                // Baseline: remember everything currently on-chain, notify for none.
                seen.addAll(satByTx.keySet());
            } else {
                for (Map.Entry<String, Long> e : satByTx.entrySet()) {
                    String txId = e.getKey();
                    if (seen.contains(txId)) continue;
                    seen.add(txId);
                    notify(ctx, txId, e.getValue());
                    notified++;
                }
            }

            // Cap the set so it can't grow unbounded.
            Set<String> capped = capSet(seen, 500);
            p.edit()
                .putStringSet("seen", capped)
                .putBoolean("seeded", true)
                .apply();
            return notified;
        } catch (Throwable t) {
            return 0; // never let the worker crash
        }
    }

    /** GET <endpoint>/get_utxos/<address> → { tx_id -> summed satoshi }. Null on error. */
    private static Map<String, Long> fetchUtxoSatByTx(String endpoint, String address) {
        HttpURLConnection conn = null;
        try {
            String url = endpoint.replaceAll("/+$", "")
                + "/get_utxos/" + URLEncoder.encode(address, "UTF-8");
            conn = (HttpURLConnection) new URL(url).openConnection();
            conn.setRequestMethod("GET");
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(15000);
            conn.setRequestProperty("Accept", "application/json");
            int code = conn.getResponseCode();
            if (code != 200) return null; // 401/5xx — nothing we can do headless
            StringBuilder sb = new StringBuilder();
            try (BufferedReader br = new BufferedReader(new InputStreamReader(conn.getInputStream(), "UTF-8"))) {
                String line;
                while ((line = br.readLine()) != null) sb.append(line);
            }
            JSONArray arr = new JSONArray(sb.toString());
            Map<String, Long> out = new HashMap<>();
            for (int i = 0; i < arr.length(); i++) {
                JSONObject u = arr.optJSONObject(i);
                if (u == null) continue;
                String txId = u.optString("tx_id", u.optString("txid", ""));
                if (txId.isEmpty()) continue;
                long sat = u.optLong("amount", 0L);
                Long prev = out.get(txId);
                out.put(txId, (prev == null ? 0L : prev) + sat);
            }
            return out;
        } catch (Throwable t) {
            return null;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private static void notify(Context ctx, String txId, long sat) {
        ensureChannel(ctx);
        String title = "+" + formatFtc(sat) + " FTC received";
        String body = "A payment landed on your wallet";

        Intent open = ctx.getPackageManager().getLaunchIntentForPackage(ctx.getPackageName());
        PendingIntent pi = null;
        if (open != null) {
            open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
            pi = PendingIntent.getActivity(ctx, idFor(txId), open, flags);
        }

        NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, CHANNEL_ID)
            .setSmallIcon(smallIconRes(ctx))
            .setContentTitle(title)
            .setContentText(body)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH);
        if (pi != null) b.setContentIntent(pi);

        try {
            NotificationManagerCompat.from(ctx).notify(idFor(txId), b.build());
        } catch (SecurityException ignored) {
            // POST_NOTIFICATIONS not granted — silently skip.
        }
    }

    /** The monochrome status-bar icon (ic_stat_notify); falls back to the app icon. */
    private static int smallIconRes(Context ctx) {
        int id = ctx.getResources().getIdentifier("ic_stat_notify", "drawable", ctx.getPackageName());
        return id != 0 ? id : ctx.getApplicationInfo().icon;
    }

    private static void ensureChannel(Context ctx) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        if (nm.getNotificationChannel(CHANNEL_ID) != null) return;
        NotificationChannel ch = new NotificationChannel(
            CHANNEL_ID, "Payments received", NotificationManager.IMPORTANCE_HIGH);
        ch.setDescription("Incoming FutureChain payments");
        nm.createNotificationChannel(ch);
    }

    /** satoshi → FTC string, up to 4 decimals, trailing zeros trimmed. 1 FTC = 1e8 sat. */
    static String formatFtc(long sat) {
        double ftc = sat / 100_000_000.0;
        String s = String.format(java.util.Locale.US, "%.4f", ftc);
        if (s.contains(".")) {
            s = s.replaceAll("0+$", "").replaceAll("\\.$", "");
        }
        return s;
    }

    /**
     * Stable positive 31-bit int from a tx id — byte-for-byte identical to the
     * JS idFor() in src/pay/services/notifications.ts so an OS notification id
     * collides (and thus dedups) across the foreground + background paths.
     */
    static int idFor(String txId) {
        int h = 0;
        for (int i = 0; i < txId.length(); i++) {
            h = (h * 31 + txId.charAt(i)); // 32-bit int overflow mirrors JS `| 0`
        }
        int id = Math.abs(h);
        return id == 0 ? 1 : id;
    }

    /** Keep the newest-ish N by simple truncation (order isn't load-bearing for dedup). */
    private static Set<String> capSet(Set<String> set, int max) {
        if (set.size() <= max) return set;
        Set<String> out = new HashSet<>();
        int i = 0;
        for (String s : set) {
            if (i++ >= max) break;
            out.add(s);
        }
        return out;
    }
}
