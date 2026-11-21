package com.smartsoundbox.soundbox

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.PlaybackParams
import android.os.Build
import android.os.Handler
import android.os.Looper
import java.io.ByteArrayOutputStream
import java.nio.ByteOrder
import java.util.concurrent.Executors
import kotlin.math.abs

/**
 * Plays bundled voice clips (mp3 files in assets/voice) back-to-back as one seamless utterance.
 * This works on every device with no TTS voice data, so Tamil/Hindi never need a download.
 */
object ClipPlayer {
  private const val SILENCE = 350          // |sample| below this counts as silence when trimming
  private val main = Handler(Looper.getMainLooper())
  private val worker = Executors.newSingleThreadExecutor()
  private val cache = HashMap<String, Pair<ShortArray, Int>>() // file -> (pcm mono, sampleRate)
  private var track: AudioTrack? = null
  private var pendingDone: ((String?) -> Unit)? = null
  private var endCheck: Runnable? = null

  fun has(ctx: Context, file: String): Boolean =
      try { ctx.assets.openFd("voice/$file").close(); true } catch (_: Exception) { false }

  fun play(ctx: Context, files: List<String>, o: SpeakOptions, gapMs: Int, done: (String?) -> Unit) {
    stop()
    val app = ctx.applicationContext
    worker.execute {
      try {
        var rate = 0
        val parts = files.map { f -> decode(app, f).also { if (rate == 0) rate = it.second }.first }
        if (parts.isEmpty() || rate == 0) { main.post { done("no-clips") }; return@execute }
        val gap = ShortArray(rate * gapMs / 1000)
        val total = parts.sumOf { it.size } + gap.size * (parts.size - 1)
        val pcm = ShortArray(total)
        var pos = 0
        parts.forEachIndexed { i, p ->
          if (i > 0) pos += gap.size
          System.arraycopy(p, 0, pcm, pos, p.size); pos += p.size
        }
        main.post { start(app, pcm, rate, o, done) }
      } catch (e: Exception) {
        main.post { done("clip-error:${e.message}") }
      }
    }
  }

  private fun start(ctx: Context, pcm: ShortArray, rate: Int, o: SpeakOptions, done: (String?) -> Unit) {
    SpeechEngine.acquireFor(ctx, o)
    val t = AudioTrack.Builder()
        .setAudioAttributes(AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_MEDIA)
            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
        .setAudioFormat(AudioFormat.Builder()
            .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
            .setSampleRate(rate)
            .setChannelMask(AudioFormat.CHANNEL_OUT_MONO).build())
        .setTransferMode(AudioTrack.MODE_STATIC)
        .setBufferSizeInBytes(pcm.size * 2)
        .build()
    t.write(pcm, 0, pcm.size)
    t.setVolume(o.volume.coerceIn(0f, 1f))
    val speed = o.rate.coerceIn(0.5f, 2f)
    val pitch = o.pitch.coerceIn(0.5f, 2f)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && (speed != 1f || pitch != 1f)) {
      try { t.playbackParams = PlaybackParams().setSpeed(speed).setPitch(pitch) } catch (_: Exception) {}
    }
    track = t
    pendingDone = done
    t.play()
    // Static tracks don't reliably fire an end callback on every OEM; poll the play head instead.
    val frames = pcm.size
    val check = object : Runnable {
      override fun run() {
        val cur = track ?: return
        if (cur !== t) return
        if (t.playbackHeadPosition >= frames || t.playState != AudioTrack.PLAYSTATE_PLAYING) finish(null)
        else main.postDelayed(this, 40)
      }
    }
    endCheck = check
    main.postDelayed(check, 80)
  }

  private fun finish(err: String?) {
    endCheck?.let { main.removeCallbacks(it) }
    endCheck = null
    track?.let { try { it.stop() } catch (_: Exception) {}; it.release() }
    track = null
    val cb = pendingDone
    pendingDone = null
    SpeechEngine.releaseFor()
    cb?.invoke(err)
  }

  fun stop() {
    if (track != null || pendingDone != null) finish("stopped")
  }

  /** Decodes an mp3 asset to mono 16-bit PCM and trims leading/trailing silence. Cached. */
  @Synchronized
  private fun decode(ctx: Context, file: String): Pair<ShortArray, Int> {
    cache[file]?.let { return it }
    val ex = MediaExtractor()
    val fd = ctx.assets.openFd("voice/$file")
    ex.setDataSource(fd.fileDescriptor, fd.startOffset, fd.length)
    fd.close()
    val fmt = ex.getTrackFormat(0)
    ex.selectTrack(0)
    val codec = MediaCodec.createDecoderByType(fmt.getString(MediaFormat.KEY_MIME)!!)
    codec.configure(fmt, null, null, 0)
    codec.start()
    val out = ByteArrayOutputStream()
    val info = MediaCodec.BufferInfo()
    var inDone = false
    var rate = fmt.getInteger(MediaFormat.KEY_SAMPLE_RATE)
    var channels = fmt.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
    while (true) {
      if (!inDone) {
        val ii = codec.dequeueInputBuffer(10000)
        if (ii >= 0) {
          val buf = codec.getInputBuffer(ii)!!
          val n = ex.readSampleData(buf, 0)
          if (n < 0) {
            codec.queueInputBuffer(ii, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM); inDone = true
          } else {
            codec.queueInputBuffer(ii, 0, n, ex.sampleTime, 0); ex.advance()
          }
        }
      }
      val oi = codec.dequeueOutputBuffer(info, 10000)
      if (oi == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
        codec.outputFormat.let { rate = it.getInteger(MediaFormat.KEY_SAMPLE_RATE); channels = it.getInteger(MediaFormat.KEY_CHANNEL_COUNT) }
      } else if (oi >= 0) {
        val b = codec.getOutputBuffer(oi)!!
        val bytes = ByteArray(info.size)
        b.position(info.offset); b.get(bytes)
        out.write(bytes)
        codec.releaseOutputBuffer(oi, false)
        if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) break
      }
    }
    codec.stop(); codec.release(); ex.release()
    val bb = java.nio.ByteBuffer.wrap(out.toByteArray()).order(ByteOrder.LITTLE_ENDIAN).asShortBuffer()
    val all = ShortArray(bb.remaining()).also { bb.get(it) }
    val mono = if (channels <= 1) all else ShortArray(all.size / channels) { all[it * channels] }
    val r = trim(mono, rate) to rate
    cache[file] = r
    return r
  }

  private fun trim(s: ShortArray, rate: Int): ShortArray {
    var a = 0
    var b = s.size - 1
    while (a < b && abs(s[a].toInt()) < SILENCE) a++
    while (b > a && abs(s[b].toInt()) < SILENCE) b--
    val pad = rate * 25 / 1000
    a = (a - pad).coerceAtLeast(0)
    b = (b + pad).coerceAtMost(s.size - 1)
    return s.copyOfRange(a, b + 1)
  }
}
