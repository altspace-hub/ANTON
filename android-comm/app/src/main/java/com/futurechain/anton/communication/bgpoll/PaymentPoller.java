/*
 * PaymentPoller — on-device background payment check for the Comm wallet.
 * Port of android-pay's PaymentPoller (push-notifications plan, Phase 2);
 * differs only in package + channel id (fc-comm-incoming).
 *
 * Polls the PUBLIC GET <endpoint>/get_utxos/<address> (no token; /iso_received
 * needs an X-API-Key the headless worker can't get), aggregates satoshi by
 * tx_id, and notifies on a tx_id it hasn't seen. First run seeds silently;
 * the foreground pushes its known tx ids via syncSeen so the worker never
 * notifies for the user's own change. Notification id = the SAME idFor(txId)
 * hash + channel as comm/services/notifications.ts → the OS dedups fg↔bg.
 */
package com.futurechain.anton.communication.bgpoll;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
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
    public static final String CHANNEL_ID = "fc-comm-incoming";
    private static final String DEFAULT_ENDPOINT = "https://rpc.futurechain.eu";

    private PaymentPoller() {}

    public static int pollAndNotify(Context ctx) {
        try {
            SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            String address = p.getString("address", null);
            if (address == null || address.isEmpty()) return 0;
            String endpoint = p.getString("endpoint", DEFAULT_ENDPOINT);
            if (endpoint == null || endpoint.isEmpty()) endpoint = DEFAULT_ENDPOINT;

            Map<String, Long> satByTx = fetchUtxoSatByTx(endpoint, address);
            if (satByTx == null) return 0;

            Set<String> seen = new HashSet<>(p.getStringSet("seen", new HashSet<String>()));
            boolean seeded = p.getBoolean("seeded", false);

            int notified = 0;
            if (!seeded) {
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

            p.edit()
                .putStringSet("seen", capSet(seen, 500))
                .putBoolean("seeded", true)
                .apply();
            return notified;
        } catch (Throwable t) {
            return 0;
        }
    }

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
            if (code != 200) return null;
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
        }
    }

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

    static String formatFtc(long sat) {
        double ftc = sat / 100_000_000.0;
        String s = String.format(java.util.Locale.US, "%.4f", ftc);
        if (s.contains(".")) {
            s = s.replaceAll("0+$", "").replaceAll("\\.$", "");
        }
        return s;
    }

    static int idFor(String txId) {
        int h = 0;
        for (int i = 0; i < txId.length(); i++) {
            h = (h * 31 + txId.charAt(i));
        }
        int id = Math.abs(h);
        return id == 0 ? 1 : id;
    }

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
