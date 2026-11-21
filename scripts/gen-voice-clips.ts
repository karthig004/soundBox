/**
 * Generates the bundled voice clips (Tamil / Hindi / English) used for offline announcements.
 *
 *   npx tsx scripts/gen-voice-clips.ts            # only missing clips
 *   npx tsx scripts/gen-voice-clips.ts --force    # regenerate everything
 *
 * PLACEHOLDER AUDIO: clips are synthesised with Microsoft Edge's online neural voices (needs internet
 * while generating only). Before a commercial release, replace them with licensed recordings or a
 * paid cloud TTS: keep the same file names (see src/voice/clipManifest.json) and just overwrite the mp3s.
 *
 * Output:
 *   android/app/src/main/assets/voice/*.mp3   (Android)
 *   ios/SmartSoundbox/voice/*.mp3             (iOS — add the folder to the Xcode target once, as a folder reference)
 *   src/voice/clipManifest.json               (what the app can speak with clips)
 */
import fs from 'node:fs';
import path from 'node:path';
import {MsEdgeTTS, OUTPUT_FORMAT} from 'msedge-tts';
import {buildVocab, clipFile, CLIP_LANGS} from '../src/voice/clipVocab';

const VOICES: Record<string, string> = {
  ta: 'ta-IN-PallaviNeural',
  hi: 'hi-IN-SwaraNeural',
  en: 'en-IN-NeerjaNeural',
};

const root = path.resolve(__dirname, '..');
const outDirs = [path.join(root, 'android/app/src/main/assets/voice'), path.join(root, 'ios/SmartSoundbox/voice')];
const force = process.argv.includes('--force');

async function synth(tts: MsEdgeTTS, text: string): Promise<Buffer> {
  const {audioStream} = tts.toStream(text);
  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    audioStream.on('data', (c: Buffer) => chunks.push(c));
    audioStream.on('end', () => resolve());
    audioStream.on('error', reject);
  });
  const buf = Buffer.concat(chunks);
  if (buf.length < 500) throw new Error(`empty audio for "${text}"`);
  return buf;
}

async function main() {
  outDirs.forEach(d => fs.mkdirSync(d, {recursive: true}));
  const manifest: Record<string, Record<string, string>> = {};
  for (const lang of CLIP_LANGS) {
    const vocab = buildVocab(lang);
    manifest[lang] = {};
    let tts = new MsEdgeTTS();
    await tts.setMetadata(VOICES[lang], OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    let made = 0;
    for (const text of vocab) {
      const file = clipFile(lang, text);
      manifest[lang][text] = file;
      const targets = outDirs.map(d => path.join(d, file));
      if (!force && targets.every(t => fs.existsSync(t))) continue;
      let audio: Buffer | undefined;
      for (let attempt = 0; attempt < 4 && !audio; attempt++) {
        try {
          audio = await synth(tts, text);
        } catch (e) {
          console.warn(`  retry ${lang} "${text}": ${(e as Error).message}`);
          tts.close();
          tts = new MsEdgeTTS();
          await tts.setMetadata(VOICES[lang], OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
        }
      }
      if (!audio) throw new Error(`failed: ${lang} "${text}"`);
      targets.forEach(t => fs.writeFileSync(t, audio!));
      made++;
      if (made % 25 === 0) console.log(`  ${lang}: ${made} generated`);
    }
    tts.close();
    console.log(`${lang}: ${vocab.length} clips (${made} new)`);
  }
  // Drop clips no longer in the vocabulary.
  const keep = new Set(Object.values(manifest).flatMap(m => Object.values(m)));
  for (const d of outDirs) for (const f of fs.readdirSync(d)) if (f.endsWith('.mp3') && !keep.has(f)) fs.unlinkSync(path.join(d, f));
  fs.writeFileSync(path.join(root, 'src/voice/clipManifest.json'), JSON.stringify(manifest, null, 1) + '\n');
  console.log('manifest written');
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
