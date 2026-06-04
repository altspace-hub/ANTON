/*
 * BackgroundPollingPlugin — Capacitor bridge for the on-device background
 * payment poll (push-notifications plan, Phase 2). Registered in MainActivity.
 *
 * JS API (src/pay/services/background-setup.ts):
 *   enable({address, endpoint?})  → schedule a 15-min WorkManager poll; store
 *                                   the PUBLIC address + RPC URL the worker reads.
 *   disable()                     → cancel the periodic work.
 *   syncSeen({txIds: string[]})   → mark tx_ids the foreground already knows
 *                                   (sends + receives) as seen, so the worker
 *                                   never notifies for the user's own change.
 *   runNow()                      → run one poll immediately (test / manual
 *                                   refresh); resolves { notified }.
 *
 * Nothing here touches keys or tokens — get_utxos is a public read.
 */
package com.futurechain.anton.pay.bgpoll;

import android.content.SharedPreferences;
import android.content.Context;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;

import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.TimeUnit;

@CapacitorPlugin(name = "BackgroundPolling")
public class BackgroundPollingPlugin extends Plugin {
    private static final String WORK_NAME = "fc-payment-bg-poll";

    @PluginMethod
    public void enable(PluginCall call) {
        String address = call.getString("address", "");
        String endpoint = call.getString("endpoint", "");
        if (address == null || address.isEmpty()) {
            call.reject("address required");
            return;
        }
        try {
            SharedPreferences.Editor e = prefs().edit().putString("address", address);
            if (endpoint != null && !endpoint.isEmpty()) e.putString("endpoint", endpoint);
            e.apply();

            Constraints constraints = new Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build();
            // 15 min is the Android periodic floor; flex lets Doze batch it.
            PeriodicWorkRequest req = new PeriodicWorkRequest.Builder(
                    PayBackgroundWorker.class, 15, TimeUnit.MINUTES, 5, TimeUnit.MINUTES)
                .setConstraints(constraints)
                .build();
            WorkManager.getInstance(getContext())
                .enqueueUniquePeriodicWork(WORK_NAME, ExistingPeriodicWorkPolicy.KEEP, req);
            call.resolve();
        } catch (Throwable t) {
            call.reject("enable failed: " + t.getMessage());
        }
    }

    @PluginMethod
    public void disable(PluginCall call) {
        try {
            WorkManager.getInstance(getContext()).cancelUniqueWork(WORK_NAME);
            call.resolve();
        } catch (Throwable t) {
            call.reject("disable failed: " + t.getMessage());
        }
    }

    @PluginMethod
    public void syncSeen(PluginCall call) {
        try {
            JSArray arr = call.getArray("txIds");
            List<String> ids = arr != null ? arr.toList() : new java.util.ArrayList<String>();
            SharedPreferences p = prefs();
            Set<String> seen = new HashSet<>(p.getStringSet("seen", new HashSet<String>()));
            for (Object o : ids) {
                if (o instanceof String && !((String) o).isEmpty()) seen.add((String) o);
            }
            // Cap so it can't grow unbounded.
            if (seen.size() > 1000) {
                Set<String> capped = new HashSet<>();
                int i = 0;
                for (String s : seen) { if (i++ >= 1000) break; capped.add(s); }
                seen = capped;
            }
            // Add to "seen" but do NOT flip "seeded": the worker's own first
            // poll must still silently baseline ALL current UTXO tx_ids (which
            // are chain-tx-id keyed; the foreground's ids may be UETR-keyed and
            // wouldn't otherwise suppress historical on-chain outputs).
            p.edit().putStringSet("seen", seen).apply();
            call.resolve();
        } catch (Throwable t) {
            call.reject("syncSeen failed: " + t.getMessage());
        }
    }

    @PluginMethod
    public void runNow(PluginCall call) {
        try {
            int n = PaymentPoller.pollAndNotify(getContext());
            JSObject r = new JSObject();
            r.put("notified", n);
            call.resolve(r);
        } catch (Throwable t) {
            call.reject("runNow failed: " + t.getMessage());
        }
    }

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PaymentPoller.PREFS, Context.MODE_PRIVATE);
    }
}
