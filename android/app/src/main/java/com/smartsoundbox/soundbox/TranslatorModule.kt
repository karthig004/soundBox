package com.smartsoundbox.soundbox

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.google.mlkit.common.model.DownloadConditions
import com.google.mlkit.common.model.RemoteModelManager
import com.google.mlkit.nl.translate.TranslateLanguage
import com.google.mlkit.nl.translate.TranslateRemoteModel
import com.google.mlkit.nl.translate.Translation
import com.google.mlkit.nl.translate.Translator
import com.google.mlkit.nl.translate.TranslatorOptions
import java.util.concurrent.ConcurrentHashMap

/**
 * On-device translation (Google ML Kit, the engine behind Google Translate's offline packs). Each
 * language model (~30 MB) is downloaded once; after that translation runs fully offline.
 * English is always present. The JS side splits text into sentences and calls [translate] per sentence.
 */
class TranslatorModule(rc: ReactApplicationContext) : ReactContextBaseJavaModule(rc) {
  override fun getName() = "TranslatorNative"

  private val models = RemoteModelManager.getInstance()
  private val translators = ConcurrentHashMap<String, Translator>()
  /** Pairs whose models are already loaded into their Translator (so we skip the load step). */
  private val loaded = ConcurrentHashMap.newKeySet<String>()

  private fun code(lang: String): String =
      TranslateLanguage.fromLanguageTag(lang) ?: throw IllegalArgumentException("Unsupported language: $lang")

  private fun translator(from: String, to: String): Translator =
      translators.getOrPut("$from>$to") {
        Translation.getClient(TranslatorOptions.Builder().setSourceLanguage(code(from)).setTargetLanguage(code(to)).build())
      }

  /** Drops cached translators (e.g. after a model is deleted) so none keeps a removed model alive. */
  private fun resetTranslators() {
    loaded.clear()
    val old = translators.values.toList()
    translators.clear()
    old.forEach { it.close() }
  }

  @ReactMethod
  fun downloadedLanguages(p: Promise) {
    models.getDownloadedModels(TranslateRemoteModel::class.java)
        .addOnSuccessListener { set -> p.resolve(Arguments.fromList(set.map { it.language })) }
        .addOnFailureListener { p.reject("translate_error", it.message, it) }
  }

  @ReactMethod
  fun downloadLanguage(lang: String, wifiOnly: Boolean, p: Promise) {
    try {
      val cond = DownloadConditions.Builder().apply { if (wifiOnly) requireWifi() }.build()
      models.download(TranslateRemoteModel.Builder(code(lang)).build(), cond)
          .addOnSuccessListener { p.resolve(true) }
          .addOnFailureListener { p.reject("download_failed", it.message, it) }
    } catch (e: Exception) { p.reject("translate_error", e.message, e) }
  }

  @ReactMethod
  fun deleteLanguage(lang: String, p: Promise) {
    try {
      models.deleteDownloadedModel(TranslateRemoteModel.Builder(code(lang)).build())
          .addOnSuccessListener { resetTranslators(); p.resolve(true) }
          .addOnFailureListener { p.reject("translate_error", it.message, it) }
    } catch (e: Exception) { p.reject("translate_error", e.message, e) }
  }

  /** Never downloads: rejects with "model_missing" if a model isn't on the device yet. */
  @ReactMethod
  fun translate(text: String, from: String, to: String, p: Promise) {
    try {
      if (from == to || text.isBlank()) { p.resolve(text); return }
      val src = code(from)
      val dst = code(to)
      val key = "$from>$to"
      val t = translator(from, to)
      models.getDownloadedModels(TranslateRemoteModel::class.java).addOnSuccessListener { set ->
        val have = set.map { it.language }.toSet() + TranslateLanguage.ENGLISH
        val missing = listOf(src, dst).filter { it !in have }
        if (missing.isNotEmpty()) { p.reject("model_missing", missing.joinToString(",")); return@addOnSuccessListener }
        val run = {
          t.translate(text)
              .addOnSuccessListener { out -> p.resolve(out) }
              .addOnFailureListener { e -> p.reject("translate_error", e.message, e) }
        }
        if (key in loaded) run()
        else {
          // Both models are already on the phone, so this only loads them (no network).
          t.downloadModelIfNeeded(DownloadConditions.Builder().build())
              .addOnSuccessListener { loaded.add(key); run() }
              .addOnFailureListener { e -> p.reject("translate_error", e.message, e) }
        }
      }.addOnFailureListener { p.reject("translate_error", it.message, it) }
    } catch (e: Exception) { p.reject("translate_error", e.message, e) }
  }

  override fun invalidate() {
    resetTranslators()
    super.invalidate()
  }
}
