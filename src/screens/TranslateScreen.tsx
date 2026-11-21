import React, {useCallback, useEffect, useRef, useState} from 'react';
import {ActivityIndicator, Share, TextInput, View} from 'react-native';
import Animated, {FadeIn, FadeInDown} from 'react-native-reanimated';
import {Screen} from '../components/Screen';
import {toast} from '../components/Toast';
import {Button, Card, Chip, Icon, Row, T, Tap, Toggle} from '../components/ui';
import {Waveform} from '../components/motion';
import {SpeechInput} from '../native/SpeechInput';
import {preview, stopAll} from '../engine/announcer';
import type {Lang} from '../engine/types';
import {Engine, ModelMissingError, TR_LANGS, Translator, TrLang} from '../native/Translator';
import {useSettings} from '../store/settings';
import {useTheme} from '../theme';

const PAIRS: [TrLang, TrLang][] = [
  ['en', 'ta'],
  ['ta', 'en'],
  ['en', 'hi'],
  ['hi', 'en'],
  ['ta', 'hi'],
  ['hi', 'ta'],
];
const short = (l: TrLang) => l.toUpperCase();
const nameOf = (l: TrLang) => TR_LANGS.find(x => x.id === l)!;

export function TranslateScreen() {
  const {c, radius} = useTheme();
  const [from, setFrom] = useState<TrLang>('en');
  const [to, setTo] = useState<TrLang>('ta');
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [busy, setBusy] = useState(false);
  const [missing, setMissing] = useState<string[]>([]);
  /** Language packs on the phone; null until first read. */
  const [have, setHave] = useState<string[] | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [engine, setEngine] = useState<Engine | null>(null);
  const online = useSettings(s => s.translateOnline);
  const setSettings = useSettings(s => s.set);
  const [history, setHistory] = useState<{from: TrLang; to: TrLang; src: string; out: string}[]>([]);
  const seq = useRef(0);
  const [listening, setListening] = useState<TrLang | null>(null);
  const [autoSpeak, setAutoSpeak] = useState(true);
  const speakNext = useRef(false);

  useEffect(
    () =>
      SpeechInput.listen(e => {
        if (e.type === 'partial' && e.text) setInput(e.text);
      }),
    [],
  );
  useEffect(() => () => void SpeechInput.cancel(), []);

  /** Tap a language's mic: speak in that language, it's written down and translated to the other. */
  const mic = async (lang: TrLang) => {
    if (listening) {
      SpeechInput.stop();
      return;
    }
    if (!(await SpeechInput.ensurePermission())) {
      toast('Microphone permission needed', 'error');
      return;
    }
    const other = lang === from ? to : lang === to ? from : 'en';
    await stopAll();
    setFrom(lang);
    setTo(other === lang ? (lang === 'en' ? 'ta' : 'en') : other);
    setInput('');
    setOutput('');
    setListening(lang);
    try {
      const text = await SpeechInput.start(lang);
      if (text) {
        setInput(text);
        speakNext.current = autoSpeak;
      } else toast('Didn’t catch that — try again', 'info');
    } catch (e: any) {
      toast('Voice input unavailable', 'error', String(e?.message ?? e));
    } finally {
      setListening(null);
    }
  };

  const refresh = useCallback(() => Translator.downloaded().then(setHave).catch(() => {}), []);
  useEffect(() => {
    refresh();
  }, [refresh]);

  const ready = (l: TrLang) => l === 'en' || !!have?.includes(l);
  const absent = TR_LANGS.filter(l => have && !ready(l.id));

  const run = useCallback(
    async (text: string, f: TrLang, t: TrLang) => {
      const id = ++seq.current;
      if (!text.trim()) {
        setOutput('');
        setEngine(null);
        setMissing([]);
        setBusy(false);
        return;
      }
      setBusy(true);
      try {
        const res = await Translator.translate(text.trim(), f, t, {online});
        if (id !== seq.current) return;
        setOutput(res.text);
        setEngine(res.engine);
        setMissing([]);
        if (speakNext.current) {
          speakNext.current = false;
          preview(res.text, t as Lang, {source: 'device'}, false).catch(() => {});
        }
      } catch (e: any) {
        if (id !== seq.current) return;
        setOutput('');
        setEngine(null);
        if (e instanceof ModelMissingError) setMissing(e.langs);
        else toast('Translation failed', 'error', String(e?.message ?? e));
      } finally {
        if (id === seq.current) setBusy(false);
      }
    },
    [online],
  );

  // Translate as you type (debounced).
  useEffect(() => {
    const h = setTimeout(() => run(input, from, to), 450);
    return () => clearTimeout(h);
  }, [input, from, to, have, run]);

  const pick = (f: TrLang, t: TrLang) => {
    setFrom(f);
    setTo(t);
  };
  const swap = () => {
    setFrom(to);
    setTo(from);
    if (output) setInput(output);
  };

  const download = async (l: TrLang) => {
    setDownloading(l);
    try {
      await Translator.download(l);
      await refresh();
      toast(`${nameOf(l).name} ready offline`, 'success');
    } catch (e: any) {
      toast('Download failed — connect to the internet once', 'error', String(e?.message ?? e));
    } finally {
      setDownloading(null);
    }
  };

  /** One tap: fetch every pack that is missing, so the whole screen works with no internet. */
  const downloadAll = async () => {
    setDownloading('all');
    try {
      for (const l of absent) await Translator.download(l.id);
      toast('Offline translation ready', 'success', 'Tamil · Hindi · English now work with no internet');
    } catch (e: any) {
      toast('Download failed — connect to the internet once', 'error', String(e?.message ?? e));
    } finally {
      await refresh();
      setDownloading(null);
    }
  };

  const remove = async (l: TrLang) => {
    await Translator.remove(l).catch(() => {});
    refresh();
  };

  const save = () => {
    if (!output) return;
    setHistory(h => [{from, to, src: input.trim(), out: output}, ...h.filter(x => x.src !== input.trim())].slice(0, 15));
  };

  const speak = (text: string, l: TrLang) =>
    preview(text, l as Lang, {source: 'device'}, false).catch(() => toast('No voice for this language on this phone', 'error'));

  return (
    <Screen title="Translate" subtitle="English · தமிழ் · हिन्दी — online & offline" back>
      {!Translator.available && (
        <Card style={{backgroundColor: c.warningSoft, marginBottom: 12}}>
          <T v="small">Offline translation needs the latest app build. Online translation still works.</T>
        </Card>
      )}

      {Translator.available && absent.length > 0 && (
        <Animated.View entering={FadeIn}>
          <Card style={{marginBottom: 12, gap: 10}}>
            <T v="small">
              Get {absent.map(l => l.name).join(' & ')} for offline use (~30 MB each). Do it once on Wi‑Fi — after that translation works with no internet at all.
            </T>
            <Button small icon="download" title="Download offline packs" loading={downloading === 'all'} onPress={downloadAll} />
          </Card>
        </Animated.View>
      )}

      {/* Quick directions */}
      <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8}}>
        {PAIRS.map(([f, t]) => (
          <Chip key={f + t} label={`${short(f)} → ${short(t)}`} active={from === f && to === t} onPress={() => pick(f, t)} />
        ))}
      </View>

      {/* Source */}
      <Animated.View entering={FadeInDown.springify()}>
        <Card style={{marginTop: 14}}>
          <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}}>
            <T v="tiny" mute style={{textTransform: 'uppercase'}}>{nameOf(from).native}</T>
            <View style={{flexDirection: 'row', gap: 14}}>
              {!!input && (
                <Tap onPress={() => speak(input, from)}>
                  <Icon name="volume-high" color={c.textMute} />
                </Tap>
              )}
              {!!input && (
                <Tap onPress={() => setInput('')}>
                  <Icon name="close-circle" color={c.textMute} />
                </Tap>
              )}
            </View>
          </View>
          <TextInput
            value={input}
            onChangeText={setInput}
            onEndEditing={save}
            placeholder={from === 'ta' ? 'இங்கே தட்டச்சு செய்யவும்…' : from === 'hi' ? 'यहाँ लिखें…' : 'Type or paste text…'}
            placeholderTextColor={c.textMute}
            multiline
            maxLength={5000}
            style={{minHeight: 110, color: c.text, fontSize: 18, textAlignVertical: 'top', paddingVertical: 8}}
          />
        </Card>
      </Animated.View>

      {/* Swap */}
      <View style={{alignItems: 'center', marginVertical: -14, zIndex: 2}}>
        <Tap onPress={swap} hapticMs={14} style={{width: 46, height: 46, borderRadius: 23, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center', elevation: 6}}>
          <Icon name="swap-vertical" color="#fff" />
        </Tap>
      </View>

      {/* Result */}
      <Card style={{minHeight: 130}}>
        <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}}>
          <T v="tiny" mute style={{textTransform: 'uppercase'}}>{nameOf(to).native}</T>
          <View style={{flexDirection: 'row', gap: 14, alignItems: 'center'}}>
            {busy && <ActivityIndicator size="small" color={c.primary} />}
            {!!output && (
              <Tap onPress={() => speak(output, to)}>
                <Icon name="volume-high" color={c.primary} />
              </Tap>
            )}
            {!!output && (
              <Tap onPress={() => Share.share({message: output})}>
                <Icon name="share-variant" color={c.primary} />
              </Tap>
            )}
          </View>
        </View>
        {missing.length > 0 ? (
          <Animated.View entering={FadeIn} style={{marginTop: 10, gap: 10}}>
            <T v="small">
              {online ? 'No internet right now, and' : 'Online translation is off, and'} the {missing.map(m => nameOf(m as TrLang)?.name ?? m).join(' & ')} offline pack isn’t on this phone yet. Connect once and download it (~30 MB) — after that translation works with no internet.
            </T>
            {missing.map(m => (
              <Button key={m} small icon="download" title={`Download ${nameOf(m as TrLang)?.name ?? m}`} loading={downloading === m} onPress={() => download(m as TrLang)} />
            ))}
          </Animated.View>
        ) : (
          <>
            <T v="body" style={{fontSize: 18, lineHeight: 26, marginTop: 8, fontWeight: '600'}} selectable>
              {output || (input ? '' : 'Translation appears here')}
            </T>
            {!!output && !!engine && (
              <View style={{flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10}}>
                <Icon name={engine === 'google' ? 'google-translate' : 'cellphone-check'} size={14} color={c.textMute} />
                <T v="tiny" mute>{engine === 'google' ? 'Google Translate' : 'On-device · works offline'}</T>
              </View>
            )}
          </>
        )}
      </Card>

      {/* Voice input: one mic per language, like a conversation */}
      <Card style={{marginTop: 14, alignItems: 'center'}}>
        {listening ? (
          <View style={{alignItems: 'center', marginBottom: 10}}>
            <Waveform active color={c.primary} bars={22} height={34} />
            <T v="small" mute style={{marginTop: 6}}>Listening in {nameOf(listening).native}… tap the mic to stop</T>
          </View>
        ) : (
          <T v="small" mute style={{marginBottom: 10}}>Tap a mic and speak — it writes it down and translates</T>
        )}
        <View style={{flexDirection: 'row', gap: 28}}>
          {[from, to].map(l => {
            const on = listening === l;
            return (
              <View key={l} style={{alignItems: 'center'}}>
                <Tap onPress={() => mic(l)} hapticMs={18} style={{width: 68, height: 68, borderRadius: 34, backgroundColor: on ? c.danger ?? '#EF4444' : c.primary, alignItems: 'center', justifyContent: 'center', elevation: 6, opacity: listening && !on ? 0.4 : 1}}>
                  <Icon name={on ? 'stop' : 'microphone'} size={32} color="#fff" />
                </Tap>
                <T v="tiny" style={{marginTop: 6, fontWeight: '700'}}>{nameOf(l).native}</T>
              </View>
            );
          })}
        </View>
      </Card>
      <Card padded={false} style={{marginTop: 10}}>
        <Row icon="volume-high" title="Read translation aloud" subtitle="After voice input" chevron={false} right={<Toggle value={autoSpeak} onChange={setAutoSpeak} />} />
        <Row
          icon="google-translate"
          title="Use Google Translate when online"
          subtitle={online ? 'Best quality. Text you translate is sent to Google. Offline falls back to on-device.' : 'Off — everything stays on this phone (on-device only).'}
          chevron={false}
          right={<Toggle value={online} onChange={v => setSettings({translateOnline: v})} />}
          last
        />
      </Card>

      {/* Offline packs */}
      <T v="tiny" mute style={{marginTop: 24, marginBottom: 8, marginLeft: 4, textTransform: 'uppercase'}}>Offline language packs</T>
      <Card padded={false}>
        {TR_LANGS.map((l, i) => {
          const ok = ready(l.id);
          return (
            <Row
              key={l.id}
              icon={ok ? 'check-circle' : 'cloud-download-outline'}
              title={`${l.native} · ${l.name}`}
              subtitle={l.id === 'en' ? 'Built in' : ok ? 'Downloaded — works offline' : 'Not downloaded (~30 MB)'}
              chevron={false}
              right={
                l.id === 'en' ? undefined : ok ? (
                  <Button small kind="secondary" title="Remove" onPress={() => remove(l.id)} />
                ) : (
                  <Button small title="Get" loading={downloading === l.id} onPress={() => download(l.id)} />
                )
              }
              last={i === TR_LANGS.length - 1}
            />
          );
        })}
      </Card>

      {/* Recent */}
      {history.length > 0 && (
        <>
          <T v="tiny" mute style={{marginTop: 24, marginBottom: 8, marginLeft: 4, textTransform: 'uppercase'}}>Recent</T>
          <Card padded={false}>
            {history.map((h, i) => (
              <Row
                key={i}
                icon="history"
                title={h.out}
                subtitle={`${short(h.from)} → ${short(h.to)} · ${h.src}`}
                onPress={() => {
                  stopAll();
                  pick(h.from, h.to);
                  setInput(h.src);
                }}
                last={i === history.length - 1}
              />
            ))}
          </Card>
        </>
      )}
      <View style={{height: 24, borderRadius: radius.md}} />
    </Screen>
  );
}
