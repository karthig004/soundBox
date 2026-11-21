package com.smartsoundbox.soundbox

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.Build
import android.os.Bundle
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.speech.tts.Voice
import java.util.Locale
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

data class SpeakOptions(
    val language: String = "en-IN",
    val voice: String? = null,
    val pitch: Float = 1f,
    val rate: Float = 1f,
    val volume: Float = 1f,
    /** 0..1 media volume to force while speaking, or null to leave the system volume alone. */
    val boostTo: Float? = null,
    val duck: Boolean = true,
)

/** Process-wide TextToSpeech wrapper shared by the React module and background work. */
object SpeechEngine {
  private var tts: TextToSpeech? = null
  private var engineName: String? = null
  @Volatile private var ready = false
  private val waiting = mutableListOf<(Boolean) -> Unit>()
  private val callbacks = ConcurrentHashMap<String, (String?) -> Unit>()
  private var focusRequest: AudioFocusRequest? = null
  private var restoreVolume: Int? = null

  val isReady get() = ready

  @Synchronized
  fun ensure(ctx: Context, engine: String? = null, cb: (Boolean) -> Unit) {
    val wanted = engine?.takeIf { it.isNotBlank() }
    if (tts != null && wanted == engineName) {
      if (ready) cb(true) else waiting.add(cb)
      return
    }
    tts?.shutdown()
    ready = false
    appliedKey = null
    engineName = wanted
    waiting.add(cb)
    val listener = TextToSpeech.OnInitListener { status ->
      val ok = status == TextToSpeech.SUCCESS
      ready = ok
      if (ok) attachListener()
      val list = synchronized(this) { waiting.toList().also { waiting.clear() } }
      list.forEach { it(ok) }
    }
    tts = if (wanted != null) TextToSpeech(ctx.applicationContext, listener, wanted)
    else TextToSpeech(ctx.applicationContext, listener)
  }

  private fun attachListener() {
    tts?.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
      override fun onStart(id: String?) {}
      override fun onDone(id: String?) { finish(id, null) }
      @Deprecated("Deprecated in Java")
      override fun onError(id: String?) { finish(id, "error") }
      override fun onError(id: String?, code: Int) { finish(id, "error:$code") }
      override fun onStop(id: String?, interrupted: Boolean) { finish(id, "stopped") }
    })
  }

  private var appCtx: Context? = null

  private fun finish(id: String?, err: String?) {
    if (id == null) return
    val cb = callbacks.remove(id) ?: return
    if (callbacks.isEmpty()) releaseAudio()
    cb(err)
  }

  fun voices(): List<Voice> = try { tts?.voices?.toList() ?: emptyList() } catch (e: Exception) { emptyList() }

  fun engines(): List<TextToSpeech.EngineInfo> = tts?.engines ?: emptyList()

  fun defaultEngine(): String? = tts?.defaultEngine

  fun languageStatus(tag: String): String {
    val t = tts ?: return "not-ready"
    return when (t.isLanguageAvailable(Locale.forLanguageTag(tag))) {
      TextToSpeech.LANG_MISSING_DATA -> "missing-data"
      TextToSpeech.LANG_NOT_SUPPORTED -> "not-supported"
      else -> "available"
    }
  }

  fun speak(ctx: Context, text: String, o: SpeakOptions, done: (String?) -> Unit) {
    appCtx = ctx.applicationContext
    val t = tts
    if (t == null || !ready) {
      done("not-ready"); return
    }
    applyVoice(t, o.language, o.voice)
    t.setPitch(o.pitch.coerceIn(0.25f, 2.5f))
    t.setSpeechRate(o.rate.coerceIn(0.25f, 3f))
    t.setAudioAttributes(AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_MEDIA)
        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
        .build())

    acquireAudio(o)
    val id = UUID.randomUUID().toString()
    callbacks[id] = done
    val params = Bundle().apply { putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, o.volume.coerceIn(0f, 1f)) }
    val r = t.speak(text, TextToSpeech.QUEUE_ADD, params, id)
    if (r != TextToSpeech.SUCCESS) finish(id, "speak-failed")
  }

  private var appliedKey: String? = null

  /**
   * Setting the language/voice makes Google TTS (re)load the voice model, which can take seconds.
   * Only do it when it actually changes.
   */
  private fun applyVoice(t: TextToSpeech, language: String, voice: String?) {
    val key = "$language|${voice ?: ""}"
    if (key == appliedKey) return
    val chosen = voice?.let { name -> voices().firstOrNull { it.name == name } }
    if (chosen != null) t.voice = chosen else t.language = Locale.forLanguageTag(language)
    appliedKey = key
  }

  /**
   * Loads the voice model ahead of time by silently synthesising one word to a file, so the first
   * real announcement starts immediately instead of waiting for the engine to load.
   */
  fun warm(ctx: Context, language: String, voice: String?) {
    ensure(ctx, null) { ok ->
      val t = tts
      if (!ok || t == null) return@ensure
      try {
        applyVoice(t, language, voice)
        val out = java.io.File(ctx.cacheDir, "tts_warm.wav")
        t.synthesizeToFile("ok", Bundle(), out, "warm-" + System.currentTimeMillis())
      } catch (_: Exception) {}
    }
  }

  /** Ducking / volume boost for audio played outside the TTS engine (bundled voice clips). */
  fun acquireFor(ctx: Context, o: SpeakOptions) {
    appCtx = ctx.applicationContext
    acquireAudio(o)
  }

  fun releaseFor() {
    if (callbacks.isEmpty()) releaseAudio()
  }

  fun stop() {
    ClipPlayer.stop()
    tts?.stop()
    val ids = callbacks.keys.toList()
    ids.forEach { finish(it, "stopped") }
    releaseAudio()
  }

  private fun audio(): AudioManager? = appCtx?.getSystemService(Context.AUDIO_SERVICE) as? AudioManager

  private fun acquireAudio(o: SpeakOptions) {
    val am = audio() ?: return
    if (o.boostTo != null && restoreVolume == null) {
      try {
        val max = am.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
        val target = (max * o.boostTo).toInt().coerceIn(1, max)
        val cur = am.getStreamVolume(AudioManager.STREAM_MUSIC)
        if (target > cur) {
          restoreVolume = cur
          am.setStreamVolume(AudioManager.STREAM_MUSIC, target, 0)
        }
      } catch (_: Exception) {}
    }
    if (o.duck && focusRequest == null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val req = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
          .setAudioAttributes(AudioAttributes.Builder()
              .setUsage(AudioAttributes.USAGE_MEDIA)
              .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
          .build()
      am.requestAudioFocus(req)
      focusRequest = req
    }
  }

  private fun releaseAudio() {
    val am = audio() ?: return
    restoreVolume?.let {
      try { am.setStreamVolume(AudioManager.STREAM_MUSIC, it, 0) } catch (_: Exception) {}
    }
    restoreVolume = null
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      focusRequest?.let { am.abandonAudioFocusRequest(it) }
    }
    focusRequest = null
  }
}
