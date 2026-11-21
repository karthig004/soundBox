package com.smartsoundbox.soundbox

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/** Native-side configuration that the listener service needs even when JS is not running. */
class SoundboxPrefs(ctx: Context) {
  private val sp = ctx.applicationContext.getSharedPreferences("soundbox_native", Context.MODE_PRIVATE)

  var enabled: Boolean
    get() = sp.getBoolean("enabled", true)
    set(v) = sp.edit().putBoolean("enabled", v).apply()

  var watchedPackages: Set<String>
    get() = sp.getStringSet("watched", emptySet()) ?: emptySet()
    set(v) = sp.edit().putStringSet("watched", HashSet(v)).apply()

  var captureUnknown: Boolean
    get() = sp.getBoolean("captureUnknown", false)
    set(v) = sp.edit().putBoolean("captureUnknown", v).apply()

  /** Watch the phone's default SMS app, whatever its package (Xiaomi, Vivo, Truecaller, …). */
  var watchSms: Boolean
    get() = sp.getBoolean("watchSms", true)
    set(v) = sp.edit().putBoolean("watchSms", v).apply()

  /** Read SMS directly (exact sender) instead of from the SMS app's notification. */
  var smsVerify: Boolean
    get() = sp.getBoolean("smsVerify", true)
    set(v) = sp.edit().putBoolean("smsVerify", v).apply()

  /** Run the foreground "Live" service so the soundbox survives being swiped away. */
  var keepAlive: Boolean
    get() = sp.getBoolean("keepAlive", true)
    set(v) = sp.edit().putBoolean("keepAlive", v).apply()

  var voiceLang: String
    get() = sp.getString("voiceLang", "en-IN") ?: "en-IN"
    set(v) = sp.edit().putString("voiceLang", v).apply()

  var voiceName: String
    get() = sp.getString("voiceName", "") ?: ""
    set(v) = sp.edit().putString("voiceName", v).apply()

  var lastEventAt: Long
    get() = sp.getLong("lastEventAt", 0L)
    set(v) = sp.edit().putLong("lastEventAt", v).apply()

  var lastEventPkg: String
    get() = sp.getString("lastEventPkg", "") ?: ""
    set(v) = sp.edit().putString("lastEventPkg", v).apply()
}

/**
 * Small ring buffer of payment-looking notifications the listener deliberately skipped,
 * with the reason. Shown in Diagnostics so "why wasn't this read?" is always answerable.
 */
object DropLog {
  private const val MAX = 60
  private val lock = Any()

  private fun sp(ctx: Context) =
      ctx.applicationContext.getSharedPreferences("soundbox_droplog", Context.MODE_PRIVATE)

  fun add(ctx: Context, pkg: String, title: String, text: String, reason: String) {
    synchronized(lock) {
      val arr = try { JSONArray(sp(ctx).getString("log", "[]")) } catch (e: Exception) { JSONArray() }
      val o = JSONObject()
      o.put("at", System.currentTimeMillis())
      o.put("pkg", pkg)
      o.put("title", title.take(60))
      o.put("snippet", text.take(120))
      o.put("reason", reason)
      val out = JSONArray().put(o)
      for (i in 0 until minOf(arr.length(), MAX - 1)) out.put(arr.get(i))
      sp(ctx).edit().putString("log", out.toString()).apply()
    }
  }

  fun read(ctx: Context): String = synchronized(lock) { sp(ctx).getString("log", "[]") ?: "[]" }

  fun clear(ctx: Context) = synchronized(lock) { sp(ctx).edit().putString("log", "[]").apply() }
}

/**
 * Durable FIFO of raw notification events. The listener appends, JS drains.
 * Survives process death so that no payment notification silently disappears.
 */
object EventBuffer {
  private const val MAX = 300
  private const val KEY = "events"
  private val lock = Any()

  private fun sp(ctx: Context) =
      ctx.applicationContext.getSharedPreferences("soundbox_events", Context.MODE_PRIVATE)

  fun push(ctx: Context, event: JSONObject) {
    synchronized(lock) {
      val arr = try { JSONArray(sp(ctx).getString(KEY, "[]")) } catch (e: Exception) { JSONArray() }
      arr.put(event)
      val trimmed = if (arr.length() > MAX) {
        val t = JSONArray()
        for (i in arr.length() - MAX until arr.length()) t.put(arr.get(i))
        t
      } else arr
      sp(ctx).edit().putString(KEY, trimmed.toString()).commit()
    }
  }

  fun drain(ctx: Context): String {
    synchronized(lock) {
      val s = sp(ctx).getString(KEY, "[]") ?: "[]"
      sp(ctx).edit().putString(KEY, "[]").commit()
      return s
    }
  }

  fun size(ctx: Context): Int =
      synchronized(lock) {
        try { JSONArray(sp(ctx).getString(KEY, "[]")).length() } catch (e: Exception) { 0 }
      }
}
