package com.smartsoundbox.soundbox

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.ComponentName
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.PowerManager
import android.os.VibrationEffect
import android.os.Vibrator
import android.provider.MediaStore
import android.provider.Settings
import android.speech.tts.TextToSpeech
import android.speech.tts.Voice
import android.util.Base64
import android.util.Log
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import androidx.fragment.app.FragmentActivity
import com.facebook.react.bridge.*
import java.io.File

class SoundboxModule(private val rc: ReactApplicationContext) : ReactContextBaseJavaModule(rc) {

  override fun getName() = "SoundboxNative"

  private val prefs by lazy { SoundboxPrefs(rc) }
  private var pickPromise: Promise? = null

  private val activityListener = object : BaseActivityEventListener() {
    override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
      if (requestCode != PICK_REQUEST) return
      val p = pickPromise ?: return
      pickPromise = null
      val uri = data?.data
      if (resultCode != Activity.RESULT_OK || uri == null) {
        p.resolve(null); return
      }
      try {
        val text = rc.contentResolver.openInputStream(uri)?.use { it.readBytes().toString(Charsets.UTF_8) } ?: ""
        val map = Arguments.createMap()
        map.putString("name", uri.lastPathSegment ?: "file")
        map.putString("content", text)
        p.resolve(map)
      } catch (e: Exception) {
        p.reject("read_failed", e.message, e)
      }
    }
  }

  init {
    rc.addActivityEventListener(activityListener)
  }

  companion object {
    private const val PICK_REQUEST = 7311
  }

  // ---------- Status & permissions ----------

  private fun notificationAccess(): Boolean =
      NotificationManagerCompat.getEnabledListenerPackages(rc).contains(rc.packageName)

  @ReactMethod
  fun getStatus(p: Promise) {
    val pm = rc.getSystemService(Context.POWER_SERVICE) as PowerManager
    val m = Arguments.createMap()
    m.putBoolean("notificationAccess", notificationAccess())
    m.putBoolean("listenerConnected", SoundboxListenerService.connected)
    m.putBoolean("ignoringBatteryOptimizations", pm.isIgnoringBatteryOptimizations(rc.packageName))
    m.putDouble("lastEventAt", prefs.lastEventAt.toDouble())
    m.putString("lastEventPkg", prefs.lastEventPkg)
    m.putInt("buffered", EventBuffer.size(rc))
    m.putInt("sdk", Build.VERSION.SDK_INT)
    m.putString("manufacturer", Build.MANUFACTURER)
    m.putString("model", Build.MODEL)
    m.putBoolean("ttsReady", SpeechEngine.isReady)
    m.putBoolean("smsPermission", ContextCompat.checkSelfPermission(rc, android.Manifest.permission.RECEIVE_SMS) == android.content.pm.PackageManager.PERMISSION_GRANTED)
    p.resolve(m)
  }

  private fun launch(intent: Intent, fallback: Intent? = null): Boolean {
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    return try {
      rc.startActivity(intent); true
    } catch (e: ActivityNotFoundException) {
      if (fallback != null) {
        fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        try { rc.startActivity(fallback); true } catch (_: Exception) { false }
      } else false
    }
  }

  @ReactMethod
  fun openNotificationAccess(p: Promise) {
    val detail = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      Intent(Settings.ACTION_NOTIFICATION_LISTENER_DETAIL_SETTINGS).putExtra(
          Settings.EXTRA_NOTIFICATION_LISTENER_COMPONENT_NAME,
          ComponentName(rc, SoundboxListenerService::class.java).flattenToString())
    } else Intent("android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS")
    p.resolve(launch(detail, Intent("android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS")))
  }

  @ReactMethod
  fun openBatterySettings(p: Promise) {
    p.resolve(launch(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS), appDetails()))
  }

  private fun appDetails() =
      Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + rc.packageName))

  @ReactMethod
  fun openAppSettings(p: Promise) = p.resolve(launch(appDetails()))

  @ReactMethod
  fun openTtsSettings(p: Promise) =
      p.resolve(launch(Intent("com.android.settings.TTS_SETTINGS"), Intent(Settings.ACTION_SETTINGS)))

  @ReactMethod
  fun installTtsData(p: Promise) =
      p.resolve(launch(Intent(TextToSpeech.Engine.ACTION_INSTALL_TTS_DATA)))

  @ReactMethod
  fun requestRebind(p: Promise) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N && notificationAccess()) {
      try {
        android.service.notification.NotificationListenerService.requestRebind(
            ComponentName(rc, SoundboxListenerService::class.java))
      } catch (_: Exception) {}
    }
    p.resolve(null)
  }

  @ReactMethod
  fun installedPackages(pkgs: ReadableArray, p: Promise) {
    val out = Arguments.createMap()
    for (i in 0 until pkgs.size()) {
      val name = pkgs.getString(i) ?: continue
      val ok = try { rc.packageManager.getPackageInfo(name, 0); true } catch (e: Exception) { false }
      out.putBoolean(name, ok)
    }
    p.resolve(out)
  }

  // ---------- Listener config & events ----------

  @ReactMethod
  fun setConfig(enabled: Boolean, watched: ReadableArray, captureUnknown: Boolean, watchSms: Boolean, smsVerify: Boolean, p: Promise) {
    prefs.enabled = enabled
    prefs.watchedPackages = (0 until watched.size()).mapNotNull { watched.getString(it) }.toSet()
    prefs.captureUnknown = captureUnknown
    prefs.watchSms = watchSms
    prefs.smsVerify = smsVerify
    p.resolve(null)
  }

  /**
   * Forces Android to reconnect the notification listener. requestRebind() alone is a no-op unless
   * the app unbound itself; toggling the service component makes the system drop and re-bind it.
   * Many OEMs (Xiaomi, Oppo, Vivo, Samsung) don't re-bind after the process was killed or updated.
   */
  @ReactMethod
  fun forceRebind(p: Promise) {
    val cn = ComponentName(rc, SoundboxListenerService::class.java)
    val pm = rc.packageManager
    try {
      pm.setComponentEnabledSetting(cn, android.content.pm.PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
          android.content.pm.PackageManager.DONT_KILL_APP)
      pm.setComponentEnabledSetting(cn, android.content.pm.PackageManager.COMPONENT_ENABLED_STATE_ENABLED,
          android.content.pm.PackageManager.DONT_KILL_APP)
    } catch (_: Exception) {}
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N && notificationAccess()) {
      try { android.service.notification.NotificationListenerService.requestRebind(cn) } catch (_: Exception) {}
    }
    p.resolve(null)
  }

  /** Opens the phone brand's "Autostart / background start" screen; falls back to app info. */
  @ReactMethod
  fun openAutostartSettings(p: Promise) {
    val candidates = listOf(
        "com.miui.securitycenter" to "com.miui.permcenter.autostart.AutoStartManagementActivity",
        "com.coloros.safecenter" to "com.coloros.safecenter.permission.startup.StartupAppListActivity",
        "com.coloros.safecenter" to "com.coloros.safecenter.startupapp.StartupAppListActivity",
        "com.oplus.safecenter" to "com.oplus.safecenter.permission.startup.StartupAppListActivity",
        "com.oppo.safe" to "com.oppo.safe.permission.startup.StartupAppListActivity",
        "com.vivo.permissionmanager" to "com.vivo.permissionmanager.activity.BgStartUpManagerActivity",
        "com.iqoo.secure" to "com.iqoo.secure.ui.phoneoptimize.AddWhiteListActivity",
        "com.huawei.systemmanager" to "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity",
        "com.huawei.systemmanager" to "com.huawei.systemmanager.optimize.process.ProtectActivity",
        "com.hihonor.systemmanager" to "com.hihonor.systemmanager.startupmgr.ui.StartupNormalAppListActivity",
        "com.oneplus.security" to "com.oneplus.security.chainlaunch.view.ChainLaunchAppListActivity",
        "com.samsung.android.lool" to "com.samsung.android.sm.battery.ui.BatteryActivity",
        "com.asus.mobilemanager" to "com.asus.mobilemanager.autostart.AutoStartActivity",
        "com.letv.android.letvsafe" to "com.letv.android.letvsafe.AutobootManageActivity",
    )
    for ((pkg, cls) in candidates) {
      val i = Intent().setComponent(ComponentName(pkg, cls)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      if (rc.packageManager.resolveActivity(i, 0) != null) {
        try {
          rc.startActivity(i); p.resolve("autostart"); return
        } catch (_: Exception) {}
      }
    }
    p.resolve(if (launch(appDetails())) "app-details" else "none")
  }

  @ReactMethod
  fun warmVoice(language: String, voice: String?, p: Promise) {
    prefs.voiceLang = language
    prefs.voiceName = voice ?: ""
    SpeechEngine.warm(rc, language, voice)
    p.resolve(null)
  }

  @ReactMethod
  fun setKeepAlive(on: Boolean, p: Promise) {
    prefs.keepAlive = on
    if (on) KeepAliveService.start(rc) else KeepAliveService.stop(rc)
    p.resolve(null)
  }

  @ReactMethod
  fun getDefaultSmsPackage(p: Promise) {
    p.resolve(try { android.provider.Telephony.Sms.getDefaultSmsPackage(rc) } catch (e: Exception) { null })
  }

  @ReactMethod
  fun getDropLog(p: Promise) = p.resolve(DropLog.read(rc))

  @ReactMethod
  fun clearDropLog(p: Promise) {
    DropLog.clear(rc); p.resolve(null)
  }

  @ReactMethod
  fun drainEvents(p: Promise) = p.resolve(EventBuffer.drain(rc))

  // ---------- Speech ----------

  @ReactMethod
  fun ttsInit(engine: String?, p: Promise) {
    SpeechEngine.ensure(rc, engine) { ok -> p.resolve(ok) }
  }

  private fun voiceMap(v: Voice): WritableMap {
    val m = Arguments.createMap()
    m.putString("id", v.name)
    m.putString("language", v.locale.toLanguageTag())
    m.putString("languageName", v.locale.displayName)
    m.putInt("quality", v.quality)
    m.putInt("latency", v.latency)
    m.putBoolean("network", v.isNetworkConnectionRequired)
    val features = v.features ?: emptySet()
    m.putBoolean("notInstalled", features.contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED))
    m.putString("gender", when {
      v.name.contains("female", true) -> "female"
      v.name.contains("male", true) -> "male"
      else -> ""
    })
    return m
  }

  @ReactMethod
  fun getVoices(p: Promise) {
    SpeechEngine.ensure(rc, null) {
      val arr = Arguments.createArray()
      SpeechEngine.voices().sortedBy { it.name }.forEach { arr.pushMap(voiceMap(it)) }
      p.resolve(arr)
    }
  }

  @ReactMethod
  fun getEngines(p: Promise) {
    SpeechEngine.ensure(rc, null) {
      val arr = Arguments.createArray()
      val def = SpeechEngine.defaultEngine()
      SpeechEngine.engines().forEach {
        val m = Arguments.createMap()
        m.putString("name", it.name)
        m.putString("label", it.label)
        m.putBoolean("isDefault", it.name == def)
        arr.pushMap(m)
      }
      p.resolve(arr)
    }
  }

  @ReactMethod
  fun getLanguageStatus(tag: String, p: Promise) {
    SpeechEngine.ensure(rc, null) { p.resolve(SpeechEngine.languageStatus(tag)) }
  }

  @ReactMethod
  fun speak(text: String, o: ReadableMap, p: Promise) {
    val opts = SpeakOptions(
        language = if (o.hasKey("language")) o.getString("language") ?: "en-IN" else "en-IN",
        voice = if (o.hasKey("voice") && !o.isNull("voice")) o.getString("voice") else null,
        pitch = if (o.hasKey("pitch")) o.getDouble("pitch").toFloat() else 1f,
        rate = if (o.hasKey("rate")) o.getDouble("rate").toFloat() else 1f,
        volume = if (o.hasKey("volume")) o.getDouble("volume").toFloat() else 1f,
        boostTo = if (o.hasKey("boostTo") && !o.isNull("boostTo")) o.getDouble("boostTo").toFloat() else null,
        duck = if (o.hasKey("duck")) o.getBoolean("duck") else true,
    )
    val engine = if (o.hasKey("engine") && !o.isNull("engine")) o.getString("engine") else null
    SpeechEngine.ensure(rc, engine) { ok ->
      if (!ok) {
        p.reject("tts_unavailable", "Text-to-speech engine is not available"); return@ensure
      }
      Log.i("SoundboxTiming", "speak start at=${System.currentTimeMillis()}")
      SpeechEngine.speak(rc, text, opts) { err ->
        if (err == null) p.resolve("done") else p.reject("tts_error", err)
      }
    }
  }

  @ReactMethod
  fun playClips(files: ReadableArray, o: ReadableMap, p: Promise) {
    val list = (0 until files.size()).mapNotNull { files.getString(it) }
    val missing = list.firstOrNull { !ClipPlayer.has(rc, it) }
    if (missing != null) { p.reject("clip_missing", "Voice clip $missing is not bundled"); return }
    val opts = SpeakOptions(
        pitch = if (o.hasKey("pitch")) o.getDouble("pitch").toFloat() else 1f,
        rate = if (o.hasKey("rate")) o.getDouble("rate").toFloat() else 1f,
        volume = if (o.hasKey("volume")) o.getDouble("volume").toFloat() else 1f,
        boostTo = if (o.hasKey("boostTo") && !o.isNull("boostTo")) o.getDouble("boostTo").toFloat() else null,
        duck = if (o.hasKey("duck")) o.getBoolean("duck") else true,
    )
    val gap = if (o.hasKey("gapMs")) o.getInt("gapMs") else 40
    ClipPlayer.play(rc, list, opts, gap) { err -> if (err == null) p.resolve("done") else p.reject("clip_error", err) }
  }

  @ReactMethod
  fun stopSpeaking(p: Promise) {
    SpeechEngine.stop(); p.resolve(null)
  }

  @ReactMethod
  fun playChime(id: String, volume: Double, p: Promise) {
    ChimePlayer.play(id, volume.toFloat()) { p.resolve(null) }
  }

  // ---------- Haptics ----------

  @ReactMethod
  fun vibrate(ms: Double) {
    val v = rc.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator ?: return
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        v.vibrate(VibrationEffect.createOneShot(ms.toLong().coerceAtLeast(5), VibrationEffect.DEFAULT_AMPLITUDE))
      } else {
        @Suppress("DEPRECATION")
        v.vibrate(ms.toLong())
      }
    } catch (_: Exception) {}
  }

  // ---------- Files ----------

  @ReactMethod
  fun saveFile(base64: String, filename: String, mime: String, p: Promise) {
    try {
      val bytes = Base64.decode(base64, Base64.DEFAULT)
      val dir = File(rc.cacheDir, "exports").apply { mkdirs() }
      val file = File(dir, filename)
      file.writeBytes(bytes)
      val shareUri = FileProvider.getUriForFile(rc, rc.packageName + ".fileprovider", file)

      var savedTo = ""
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        val values = ContentValues().apply {
          put(MediaStore.Downloads.DISPLAY_NAME, filename)
          put(MediaStore.Downloads.MIME_TYPE, mime)
          put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/RubyAlert")
        }
        rc.contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)?.let { uri ->
          rc.contentResolver.openOutputStream(uri)?.use { it.write(bytes) }
          savedTo = "Downloads/RubyAlert/$filename"
        }
      } else {
        rc.getExternalFilesDir(Environment.DIRECTORY_DOCUMENTS)?.let { ext ->
          val f = File(ext, filename); f.writeBytes(bytes); savedTo = f.absolutePath
        }
      }
      val m = Arguments.createMap()
      m.putString("uri", shareUri.toString())
      m.putString("savedTo", savedTo)
      p.resolve(m)
    } catch (e: Exception) {
      p.reject("save_failed", e.message, e)
    }
  }

  @ReactMethod
  fun shareFile(uri: String, mime: String, title: String, p: Promise) {
    val send = Intent(Intent.ACTION_SEND).apply {
      type = mime
      putExtra(Intent.EXTRA_STREAM, Uri.parse(uri))
      addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }
    val chooser = Intent.createChooser(send, title).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    p.resolve(launch(chooser))
  }

  @ReactMethod
  fun pickTextFile(p: Promise) {
    val act = currentActivity
    if (act == null) {
      p.reject("no_activity", "No foreground activity"); return
    }
    pickPromise = p
    val i = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
      addCategory(Intent.CATEGORY_OPENABLE)
      type = "*/*"
      putExtra(Intent.EXTRA_MIME_TYPES, arrayOf("text/csv", "text/comma-separated-values", "text/plain", "application/csv"))
    }
    try { act.startActivityForResult(i, PICK_REQUEST) } catch (e: Exception) {
      pickPromise = null; p.reject("picker_failed", e.message, e)
    }
  }

  // ---------- App lock ----------

  @ReactMethod
  fun canAuthenticate(p: Promise) {
    val r = BiometricManager.from(rc).canAuthenticate(
        BiometricManager.Authenticators.BIOMETRIC_WEAK or BiometricManager.Authenticators.DEVICE_CREDENTIAL)
    p.resolve(r == BiometricManager.BIOMETRIC_SUCCESS)
  }

  @ReactMethod
  fun authenticate(title: String, subtitle: String, p: Promise) {
    val act = currentActivity as? FragmentActivity
    if (act == null) {
      p.reject("no_activity", "No foreground activity"); return
    }
    act.runOnUiThread {
      try {
        val prompt = BiometricPrompt(act, ContextCompat.getMainExecutor(act),
            object : BiometricPrompt.AuthenticationCallback() {
              override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) = p.resolve(true)
              override fun onAuthenticationError(code: Int, msg: CharSequence) = p.resolve(false)
            })
        val info = BiometricPrompt.PromptInfo.Builder()
            .setTitle(title)
            .setSubtitle(subtitle)
            .setAllowedAuthenticators(
                BiometricManager.Authenticators.BIOMETRIC_WEAK or BiometricManager.Authenticators.DEVICE_CREDENTIAL)
            .build()
        prompt.authenticate(info)
      } catch (e: Exception) {
        p.reject("auth_failed", e.message, e)
      }
    }
  }
}
