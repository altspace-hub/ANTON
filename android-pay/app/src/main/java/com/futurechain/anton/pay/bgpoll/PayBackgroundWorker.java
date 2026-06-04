/*
 * PayBackgroundWorker — the WorkManager periodic job that runs the on-device
 * payment poll while the app is backgrounded or killed. Thin wrapper: all logic
 * lives in PaymentPoller so the same code runs from the plugin's runNow() too.
 *
 * Always returns success() (even on error) so WorkManager keeps the periodic
 * schedule alive rather than backing off / giving up.
 */
package com.futurechain.anton.pay.bgpoll;

import android.content.Context;

import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

public class PayBackgroundWorker extends Worker {
    public PayBackgroundWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        try {
            PaymentPoller.pollAndNotify(getApplicationContext());
        } catch (Throwable ignored) {
            // Swallow — never fail the periodic work; just try again next tick.
        }
        return Result.success();
    }
}
