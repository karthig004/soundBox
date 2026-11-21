package com.smartsoundbox.soundbox

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import android.os.Handler
import android.os.Looper
import kotlin.math.PI
import kotlin.math.exp
import kotlin.math.min
import kotlin.math.sin

/**
 * Synthesises announcement chimes in-process, so no audio assets ship with the app
 * and every tone works offline.
 */
object ChimePlayer {
  private const val RATE = 44100
  private val main = Handler(Looper.getMainLooper())
  private val cache = HashMap<String, ShortArray>()
  private var current: AudioTrack? = null

  /** freq Hz, start s, length s, amplitude, decay per second, extra (multiplier, gain) partials. */
  private data class Note(
      val f: Double,
      val t: Double,
      val len: Double,
      val amp: Double = 0.6,
      val decay: Double = 4.0,
      val partials: List<Pair<Double, Double>> = emptyList(),
      val attack: Double = 0.004,
  )

  private val BELL = listOf(2.0 to 0.25, 3.01 to 0.12, 4.2 to 0.06)
  private val GLASS = listOf(2.76 to 0.3, 5.4 to 0.12, 8.93 to 0.05)
  private val MARIMBA = listOf(4.0 to 0.35, 10.0 to 0.08)
  private val SQUAREISH = listOf(3.0 to 0.3, 5.0 to 0.16, 7.0 to 0.08)

  private fun notes(id: String): Pair<List<Note>, Double> = when (id) {
    "classic" -> listOf(
        Note(1318.5, 0.0, 0.9, 0.55, 3.5, BELL),
        Note(1046.5, 0.30, 1.2, 0.55, 2.6, BELL)) to 0.0
    "cash" -> listOf(
        Note(2093.0, 0.07, 0.5, 0.35, 7.0, GLASS),
        Note(2637.0, 0.07, 0.5, 0.30, 7.0, GLASS),
        Note(3136.0, 0.20, 0.9, 0.40, 4.0, GLASS),
        Note(4186.0, 0.20, 0.8, 0.22, 5.0)) to 0.07
    "coin" -> listOf(
        Note(987.8, 0.0, 0.09, 0.45, 2.0, SQUAREISH),
        Note(1318.5, 0.09, 0.55, 0.45, 5.0, SQUAREISH)) to 0.0
    "bell" -> listOf(Note(880.0, 0.0, 2.0, 0.6, 1.8, GLASS)) to 0.0
    "digital" -> listOf(
        Note(1760.0, 0.0, 0.07, 0.5, 0.0, SQUAREISH),
        Note(1760.0, 0.13, 0.07, 0.5, 0.0, SQUAREISH),
        Note(2349.0, 0.26, 0.14, 0.5, 0.0, SQUAREISH)) to 0.0
    "marimba" -> listOf(
        Note(523.3, 0.00, 0.5, 0.6, 9.0, MARIMBA),
        Note(659.3, 0.09, 0.5, 0.6, 9.0, MARIMBA),
        Note(784.0, 0.18, 0.5, 0.6, 9.0, MARIMBA),
        Note(1046.5, 0.27, 0.8, 0.6, 6.0, MARIMBA)) to 0.0
    "success" -> listOf(
        Note(784.0, 0.0, 0.25, 0.5, 6.0, BELL),
        Note(1046.5, 0.12, 0.3, 0.5, 6.0, BELL),
        Note(1318.5, 0.24, 0.9, 0.55, 3.0, BELL)) to 0.0
    "soft" -> listOf(
        Note(523.3, 0.0, 1.4, 0.35, 2.0, attack = 0.06),
        Note(659.3, 0.0, 1.4, 0.30, 2.0, attack = 0.06),
        Note(784.0, 0.15, 1.3, 0.25, 2.2, attack = 0.06)) to 0.0
    "airport" -> listOf(
        Note(440.0, 0.0, 1.0, 0.5, 2.2, BELL),
        Note(554.4, 0.38, 1.0, 0.5, 2.2, BELL),
        Note(659.3, 0.76, 1.5, 0.5, 1.8, BELL)) to 0.0
    "drop" -> listOf(
        Note(1600.0, 0.0, 0.06, 0.4, 25.0),
        Note(1200.0, 0.05, 0.06, 0.4, 25.0),
        Note(2400.0, 0.10, 0.4, 0.35, 9.0, GLASS)) to 0.0
    else -> emptyList<Note>() to 0.0
  }

  private fun render(id: String): ShortArray {
    cache[id]?.let { return it }
    val (ns, noise) = notes(id)
    if (ns.isEmpty()) return ShortArray(0)
    val total = ns.maxOf { it.t + it.len } + 0.05
    val n = (total * RATE).toInt()
    val buf = DoubleArray(n)
    for (note in ns) {
      val s0 = (note.t * RATE).toInt()
      val len = (note.len * RATE).toInt()
      val atk = (note.attack * RATE).toInt().coerceAtLeast(1)
      for (i in 0 until len) {
        val idx = s0 + i
        if (idx >= n) break
        val t = i.toDouble() / RATE
        val env = min(1.0, i.toDouble() / atk) * exp(-note.decay * t) *
            min(1.0, (len - i).toDouble() / (0.01 * RATE)) // short release, no clicks
        var v = sin(2 * PI * note.f * t)
        for ((mul, g) in note.partials) v += g * sin(2 * PI * note.f * mul * t)
        buf[idx] += note.amp * env * v
      }
    }
    if (noise > 0) {
      // "cha" of the cash register: a decaying, deterministic noise burst.
      var seed = 12345L
      val len = (noise * RATE).toInt()
      for (i in 0 until min(len, n)) {
        seed = (seed * 1103515245 + 12345) and 0x7fffffff
        val r = (seed % 2000) / 1000.0 - 1.0
        buf[i] += 0.35 * r * exp(-30.0 * i / RATE)
      }
    }
    var peak = 0.0
    for (v in buf) if (kotlin.math.abs(v) > peak) peak = kotlin.math.abs(v)
    val k = if (peak > 0) 0.92 / peak else 1.0
    val out = ShortArray(n) { (buf[it] * k * Short.MAX_VALUE).toInt().toShort() }
    cache[id] = out
    return out
  }

  /** Plays chime [id] at [volume] (0..1). [done] runs on the main thread when playback is over. */
  fun play(id: String, volume: Float, done: () -> Unit) {
    val pcm = render(id)
    if (pcm.isEmpty()) {
      done(); return
    }
    try {
      current?.release()
      val track = AudioTrack.Builder()
          .setAudioAttributes(AudioAttributes.Builder()
              .setUsage(AudioAttributes.USAGE_MEDIA)
              .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
              .build())
          .setAudioFormat(AudioFormat.Builder()
              .setSampleRate(RATE)
              .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
              .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
              .build())
          .setBufferSizeInBytes(pcm.size * 2)
          .setTransferMode(AudioTrack.MODE_STATIC)
          .build()
      track.write(pcm, 0, pcm.size)
      track.setVolume(volume.coerceIn(0f, 1f))
      track.play()
      current = track
      val ms = pcm.size * 1000L / RATE
      // Let the voice start while the chime's fading tail is still ringing — feels instant.
      main.postDelayed({ done() }, (ms * 0.7).toLong())
      main.postDelayed({
        try { track.release() } catch (_: Exception) {}
        if (current === track) current = null
      }, ms + 30)
    } catch (e: Exception) {
      done()
    }
  }
}
