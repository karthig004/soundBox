package com.smartsoundbox.soundbox

import android.Manifest
import android.app.Notification
import android.content.pm.PackageManager
import androidx.core.content.ContextCompat
import android.content.ComponentName
import android.content.Context
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log
import com.facebook.react.ReactApplication
import com.facebook.react.ReactInstanceEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactContext
import com.facebook.react.jstasks.HeadlessJsTaskConfig
import com.facebook.react.jstasks.HeadlessJsTaskContext
import org.json.JSONObject

class SoundboxListenerService : NotificationListenerService() {

  companion object {
    private const val TAG = "SoundboxListener"
    @Volatile var connected = false
    private val MONEY = Regex(
        "(₹|rs\\.?\\s?\\d|inr\\s?\\d|rupees|credited|debited|रुपये|ரூபாய்)", RegexOption.IGNORE_CASE)
    private val recent = LinkedHashMap<Int, Long>()
    private val KNOWN_SMS_APPS = setOf(
        "com.google.android.apps.messaging", "com.samsung.android.messaging", "com.android.mms", "com.oneplus.mms")
    private val HIDDEN =Regex("(sensitive notification content hidden|content hidden|contents hidden)", RegexOption.IGNORE_CASE)
  }

  private var smsPkgCache: String? = null
  private var smsPkgCheckedAt = 0L

  /** The user can switch default SMS apps, so re-check at most once a minute. */
  private fun defaultSmsPackage(): String? {
    val now = System.currentTimeMillis()
    if (now - smsPkgCheckedAt > 60_000) {
      smsPkgCache = try { android.provider.Telephony.Sms.getDefaultSmsPackage(this) } catch (e: Exception) { null }
      smsPkgCheckedAt = now
    }
    return smsPkgCache
  }

  override fun onListenerConnected() {
    connected = true
    KeepAliveService.start(this)
  }

  override fun onListenerDisconnected() {
    connected = false
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      requestRebind(ComponentName(this, SoundboxListenerService::class.java))
    }
  }

  override fun onNotificationPosted(sbn: StatusBarNotification) {
    try {
      handle(sbn)
    } catch (e: Exception) {
      Log.w(TAG, "Failed to handle notification", e)
    }
  }

  private fun handle(sbn: StatusBarNotification) {
    val pkg = sbn.packageName ?: return
    if (pkg == packageName) return
    val prefs = SoundboxPrefs(this)
    if (!prefs.enabled) return

    val n = sbn.notification ?: return
    if ((n.flags and Notification.FLAG_GROUP_SUMMARY) != 0) return
    val extras = n.extras ?: return

    val title = (extras.getCharSequence(Notification.EXTRA_TITLE)
        ?: extras.getCharSequence(Notification.EXTRA_CONVERSATION_TITLE))?.toString() ?: ""
    val text = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString() ?: ""
    var big = extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString() ?: ""
    val sub = extras.getCharSequence(Notification.EXTRA_SUB_TEXT)?.toString() ?: ""

    // SMS apps use MessagingStyle; the full message body lives in EXTRA_MESSAGES.
    lastMessage(extras)?.let { if (it.length > big.length) big = it }
    if (big.isEmpty()) {
      extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES)?.lastOrNull()?.let { big = it.toString() }
    }

    val body = "$title $text $big"
    val isSmsApp = pkg == defaultSmsPackage() || pkg in KNOWN_SMS_APPS
    // Verify mode: SmsReceiver already read this SMS with its exact sender. Using the SMS app's
    // notification as well would process every bank SMS twice.
    if (isSmsApp && smsVerifyActive(prefs)) return
    val isDefaultSms = prefs.watchSms && pkg == defaultSmsPackage()
    val watched = prefs.watchedPackages.contains(pkg) || isDefaultSms
    // Only money-looking notifications ever leave this method; chats, promos without amounts etc. are dropped.
    if (!MONEY.containsMatchIn(body)) {
      // Android 15+ can redact notification text for third-party listeners. Make that visible.
      if (watched && (body.isBlank() || HIDDEN.containsMatchIn(body))) {
        DropLog.add(this, pkg, title, body.trim(), "Content hidden by Android — text not readable")
      }
      return
    }
    if (!watched && !prefs.captureUnknown) {
      DropLog.add(this, pkg, title, (big.ifEmpty { text }),
          "App not in Payment sources — enable it or turn on 'Capture other apps'")
      return
    }

    // Cheap native guard against the exact same notification re-posted within seconds.
    val sig = (pkg + "|" + title + "|" + text + "|" + big).hashCode()
    val now = System.currentTimeMillis()
    synchronized(recent) {
      val prev = recent[sig]
      if (prev != null && now - prev < 4000) return
      recent[sig] = now
      if (recent.size > 64) recent.remove(recent.keys.first())
    }

    val obj = JSONObject()
    obj.put("id", "${sbn.key}|${sbn.postTime}|$sig")
    obj.put("pkg", pkg)
    obj.put("title", title)
    obj.put("text", text)
    obj.put("bigText", big)
    obj.put("subText", sub)
    obj.put("postTime", sbn.postTime)
    obj.put("key", sbn.key)
    obj.put("origin", "notification")
    obj.put("watched", watched)
    obj.put("defaultSms", isDefaultSms)
    // Who sent the SMS according to the notification ("tel:+91…" means a person, not a bank).
    lastSenderUri(extras)?.let { obj.put("personUri", it) }
    EventBuffer.push(this, obj)
    Log.i("SoundboxTiming", "notification buffered pkg=$pkg at=$now")
    prefs.lastEventAt = now
    prefs.lastEventPkg = pkg

    HeadlessStarter.trigger(applicationContext)
  }

  private fun smsVerifyActive(prefs: SoundboxPrefs) =
      prefs.smsVerify && prefs.watchSms &&
          ContextCompat.checkSelfPermission(this, Manifest.permission.RECEIVE_SMS) == PackageManager.PERMISSION_GRANTED

  private fun lastSenderUri(extras: Bundle): String? {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) return null
    val msgs = extras.getParcelableArray(Notification.EXTRA_MESSAGES) ?: return null
    val last = msgs.lastOrNull() as? Bundle ?: return null
    @Suppress("DEPRECATION")
    val person = last.getParcelable<android.app.Person>("sender_person") ?: return null
    return person.uri ?: person.key
  }

  private fun lastMessage(extras: Bundle): String? {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) return null
    val msgs = extras.getParcelableArray(Notification.EXTRA_MESSAGES) ?: return null
    val last = msgs.lastOrNull() as? Bundle ?: return null
    return last.getCharSequence("text")?.toString()
  }
}

/** Starts the JS "SoundboxEvent" headless task, creating the React context if the app is not running. */
object HeadlessStarter {
  private val main = Handler(Looper.getMainLooper())

  /** Loads the JS engine ahead of time so the first payment doesn't wait for a cold start. */
  fun warm(ctx: Context) {
    main.post {
      try {
        val app = ctx.applicationContext as? ReactApplication ?: return@post
        val rim = app.reactNativeHost.reactInstanceManager
        if (rim.currentReactContext == null && !rim.hasStartedCreatingInitialContext()) rim.createReactContextInBackground()
      } catch (e: Exception) {
        Log.w("SoundboxHeadless", "Warm-up failed", e)
      }
    }
  }

  fun trigger(ctx: Context) {
    main.post {
      try {
        val app = ctx.applicationContext as? ReactApplication ?: return@post
        val rim = app.reactNativeHost.reactInstanceManager
        val rc = rim.currentReactContext
        if (rc != null) {
          start(rc)
        } else {
          rim.addReactInstanceEventListener(object : ReactInstanceEventListener {
            override fun onReactContextInitialized(context: ReactContext) {
              start(context)
              rim.removeReactInstanceEventListener(this)
            }
          })
          if (!rim.hasStartedCreatingInitialContext()) rim.createReactContextInBackground()
        }
      } catch (e: Exception) {
        Log.w("SoundboxHeadless", "Could not start headless task", e)
      }
    }
  }

  private fun start(rc: ReactContext) {
    HeadlessJsTaskContext.getInstance(rc)
        .startTask(HeadlessJsTaskConfig("SoundboxEvent", Arguments.createMap(), 60000, true))
  }
}
