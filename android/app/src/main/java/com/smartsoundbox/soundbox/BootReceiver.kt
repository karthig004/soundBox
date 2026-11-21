package com.smartsoundbox.soundbox

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Restarts the soundbox after a phone reboot or an app update, without opening the app. */
class BootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    when (intent.action) {
      Intent.ACTION_BOOT_COMPLETED, Intent.ACTION_MY_PACKAGE_REPLACED ->
        {
          KeepAliveService.start(context)
          ReminderReceiver.restore(context)
        }
    }
  }
}
