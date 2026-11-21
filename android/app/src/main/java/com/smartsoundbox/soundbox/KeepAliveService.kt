package com.smartsoundbox.soundbox

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.smartsoundbox.MainActivity
import com.smartsoundbox.R

/**
 * Keeps RubyAlert alive like a real soundbox: a foreground service with a quiet, ongoing
 * "Live" notification. While it runs, Android keeps the process (and so the notification listener,
 * the SMS receiver, the JS engine and the speech engine) alive — even after the app is swiped
 * away from Recents — so payments are announced immediately instead of after a cold start.
 */
class KeepAliveService : Service() {

  companion object {
    private const val TAG = "SoundboxKeepAlive"
    private const val CHANNEL = "soundbox_live"
    private const val NOTIF_ID = 4711

    /** Safe to call from anywhere; Android may refuse background starts, which we just log. */
    fun start(ctx: Context) {
      val prefs = SoundboxPrefs(ctx)
      if (!prefs.enabled || !prefs.keepAlive) return
      try {
        ContextCompat.startForegroundService(ctx, Intent(ctx, KeepAliveService::class.java))
      } catch (e: Exception) {
        Log.w(TAG, "Could not start keep-alive service now: ${e.message}")
      }
    }

    fun stop(ctx: Context) {
      try { ctx.stopService(Intent(ctx, KeepAliveService::class.java)) } catch (_: Exception) {}
    }
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    goForeground()
    // Warm everything a payment needs, so the first announcement isn't a cold start.
    HeadlessStarter.warm(applicationContext)
    rewarm.run()
  }

  private val handler = android.os.Handler(android.os.Looper.getMainLooper())
  private val rewarm = object : Runnable {
    override fun run() {
      val prefs = SoundboxPrefs(this@KeepAliveService)
      SpeechEngine.warm(this@KeepAliveService, prefs.voiceLang, prefs.voiceName.ifEmpty { null })
      handler.postDelayed(this, 20 * 60 * 1000L)
    }
  }

  override fun onDestroy() {
    handler.removeCallbacks(rewarm)
    super.onDestroy()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    goForeground()
    return START_STICKY
  }

  override fun onTaskRemoved(rootIntent: Intent?) {
    // App swiped away from Recents: keep listening. The service keeps the process alive.
    Log.i(TAG, "Task removed — still listening")
  }

  private fun goForeground() {
    val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm.getNotificationChannel(CHANNEL) == null) {
      val ch = NotificationChannel(CHANNEL, "Soundbox live status", NotificationManager.IMPORTANCE_LOW)
      ch.description = "Shows that RubyAlert is listening for payments"
      ch.setShowBadge(false)
      ch.setSound(null, null)
      nm.createNotificationChannel(ch)
    }
    val open = PendingIntent.getActivity(
        this, 0, Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    val n: Notification = NotificationCompat.Builder(this, CHANNEL)
        .setSmallIcon(R.drawable.ic_stat_rubyalert)
        .setColor(ContextCompat.getColor(this, R.color.ruby))
        .setContentTitle("RubyAlert is live")
        .setContentText("Listening for payments — they will be announced instantly")
        .setOngoing(true)
        .setOnlyAlertOnce(true)
        .setSilent(true)
        .setPriority(NotificationCompat.PRIORITY_LOW)
        .setCategory(NotificationCompat.CATEGORY_SERVICE)
        .setContentIntent(open)
        .build()
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
        startForeground(NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
      } else {
        startForeground(NOTIF_ID, n)
      }
    } catch (e: Exception) {
      Log.w(TAG, "startForeground failed: ${e.message}")
      stopSelf()
    }
  }
}
