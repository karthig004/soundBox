package com.smartsoundbox.soundbox

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class ReminderModule(private val rc: ReactApplicationContext) : ReactContextBaseJavaModule(rc) {
  override fun getName() = "ReminderNative"

  @ReactMethod
  fun schedule(id: String, text: String, at: Double, promise: Promise) {
    try {
      ReminderReceiver.schedule(rc, id, text, at.toLong())
      promise.resolve(null)
    } catch (e: Exception) { promise.reject("reminder_schedule_failed", e.message, e) }
  }

  @ReactMethod
  fun cancel(id: String, promise: Promise) {
    ReminderReceiver.cancel(rc, id)
    promise.resolve(null)
  }
}

class ReminderReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val id = intent.getStringExtra("id") ?: return
    val text = intent.getStringExtra("text") ?: return
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    prefs.edit().remove(id).remove("$id.at").apply()
    showNotification(context, id, text)
    val pending = goAsync()
    SpeechEngine.ensure(context) { ready ->
      if (!ready) { pending.finish(); return@ensure }
      SpeechEngine.speak(context, "Reminder. $text", SpeakOptions(language = "en-IN", duck = false)) { pending.finish() }
    }
  }

  companion object {
  private const val PREFS = "scheduled_reminders"
  private const val CHANNEL = "personal_reminders"

  fun schedule(context: Context, id: String, text: String, at: Long) {
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(id, text).putLong("$id.at", at).apply()
    val alarm = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    val pi = pending(context, id, text)
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) alarm.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
      else alarm.setExact(AlarmManager.RTC_WAKEUP, at, pi)
    } catch (_: SecurityException) {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) alarm.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
      else alarm.set(AlarmManager.RTC_WAKEUP, at, pi)
    }
  }

  fun cancel(context: Context, id: String) {
    val alarm = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    alarm.cancel(pending(context, id, ""))
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove(id).remove("$id.at").apply()
  }

  private fun pending(context: Context, id: String, text: String): PendingIntent {
    val intent = Intent(context, ReminderReceiver::class.java).setAction("com.smartsoundbox.REMINDER.$id").putExtra("id", id).putExtra("text", text)
    return PendingIntent.getBroadcast(context, id.hashCode(), intent,
      PendingIntent.FLAG_UPDATE_CURRENT or if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0)
  }

  fun restore(context: Context) {
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    prefs.all.filterKeys { !it.endsWith(".at") }.forEach { (id, value) ->
      val text = value as? String ?: return@forEach
      val at = prefs.getLong("$id.at", 0L)
      if (at > System.currentTimeMillis()) schedule(context, id, text, at) else cancel(context, id)
    }
  }

  private fun showNotification(context: Context, id: String, text: String) {
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && manager.getNotificationChannel(CHANNEL) == null) {
      manager.createNotificationChannel(NotificationChannel(CHANNEL, "Reminders", NotificationManager.IMPORTANCE_HIGH))
    }
    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)
    val content = launch?.let { PendingIntent.getActivity(context, id.hashCode(), it, PendingIntent.FLAG_UPDATE_CURRENT or if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0) }
    val notification = NotificationCompat.Builder(context, CHANNEL)
      .setSmallIcon(context.applicationInfo.icon)
      .setContentTitle("Reminder")
      .setContentText(text)
      .setStyle(NotificationCompat.BigTextStyle().bigText(text))
      .setAutoCancel(true).setPriority(NotificationCompat.PRIORITY_HIGH)
      .apply { if (content != null) setContentIntent(content) }.build()
    manager.notify(id.hashCode(), notification)
  }
  }
}
