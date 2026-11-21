package com.smartsoundbox.soundbox

import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * Voice → text using the phone's speech recogniser. Prefers on-device recognition (works offline
 * when the language's offline speech pack is installed). Emits "SpeechInput" events:
 * {type: 'partial'|'level'|'end', text?, level?}.
 */
class SpeechInputModule(private val rc: ReactApplicationContext) : ReactContextBaseJavaModule(rc) {
  override fun getName() = "SpeechInputNative"

  private val main = Handler(Looper.getMainLooper())
  private var recognizer: SpeechRecognizer? = null
  private var pending: Promise? = null

  private fun emit(type: String, text: String? = null, level: Double? = null) {
    val m = Arguments.createMap().apply {
      putString("type", type)
      text?.let { putString("text", it) }
      level?.let { putDouble("level", it) }
    }
    rc.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit("SpeechInput", m)
  }

  @ReactMethod fun addListener(name: String) {}
  @ReactMethod fun removeListeners(count: Int) {}

  @ReactMethod
  fun isAvailable(p: Promise) = p.resolve(SpeechRecognizer.isRecognitionAvailable(rc))

  /** Resolves with the final recognised text ("" if nothing was heard). */
  @ReactMethod
  fun start(lang: String, p: Promise) {
    main.post {
      if (!SpeechRecognizer.isRecognitionAvailable(rc)) {
        p.reject("unavailable", "No speech recogniser on this phone. Install/enable the Google app."); return@post
      }
      cleanup()
      pending = p
      val r = SpeechRecognizer.createSpeechRecognizer(rc)
      recognizer = r
      r.setRecognitionListener(object : RecognitionListener {
        override fun onReadyForSpeech(params: Bundle?) { emit("ready") }
        override fun onBeginningOfSpeech() {}
        override fun onRmsChanged(rmsdB: Float) { emit("level", level = ((rmsdB + 2) / 12.0).coerceIn(0.0, 1.0)) }
        override fun onBufferReceived(buffer: ByteArray?) {}
        override fun onEndOfSpeech() { emit("end") }
        override fun onPartialResults(b: Bundle?) {
          b?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()?.let { emit("partial", it) }
        }
        override fun onEvent(eventType: Int, params: Bundle?) {}
        override fun onResults(b: Bundle?) {
          val text = b?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull() ?: ""
          finish { it.resolve(text) }
        }
        override fun onError(error: Int) {
          val msg = when (error) {
            SpeechRecognizer.ERROR_NO_MATCH, SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> null
            SpeechRecognizer.ERROR_NETWORK, SpeechRecognizer.ERROR_NETWORK_TIMEOUT, SpeechRecognizer.ERROR_SERVER ->
              "network: Offline speech pack for this language isn't installed — connect to the internet or download it in Google voice settings."
            SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "permission: Microphone permission denied"
            SpeechRecognizer.ERROR_LANGUAGE_NOT_SUPPORTED, SpeechRecognizer.ERROR_LANGUAGE_UNAVAILABLE ->
              "language: This language isn't available for voice input on this phone"
            SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "busy: Voice input is busy, try again"
            else -> "error: Voice input failed ($error)"
          }
          finish { if (msg == null) it.resolve("") else it.reject(msg.substringBefore(':'), msg.substringAfter(": ")) }
        }
      })
      val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
        putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
        putExtra(RecognizerIntent.EXTRA_LANGUAGE, lang)
        putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, lang)
        putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
        putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true)
        putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
        putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 1800L)
      }
      r.startListening(intent)
    }
  }

  /** Stop listening and return what was heard so far. */
  @ReactMethod
  fun stop(p: Promise) {
    main.post { recognizer?.stopListening(); p.resolve(null) }
  }

  @ReactMethod
  fun cancel(p: Promise) {
    main.post { finish { it.resolve("") }; p.resolve(null) }
  }

  private fun finish(block: (Promise) -> Unit) {
    val p = pending
    pending = null
    cleanup()
    p?.let(block)
  }

  private fun cleanup() {
    recognizer?.let { try { it.cancel(); it.destroy() } catch (_: Exception) {} }
    recognizer = null
  }

  override fun invalidate() {
    main.post { cleanup() }
    super.invalidate()
  }
}
