/*
 * CommBackgroundWorker — WorkManager periodic job that runs the on-device
 * payment poll for the Comm wallet while the app is backgrounded/killed.
 * Thin wrapper over PaymentPoller; always returns success() so the periodic
 * schedule survives.
 */
package com.futurechain.anton.communication.bgpoll;

import android.content.Context;

import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

public class CommBackgroundWorker extends Worker {
    public CommBackgroundWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        try {
            PaymentPoller.pollAndNotify(getApplicationContext());
        } catch (Throwable ignored) {
        }
        return Result.success();
    }
}
