import React, {useEffect, useMemo, useState} from 'react';
import {ScrollView, View} from 'react-native';
import Animated, {FadeIn, FadeInDown, FadeInRight, ZoomIn} from 'react-native-reanimated';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Slider, Waveform} from '../components/motion';
import {Screen} from '../components/Screen';
import {toast} from '../components/Toast';
import {Badge, Button, Card, Chip, Gradient, Icon, Row, Segmented, T, Tap, Toggle, useGridCell} from '../components/ui';
import {preview, stopAll, useAnnouncer} from '../engine/announcer';
import {buildAnnouncement} from '../engine/templates';
import type {Lang, Txn} from '../engine/types';
import {DeviceVoice, Soundbox, TtsEngine} from '../native/Soundbox';
import {useSettings} from '../store/settings';
import {useTheme} from '../theme';
import {groupIN} from '../utils/format';
import {CHIMES, LANGS, PERSONAS, langTag} from '../voice/presets';
import {hasClips, planClips} from '../voice/clips';

const SAMPLES = [50, 1250, 25000, 150000.5];

const qualityLabel = (q: number) => (q >= 500 ? 'Neural HD' : q >= 400 ? 'HD' : q >= 300 ? 'Standard' : 'Basic');

function prettyVoiceName(v: DeviceVoice, i: number) {
  // Google voice ids look like "ta-in-x-tad-local"; make them friendly but distinct.
  const m = v.id.match(/-x-([a-z]{3})/i);
  const code = m ? m[1].toUpperCase() : `#${i + 1}`;
  return `${v.languageName.split('(')[0].trim()} voice ${code}`;
}

export function VoiceStudioScreen() {
  const chimeCell = useGridCell(3, 10);
  const {c, radius} = useTheme();
  const insets = useSafeAreaInsets();
  const s = useSettings();
  const v = s.voice;
  const lang = s.language;
  const speaking = useAnnouncer(x => x.speaking);
  const [sample, setSample] = useState(1250);
  const [voices, setVoices] = useState<DeviceVoice[]>([]);
  const [engines, setEngines] = useState<TtsEngine[]>([]);
  const [langStatus, setLangStatus] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      await Soundbox.ttsInit(v.engine).catch(() => false);
      const [vs, es, ls] = await Promise.all([
        Soundbox.getVoices().catch(() => []),
        Soundbox.getEngines().catch(() => []),
        Soundbox.getLanguageStatus(langTag(lang)).catch(() => ''),
      ]);
      if (!alive) return;
      setVoices(vs);
      setEngines(es);
      setLangStatus(ls);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [lang, v.engine]);

  const langVoices = useMemo(
    () => voices.filter(x => x.language.toLowerCase().startsWith(lang)).sort((a, b) => Number(a.network) - Number(b.network) || b.quality - a.quality),
    [voices, lang],
  );

  const demo: Txn = useMemo(
    () => ({id: 'demo', amount: sample, direction: 'credit', kind: 'payment', status: 'success', category: 'received', confidence: 'high', sender: lang === 'ta' ? 'ரமேஷ்' : lang === 'hi' ? 'रमेश' : 'Ramesh', bank: 'HDFC Bank', timestamp: Date.now(), source: {id: 'gpay', name: 'Google Pay', category: 'upi'}, announce: {status: 'none', count: 0}, createdAt: 0, updatedAt: 0}),
    [sample, lang],
  );
  const opts = {style: s.announce.style, amountMode: s.announce.amountMode, includeSender: s.announce.includeSender, includeBank: s.announce.includeBank, custom: s.announce.custom, businessName: s.businessName};
  const text = buildAnnouncement(demo, {lang, ...opts});
  const bareText = buildAnnouncement(demo, {lang, ...opts, includeSender: false, includeBank: false});
  // Offline translation: the same payment rendered with the English template.
  const english = lang !== 'en' ? buildAnnouncement({...demo, sender: 'Ramesh'}, {lang: 'en', ...opts}) : '';
  const builtIn = hasClips(lang);
  const fullyBuiltIn = !!planClips(text, lang);

  const play = (override?: Partial<typeof v>, withChime = true) =>
    preview(text, lang, override, withChime, bareText).catch(e => toast('Could not speak', 'error', String(e?.message ?? e)));

  const applyPersona = (id: string) => {
    const p = PERSONAS.find(x => x.id === id)!;
    const patch: Partial<typeof v> = {personaId: id, pitch: p.pitch, rate: p.rate};
    if (p.gender) {
      const g = langVoices.find(x => x.gender === p.gender && !x.notInstalled);
      if (g) patch.voiceByLang = {...v.voiceByLang, [lang]: g.id};
    }
    s.setVoice(patch);
    play(patch, false);
  };

  const chooseVoice = (id: string | null) => {
    const voiceByLang = {...v.voiceByLang};
    if (id) voiceByLang[lang] = id;
    else delete voiceByLang[lang];
    s.setVoice({voiceByLang});
    play({voiceByLang}, false);
  };

  const selectedVoice = v.voiceByLang[lang];
  const hasOfflineVoice = langVoices.some(x => !x.network && !x.notInstalled);

  return (
    <Screen title="Voice Studio" subtitle="Tune exactly how payments sound" back>
      {/* Stage */}
      <Animated.View entering={FadeInDown.springify()}>
        <Gradient style={{borderRadius: 28, padding: 20, alignItems: 'center', overflow: 'hidden'}}>
          <View style={{height: 64, justifyContent: 'center'}}>
            <Waveform active={speaking} color="rgba(255,255,255,0.9)" bars={26} height={56} />
          </View>
          <T v="body" color="#fff" style={{textAlign: 'center', marginTop: 12, minHeight: 44, lineHeight: 22, fontWeight: '600'}}>
            “{text}”
          </T>
          {!!english && (
            <Tap onPress={() => preview(english, 'en', undefined, false).catch(() => {})} style={{flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6}}>
              <Icon name="translate" size={16} color="rgba(255,255,255,0.8)" />
              <T v="small" color="rgba(255,255,255,0.85)" style={{textAlign: 'center', fontStyle: 'italic'}}>{english}</T>
            </Tap>
          )}
          <View style={{flexDirection: 'row', alignItems: 'center', gap: 18, marginTop: 16}}>
            <Tap onPress={() => stopAll()} style={{width: 46, height: 46, borderRadius: 23, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center'}}>
              <Icon name="stop" color="#fff" />
            </Tap>
            <Tap onPress={() => play()} hapticMs={18} style={{width: 74, height: 74, borderRadius: 37, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', elevation: 8}}>
              <Icon name={speaking ? 'volume-high' : 'play'} size={38} color={c.primary} />
            </Tap>
            <Tap onPress={() => Soundbox.playChime(v.chime, v.chimeVolume / 100)} style={{width: 46, height: 46, borderRadius: 23, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center'}}>
              <Icon name="bell-ring-outline" color="#fff" />
            </Tap>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap: 8, marginTop: 16}}>
            {SAMPLES.map(a => (
              <Tap key={a} onPress={() => setSample(a)} style={{paddingHorizontal: 12, height: 30, borderRadius: 15, justifyContent: 'center', backgroundColor: sample === a ? '#fff' : 'rgba(255,255,255,0.18)'}}>
                <T v="small" color={sample === a ? c.primary : '#fff'} style={{fontWeight: '800'}}>
                  ₹{groupIN(a)}
                </T>
              </Tap>
            ))}
          </ScrollView>
        </Gradient>
      </Animated.View>

      {/* Language */}
      <T v="tiny" mute style={{marginTop: 24, marginBottom: 8, marginLeft: 4, textTransform: 'uppercase'}}>Language</T>
      <Segmented value={lang} onChange={(l: Lang) => s.set({language: l})} options={LANGS.map(l => ({id: l.id, label: l.native}))} />
      {builtIn && (
        <Animated.View entering={FadeIn}>
          <Card style={{marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.successSoft}}>
            <Icon name="check-decagram" color={c.success} />
            <T v="small" style={{flex: 1}}>
              {fullyBuiltIn || v.source === 'builtin'
                ? 'Built-in voice — works offline on every phone, no download needed.'
                : 'Amounts use the built-in voice (works on every phone). Names use the phone voice when available, otherwise they’re skipped.'}
            </T>
          </Card>
          <View style={{marginTop: 10}}>
            <Segmented value={v.source} onChange={source => s.setVoice({source})} options={[{id: 'auto', label: 'Smart'}, {id: 'builtin', label: 'Built-in only'}, {id: 'device', label: 'Phone voice'}]} />
          </View>
        </Animated.View>
      )}
      {lang !== 'en' && (
        <Card padded={false} style={{marginTop: 10}}>
          <Row icon="translate" title="Also speak in English" subtitle="Translation after each announcement · offline" right={<Toggle value={s.announce.alsoEnglish} onChange={alsoEnglish => s.setAnnounce({alsoEnglish})} />} last />
        </Card>
      )}
      {!loading && lang !== 'en' && v.source === 'device' && (langStatus !== 'available' || !hasOfflineVoice) && (
        <Animated.View entering={FadeIn}>
          <Card style={{marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.warningSoft}}>
            <Icon name="download" color={c.warning} />
            <T v="small" style={{flex: 1}}>
              {langStatus === 'not-supported'
                ? 'Your speech engine doesn’t support this language. Install Google Speech Services.'
                : 'No offline voice for this language yet. Download it once so announcements work without internet — until then they’ll be spoken in English.'}
            </T>
            <Button small title="Install" onPress={() => Soundbox.installTtsData()} />
          </Card>
        </Animated.View>
      )}

      {/* Personas */}
      <T v="tiny" mute style={{marginTop: 24, marginBottom: 8, marginLeft: 4, textTransform: 'uppercase'}}>Voice personas</T>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginHorizontal: -16}} contentContainerStyle={{gap: 10, paddingHorizontal: 16}}>
        {PERSONAS.map((p, i) => {
          const on = v.personaId === p.id;
          return (
            <Animated.View key={p.id} entering={FadeInRight.delay(i * 40).springify()}>
              <Tap onPress={() => applyPersona(p.id)} style={{borderRadius: radius.lg, overflow: 'hidden', borderWidth: 2.5, borderColor: on ? c.text : 'transparent'}}>
                <Gradient colors={p.colors} style={{width: 132, height: 140, padding: 14, justifyContent: 'space-between'}}>
                  <View style={{flexDirection: 'row', justifyContent: 'space-between'}}>
                    <Icon name={p.icon} size={28} color="#fff" />
                    {on && (
                      <Animated.View entering={ZoomIn}>
                        <Icon name="check-circle" size={22} color="#fff" />
                      </Animated.View>
                    )}
                  </View>
                  <View>
                    <T v="body" color="#fff" style={{fontWeight: '800'}}>{p.name}</T>
                    <T v="tiny" color="rgba(255,255,255,0.85)" numberOfLines={2}>{p.tagline}</T>
                  </View>
                </Gradient>
              </Tap>
            </Animated.View>
          );
        })}
      </ScrollView>

      {/* Fine tune */}
      <Card style={{marginTop: 18, gap: 6}}>
        <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
          <Icon name="tune-vertical" color={c.primary} />
          <T v="h3" style={{flex: 1}}>Fine tune</T>
          <Chip label="Reset" icon="restore" onPress={() => applyPersona('natural')} />
        </View>
        <T v="small" style={{fontWeight: '700', marginTop: 10}}>Pitch</T>
        <Slider value={v.pitch} min={0.5} max={2} step={0.05} format={x => x.toFixed(2) + '×'} onEnd={pitch => { s.setVoice({pitch, personaId: 'custom'}); play({pitch}, false); }} />
        <T v="small" style={{fontWeight: '700', marginTop: 6}}>Speed</T>
        <Slider value={v.rate} min={0.5} max={2} step={0.05} format={x => x.toFixed(2) + '×'} onEnd={rate => { s.setVoice({rate, personaId: 'custom'}); play({rate}, false); }} />
        <T v="small" style={{fontWeight: '700', marginTop: 6}}>Voice volume</T>
        <Slider value={v.volume} min={0} max={100} step={5} format={x => `${Math.round(x)}%`} onEnd={volume => s.setVoice({volume})} />
      </Card>

      {/* Device voices */}
      <T v="tiny" mute style={{marginTop: 24, marginBottom: 8, marginLeft: 4, textTransform: 'uppercase'}}>
        Installed voices · {LANGS.find(l => l.id === lang)?.name}
      </T>
      <Card padded={false}>
        <Row icon="auto-fix" title="Automatic" subtitle="Best available voice for this language" onPress={() => chooseVoice(null)} chevron={false} right={!selectedVoice ? <Icon name="check-circle" color={c.primary} /> : undefined} last={!langVoices.length} />
        {loading ? (
          <T v="small" mute style={{padding: 16}}>Loading voices…</T>
        ) : langVoices.length === 0 ? (
          <T v="small" mute style={{padding: 16}}>No dedicated voices found. Install voice data from your speech engine to unlock more.</T>
        ) : (
          langVoices.map((x, i) => (
            <Animated.View key={x.id} entering={FadeInDown.delay(i * 30)}>
              <Row
                icon={x.gender === 'female' ? 'face-woman-outline' : x.gender === 'male' ? 'face-man-outline' : 'account-voice'}
                iconColor={x.network ? c.info : c.success}
                title={prettyVoiceName(x, i)}
                subtitle={x.id}
                onPress={() => (x.notInstalled ? Soundbox.installTtsData() : chooseVoice(x.id))}
                chevron={false}
                last={i === langVoices.length - 1}
                right={
                  <View style={{alignItems: 'flex-end', gap: 4}}>
                    {selectedVoice === x.id ? <Icon name="check-circle" color={c.primary} /> : null}
                    <View style={{flexDirection: 'row', gap: 4}}>
                      <Badge label={qualityLabel(x.quality)} color={x.quality >= 400 ? c.primary : c.textMute} />
                      <Badge label={x.notInstalled ? 'Download' : x.network ? 'Online' : 'Offline'} color={x.notInstalled ? c.warning : x.network ? c.info : c.success} />
                    </View>
                  </View>
                }
              />
            </Animated.View>
          ))
        )}
      </Card>
      <T v="small" mute style={{marginTop: 8, marginHorizontal: 4}}>“Offline” voices keep working without internet — recommended for shops.</T>

      {engines.length > 1 && (
        <>
          <T v="tiny" mute style={{marginTop: 24, marginBottom: 8, marginLeft: 4, textTransform: 'uppercase'}}>Speech engine</T>
          <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8}}>
            {engines.map(e => (
              <Chip key={e.name} label={e.label + (e.isDefault ? ' (default)' : '')} active={(v.engine ?? engines.find(x => x.isDefault)?.name) === e.name} onPress={() => s.setVoice({engine: e.name, voiceByLang: {}})} />
            ))}
          </View>
        </>
      )}

      {/* Chimes */}
      <T v="tiny" mute style={{marginTop: 24, marginBottom: 8, marginLeft: 4, textTransform: 'uppercase'}}>Sound track · chime before voice</T>
      <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 10}}>
        {CHIMES.map((ch, i) => {
          const on = v.chime === ch.id;
          return (
            <Animated.View key={ch.id} entering={FadeInDown.delay(i * 25)} style={{width: chimeCell}}>
              <Tap onPress={() => { s.setVoice({chime: ch.id}); Soundbox.playChime(ch.id, v.chimeVolume / 100); }} style={{alignItems: 'center', paddingVertical: 14, borderRadius: radius.md, backgroundColor: on ? c.primarySoft : c.card, borderWidth: 1.5, borderColor: on ? c.primary : c.border}}>
                <Icon name={ch.icon} size={26} color={on ? c.primary : c.textDim} />
                <T v="tiny" style={{marginTop: 6}} numberOfLines={1}>{ch.name}</T>
              </Tap>
            </Animated.View>
          );
        })}
      </View>
      <Card style={{marginTop: 12}}>
        <T v="small" style={{fontWeight: '700'}}>Chime volume</T>
        <Slider value={v.chimeVolume} min={0} max={100} step={5} format={x => `${Math.round(x)}%`} onEnd={chimeVolume => { s.setVoice({chimeVolume}); Soundbox.playChime(v.chime, chimeVolume / 100); }} />
      </Card>

      {/* Playback */}
      <T v="tiny" mute style={{marginTop: 24, marginBottom: 8, marginLeft: 4, textTransform: 'uppercase'}}>Playback</T>
      <Card style={{gap: 14}}>
        <View>
          <T v="small" style={{fontWeight: '700', marginBottom: 8}}>Repeat each announcement</T>
          <Segmented value={String(v.repeat) as '1' | '2' | '3'} onChange={r => s.setVoice({repeat: Number(r)})} options={[{id: '1', label: 'Once'}, {id: '2', label: 'Twice'}, {id: '3', label: '3 times'}]} />
        </View>
        {v.repeat > 1 && (
          <View>
            <T v="small" style={{fontWeight: '700'}}>Gap between repeats</T>
            <Slider value={v.repeatGapMs} min={200} max={3000} step={100} format={x => `${(x / 1000).toFixed(1)}s`} onEnd={repeatGapMs => s.setVoice({repeatGapMs})} />
          </View>
        )}
        <View>
          <T v="small" style={{fontWeight: '700', marginBottom: 8}}>Amount reading</T>
          <Segmented value={s.announce.amountMode} onChange={amountMode => s.setAnnounce({amountMode})} options={[{id: 'full', label: 'Words + paise'}, {id: 'simplified', label: 'Rounded'}, {id: 'digits', label: 'Digits'}]} />
        </View>
      </Card>
      <Card padded={false} style={{marginTop: 12}}>
        <Row icon="volume-plus" title="Loudness boost" subtitle="Raise media volume while announcing, then restore" right={<Toggle value={v.boost} onChange={boost => s.setVoice({boost})} />} last={!v.boost} />
        {v.boost && (
          <View style={{paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 0.5, borderBottomColor: c.border}}>
            <Slider value={v.boostLevel} min={30} max={100} step={5} format={x => `${Math.round(x)}%`} onEnd={boostLevel => s.setVoice({boostLevel})} />
          </View>
        )}
        <Row icon="music-note-off-outline" title="Lower music while speaking" subtitle="Ducks other audio during announcements" right={<Toggle value={v.duck} onChange={duck => s.setVoice({duck})} />} />
        <Row icon="cog-outline" title="System speech settings" subtitle="Install languages & voices" onPress={() => Soundbox.openTtsSettings()} last />
      </Card>
      <View style={{height: insets.bottom}} />
    </Screen>
  );
}
