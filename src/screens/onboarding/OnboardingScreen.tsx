import React, {useEffect, useState} from 'react';
import {BackHandler, PermissionsAndroid, Platform, ScrollView, View} from 'react-native';
import Animated, {
  Easing,
  FadeInDown,
  SlideInLeft,
  SlideInRight,
  SlideOutLeft,
  SlideOutRight,
  ZoomIn,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {AccountDraft, AccountForm, draftToAccount, draftValid, emptyDraft, Field} from '../../components/AccountForm';
import {Orbs, Pulse, Waveform} from '../../components/motion';
import {AppIcon, Wordmark} from '../../components/Brand';
import {toast} from '../../components/Toast';
import {Button, Card, Gradient, Icon, T, Tap, Toggle, useGridCell} from '../../components/ui';
import {preview, useAnnouncer} from '../../engine/announcer';
import {SOURCES} from '../../engine/sources';
import {TEST_TEXT, buildAnnouncement} from '../../engine/templates';
import type {Lang, Txn} from '../../engine/types';
import {useNativeStatus} from '../../hooks/useNativeStatus';
import {Soundbox} from '../../native/Soundbox';
import {data} from '../../store/data';
import {switchMode, useSettings} from '../../store/settings';
import {useTheme} from '../../theme';
import {CHIMES, LANGS, PERSONAS} from '../../voice/presets';

const STEPS = ['welcome', 'mode', 'language', 'account', 'sources', 'permissions', 'voice', 'activate'] as const;

export function OnboardingScreen() {
  const {c} = useTheme();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [draft, setDraft] = useState<AccountDraft>(emptyDraft());
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withSpring(step / (STEPS.length - 1), {damping: 18});
  }, [step, progress]);
  const bar = useAnimatedStyle(() => ({width: `${progress.value * 100}%`}));

  // Android back steps through onboarding instead of leaving the app.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (step === 0 || STEPS[step] === 'activate') return false;
      setDir(-1);
      setStep(s => s - 1);
      return true;
    });
    return () => sub.remove();
  }, [step]);

  const next = () => {
    if (STEPS[step] === 'account' && draftValid(draft)) {
      data().upsertAccount(draftToAccount(draft));
      toast('Bank account added', 'success');
    }
    setDir(1);
    setStep(s => Math.min(STEPS.length - 1, s + 1));
  };
  const back = () => {
    setDir(-1);
    setStep(s => Math.max(0, s - 1));
  };

  const id = STEPS[step];
  const entering = (dir > 0 ? SlideInRight : SlideInLeft).springify().damping(20).stiffness(160);
  const exiting = (dir > 0 ? SlideOutLeft : SlideOutRight).duration(220);

  return (
    <View style={{flex: 1, backgroundColor: c.bg}}>
      {step > 0 && (
        <View style={{paddingTop: insets.top + 12, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 12}}>
          <Tap onPress={back} style={{padding: 4}}>
            <Icon name="arrow-left" size={24} />
          </Tap>
          <View style={{flex: 1, height: 6, borderRadius: 3, backgroundColor: c.cardAlt, overflow: 'hidden'}}>
            <Animated.View style={[{height: 6, borderRadius: 3, overflow: 'hidden'}, bar]}>
              <Gradient angle={0} style={{flex: 1}} />
            </Animated.View>
          </View>
          <T v="tiny" mute>
            {step}/{STEPS.length - 1}
          </T>
        </View>
      )}
      <View style={{flex: 1, overflow: 'hidden'}}>
        <Animated.View key={id} entering={step === 0 ? undefined : entering} exiting={exiting} style={{flex: 1}}>
          {id === 'welcome' && <Welcome onNext={next} />}
          {id === 'mode' && <ModeStep />}
          {id === 'language' && <LanguageStep />}
          {id === 'account' && (
            <StepShell icon="bank" title="Add your bank account" subtitle="So RubyAlert knows which account each payment belongs to. You can add more later.">
              <AccountForm draft={draft} onChange={setDraft} />
            </StepShell>
          )}
          {id === 'sources' && <SourcesStep />}
          {id === 'permissions' && <PermissionStep />}
          {id === 'voice' && <VoiceStep />}
          {id === 'activate' && <ActivateStep />}
        </Animated.View>
      </View>
      {id !== 'welcome' && id !== 'activate' && (
        <View style={{paddingHorizontal: 20, paddingBottom: insets.bottom + 16, paddingTop: 8, flexDirection: 'row', gap: 12}}>
          {id === 'account' && <Button title="Skip" kind="secondary" onPress={() => { setDraft(emptyDraft()); setDir(1); setStep(s => s + 1); }} style={{flex: 1}} />}
          <Button title={id === 'account' && !draftValid(draft) ? 'Add account' : 'Continue'} icon="arrow-right" onPress={next} disabled={id === 'account' && !draftValid(draft)} style={{flex: 2}} />
        </View>
      )}
    </View>
  );
}

function StepShell({icon, title, subtitle, children}: {icon: string; title: string; subtitle?: string; children: React.ReactNode}) {
  const {c} = useTheme();
  return (
    <ScrollView contentContainerStyle={{padding: 20, paddingTop: 28}} keyboardShouldPersistTaps="handled">
      <Animated.View entering={ZoomIn.springify().delay(80)}>
        <Gradient style={{width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 18}}>
          <Icon name={icon} size={28} color="#fff" />
        </Gradient>
      </Animated.View>
      <T v="h1">{title}</T>
      {subtitle ? (
        <T v="body" dim style={{marginTop: 8, marginBottom: 24, lineHeight: 22}}>
          {subtitle}
        </T>
      ) : (
        <View style={{height: 20}} />
      )}
      {children}
      <View style={{height: 24, backgroundColor: c.bg}} />
    </ScrollView>
  );
}

function Welcome({onNext}: {onNext: () => void}) {
  const {c, scheme} = useTheme();
  const insets = useSafeAreaInsets();
  const ring = useSharedValue(0);
  useEffect(() => {
    ring.value = withRepeat(withTiming(1, {duration: 2400, easing: Easing.out(Easing.quad)}), -1, false);
  }, [ring]);
  const r1 = useAnimatedStyle(() => ({opacity: interpolate(ring.value, [0, 1], [0.5, 0]), transform: [{scale: interpolate(ring.value, [0, 1], [1, 2.2])}]}));
  const r2 = useAnimatedStyle(() => {
    const v = (ring.value + 0.5) % 1;
    return {opacity: interpolate(v, [0, 1], [0.5, 0]), transform: [{scale: interpolate(v, [0, 1], [1, 2.2])}]};
  });
  const points = [
    {icon: 'volume-high', title: 'Hear every payment', text: 'Instant voice announcements in Tamil, English or Hindi'},
    {icon: 'shield-check', title: 'Private & offline', text: 'Everything stays on this phone. No bank login, PIN or OTP — ever'},
    {icon: 'file-excel-box', title: 'Daily reports', text: 'Collections, bank-wise totals and Excel exports in a tap'},
  ];
  return (
    <View style={{flex: 1}}>
      <Gradient style={{flex: 1.1, alignItems: 'center', justifyContent: 'center', paddingTop: insets.top}} colors={scheme.gradient}>
        <Orbs colors={['#ffffff', scheme.secondary]} />
        <View style={{alignItems: 'center', justifyContent: 'center'}}>
          <Animated.View style={[{position: 'absolute', width: 124, height: 124, borderRadius: 30, borderWidth: 2, borderColor: 'rgba(255,255,255,0.8)'}, r1]} />
          <Animated.View style={[{position: 'absolute', width: 124, height: 124, borderRadius: 30, borderWidth: 2, borderColor: 'rgba(255,255,255,0.8)'}, r2]} />
          <Animated.View entering={ZoomIn.springify().damping(12)}>
            <AppIcon size={124} />
          </Animated.View>
        </View>
        <Animated.View entering={FadeInDown.delay(250).springify()} style={{marginTop: 28, alignItems: 'center'}}>
          <Wordmark onDark height={44} />
          <T v="body" color="rgba(255,255,255,0.88)" style={{marginTop: 10}}>
            Every payment, announced instantly
          </T>
        </Animated.View>
        <View style={{marginTop: 20}}>
          <Waveform active color="rgba(255,255,255,0.75)" bars={22} height={28} />
        </View>
      </Gradient>
      <View style={{flex: 1, padding: 20, paddingBottom: insets.bottom + 16, justifyContent: 'space-between', backgroundColor: c.bg}}>
        <View style={{gap: 14}}>
          {points.map((p, i) => (
            <Animated.View key={p.title} entering={FadeInDown.delay(380 + i * 110).springify()} style={{flexDirection: 'row', gap: 14, alignItems: 'center'}}>
              <View style={{width: 44, height: 44, borderRadius: 14, backgroundColor: c.primarySoft, alignItems: 'center', justifyContent: 'center'}}>
                <Icon name={p.icon} size={22} color={c.primary} />
              </View>
              <View style={{flex: 1}}>
                <T v="h3">{p.title}</T>
                <T v="small" dim>
                  {p.text}
                </T>
              </View>
            </Animated.View>
          ))}
        </View>
        <Animated.View entering={FadeInDown.delay(750).springify()}>
          <Button title="Get started" icon="arrow-right" onPress={onNext} />
          <T v="tiny" mute style={{textAlign: 'center', marginTop: 10}}>
            No registration needed
          </T>
        </Animated.View>
      </View>
    </View>
  );
}

function BigOption({icon, title, text, active, onPress, colors, delay = 0}: {icon: string; title: string; text: string; active: boolean; onPress: () => void; colors?: string[]; delay?: number}) {
  const {c, radius} = useTheme();
  return (
    <Animated.View entering={FadeInDown.delay(delay).springify()}>
      <Tap onPress={onPress} style={{borderRadius: radius.lg, overflow: 'hidden', borderWidth: 2, borderColor: active ? c.primary : c.border, marginBottom: 14}}>
        <View style={{flexDirection: 'row', alignItems: 'center', padding: 18, gap: 16, backgroundColor: active ? c.primarySoft : c.card}}>
          <Gradient colors={colors} style={{width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center'}}>
            <Icon name={icon} size={28} color="#fff" />
          </Gradient>
          <View style={{flex: 1}}>
            <T v="h3">{title}</T>
            <T v="small" dim style={{marginTop: 2}}>
              {text}
            </T>
          </View>
          <Icon name={active ? 'check-circle' : 'circle-outline'} size={26} color={active ? c.primary : c.textMute} />
        </View>
      </Tap>
    </Animated.View>
  );
}

function ModeStep() {
  const mode = useSettings(s => s.mode);
  const businessName = useSettings(s => s.businessName);
  const set = useSettings(s => s.set);
  return (
    <StepShell icon="account-switch" title="How will you use it?" subtitle="You can switch any time without losing history.">
      <BigOption icon="storefront" title="Business" text="Shops, supermarkets, wholesale — collection reports & daily closing" active={mode === 'business'} onPress={() => switchMode('business')} colors={['#F97316', '#DB2777']} />
      <BigOption icon="account" title="Personal" text="Hear your own credits & debits, track monthly spending" active={mode === 'personal'} onPress={() => switchMode('personal')} colors={['#6366F1', '#06B6D4']} delay={80} />
      {mode === 'business' && (
        <Animated.View entering={FadeInDown.springify()}>
          <Field label="Business name (optional)" value={businessName} onChangeText={v => set({businessName: v})} placeholder="Sri Murugan Stores" />
        </Animated.View>
      )}
    </StepShell>
  );
}

function LanguageStep() {
  const lang = useSettings(s => s.language);
  const set = useSettings(s => s.set);
  const pick = (l: Lang) => {
    set({language: l});
    preview(TEST_TEXT[l], l, undefined, false).catch(() => {});
  };
  const colors: Record<Lang, string[]> = {ta: ['#F59E0B', '#EF4444'], en: ['#0EA5E9', '#6366F1'], hi: ['#10B981', '#F97316']};
  return (
    <StepShell icon="translate" title="Announcement language" subtitle="Tap to hear a sample. More voices can be set up in Voice Studio.">
      {LANGS.map((l, i) => (
        <BigOption key={l.id} icon="account-voice" title={l.native} text={l.name} active={lang === l.id} onPress={() => pick(l.id)} colors={colors[l.id]} delay={i * 70} />
      ))}
    </StepShell>
  );
}

function SourcesStep() {
  const {c} = useTheme();
  const sources = useSettings(s => s.sources);
  const set = useSettings(s => s.set);
  const [installed, setInstalled] = useState<Record<string, boolean>>({});
  useEffect(() => {
    Soundbox.installedPackages(SOURCES.flatMap(s => s.packages)).then(setInstalled).catch(() => {});
  }, []);
  const isInstalled = (id: string) => SOURCES.find(s => s.id === id)?.packages.some(p => installed[p]);
  const sorted = [...SOURCES].sort((a, b) => Number(!!isInstalled(b.id)) - Number(!!isInstalled(a.id)));
  return (
    <StepShell icon="apps" title="Payment sources" subtitle="Choose which apps’ payment alerts should be announced. Installed apps are shown first.">
      <Card padded={false}>
        {sorted.map((s, i) => (
          <Animated.View key={s.id} entering={FadeInDown.delay(i * 35)} style={{flexDirection: 'row', alignItems: 'center', padding: 14, gap: 14, borderBottomWidth: i < sorted.length - 1 ? 0.5 : 0, borderBottomColor: c.border}}>
            <View style={{width: 40, height: 40, borderRadius: 12, backgroundColor: s.color, alignItems: 'center', justifyContent: 'center'}}>
              <Icon name={s.icon} size={22} color="#fff" />
            </View>
            <View style={{flex: 1}}>
              <T v="body" style={{fontWeight: '700'}}>
                {s.name}
              </T>
              <T v="small" color={isInstalled(s.id) ? c.success : c.textMute}>
                {s.category === 'sms' ? 'Reads bank SMS alerts shown by your Messages app' : isInstalled(s.id) ? 'Installed' : 'Not detected'}
              </T>
            </View>
            <Toggle value={!!sources[s.id]} onChange={v => set({sources: {...sources, [s.id]: v}})} />
          </Animated.View>
        ))}
      </Card>
    </StepShell>
  );
}

/** Asks for RECEIVE_SMS; if Android won't show the dialog any more, opens the app's settings page. */
export async function requestSmsPermission() {
  const r = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECEIVE_SMS, {
    title: 'Verify bank SMS sender',
    message: 'RubyAlert reads the sender code of incoming SMS so only your bank’s payment alerts are announced. Nothing leaves this phone.',
    buttonPositive: 'Allow',
  });
  if (r === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) await Soundbox.openAppSettings();
  return r === PermissionsAndroid.RESULTS.GRANTED;
}

export function PermissionCards() {
  const {c} = useTheme();
  const {status, supported, refresh} = useNativeStatus(2000);
  if (!supported) {
    return (
      <Card style={{gap: 10}}>
        <Icon name="apple" size={28} />
        <T v="h3">Automatic detection isn’t available on iPhone</T>
        <T v="small" dim style={{lineHeight: 19}}>
          iOS does not let apps read other apps’ notifications or SMS. On iPhone you can add payments manually, import bank statements, or share a payment message to RubyAlert — and it will still announce and report them.
        </T>
      </Card>
    );
  }
  if (!status) {
    // Don't flash "Allow" buttons before the real permission state has loaded.
    return <Card style={{height: 120, opacity: 0.5}} />;
  }
  const items = [
    {
      icon: 'bell-ring',
      title: 'Notification access',
      text: 'Required. Lets RubyAlert read payment alerts from the apps you selected. Other notifications are ignored on-device.',
      ok: !!status?.notificationAccess,
      action: () => Soundbox.openNotificationAccess().then(refresh),
      cta: 'Allow',
    },
    {
      icon: 'battery-heart-variant',
      title: 'Run in background',
      text: 'Recommended. Stops the phone from putting the soundbox to sleep, so no payment is missed.',
      ok: !!status?.ignoringBatteryOptimizations,
      action: () => Soundbox.openBatterySettings().then(refresh),
      cta: 'Open settings',
    },
    {
      icon: 'message-lock-outline',
      title: 'Verify bank SMS sender',
      text: 'Recommended. Reads the real sender code (e.g. HDFCBK) of each SMS, so only messages from your bank are announced — never personal SMS. Message text stays on this phone.',
      ok: !!status?.smsPermission,
      action: () => requestSmsPermission().then(refresh),
      cta: 'Allow',
    },
  ];
  return (
    <View style={{gap: 14}}>
      {items.map((it, i) => (
        <Animated.View key={it.title} entering={FadeInDown.delay(i * 90).springify()}>
          <Card style={{borderColor: it.ok ? c.success + '66' : c.border, borderWidth: 1}}>
            <View style={{flexDirection: 'row', gap: 14, alignItems: 'flex-start'}}>
              <View style={{width: 44, height: 44, borderRadius: 14, backgroundColor: (it.ok ? c.success : c.warning) + '22', alignItems: 'center', justifyContent: 'center'}}>
                <Icon name={it.ok ? 'check-bold' : it.icon} size={22} color={it.ok ? c.success : c.warning} />
              </View>
              <View style={{flex: 1}}>
                <T v="h3">{it.title}</T>
                <T v="small" dim style={{marginTop: 4, lineHeight: 19}}>
                  {it.text}
                </T>
                {!it.ok && <Button small title={it.cta} icon="open-in-new" onPress={it.action} style={{alignSelf: 'flex-start', marginTop: 12}} />}
                {it.ok && (
                  <T v="small" color={c.success} style={{marginTop: 8, fontWeight: '700'}}>
                    Granted
                  </T>
                )}
              </View>
            </View>
          </Card>
        </Animated.View>
      ))}
      {status?.manufacturer && /xiaomi|oppo|vivo|realme|oneplus|huawei|honor|samsung/i.test(status.manufacturer) && (
        <Card alt>
          <T v="small" dim style={{lineHeight: 19}}>
            <T v="small" style={{fontWeight: '800'}}>{status.manufacturer} tip: </T>
            also enable “Autostart” and lock RubyAlert in recent apps, otherwise the system may stop background announcements.
          </T>
        </Card>
      )}
    </View>
  );
}

function PermissionStep() {
  return (
    <StepShell icon="shield-lock" title="Permissions" subtitle="RubyAlert only processes alerts on this phone. Nothing is uploaded.">
      <PermissionCards />
    </StepShell>
  );
}

function VoiceStep() {
  const cell = useGridCell(2, 10, 40);
  const {c, radius} = useTheme();
  const voice = useSettings(s => s.voice);
  const lang = useSettings(s => s.language);
  const setVoice = useSettings(s => s.setVoice);
  const speaking = useAnnouncer(s => s.speaking);
  const sample: Txn = {id: 'demo', amount: 1250, direction: 'credit', kind: 'payment', status: 'success', category: 'received', confidence: 'high', sender: 'Ramesh', timestamp: Date.now(), source: {id: 'gpay', name: 'Google Pay', category: 'upi'}, announce: {status: 'none', count: 0}, createdAt: 0, updatedAt: 0};
  const text = buildAnnouncement(sample, {lang, style: 'full', amountMode: 'full', includeSender: true, includeBank: false});
  const test = () => preview(text, lang).catch(e => toast('Voice not available', 'error', String(e?.message ?? e)));
  return (
    <StepShell icon="account-voice" title="Pick a voice" subtitle="Choose a style and a chime. Fine-tune pitch, speed and voices later in Voice Studio.">
      <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 10}}>
        {PERSONAS.slice(0, 6).map((p, i) => {
          const on = voice.personaId === p.id;
          return (
            <Animated.View key={p.id} entering={FadeInDown.delay(i * 50).springify()} style={{width: cell}}>
              <Tap onPress={() => setVoice({personaId: p.id, pitch: p.pitch, rate: p.rate})} style={{borderRadius: radius.lg, overflow: 'hidden', borderWidth: 2, borderColor: on ? c.primary : 'transparent'}}>
                <Gradient colors={p.colors} style={{padding: 14, height: 96, justifyContent: 'space-between'}}>
                  <Icon name={p.icon} size={24} color="#fff" />
                  <View>
                    <T v="body" color="#fff" style={{fontWeight: '800'}}>
                      {p.name}
                    </T>
                    <T v="tiny" color="rgba(255,255,255,0.85)" numberOfLines={1}>
                      {p.tagline}
                    </T>
                  </View>
                </Gradient>
              </Tap>
            </Animated.View>
          );
        })}
      </View>
      <T v="tiny" mute style={{marginTop: 22, marginBottom: 10, textTransform: 'uppercase'}}>
        Chime before announcement
      </T>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap: 8}}>
        {CHIMES.slice(0, 7).map(ch => (
          <Tap key={ch.id} onPress={() => { setVoice({chime: ch.id}); Soundbox.playChime(ch.id, voice.chimeVolume / 100); }} style={{alignItems: 'center', width: 84, paddingVertical: 12, borderRadius: radius.md, backgroundColor: voice.chime === ch.id ? c.primarySoft : c.cardAlt, borderWidth: 1.5, borderColor: voice.chime === ch.id ? c.primary : c.border}}>
            <Icon name={ch.icon} size={24} color={voice.chime === ch.id ? c.primary : c.textDim} />
            <T v="tiny" style={{marginTop: 6, textAlign: 'center'}} numberOfLines={1}>
              {ch.name}
            </T>
          </Tap>
        ))}
      </ScrollView>
      <Card style={{marginTop: 22, alignItems: 'center', gap: 12}}>
        <Waveform active={speaking} color={c.primary} />
        <T v="small" dim style={{textAlign: 'center'}}>
          “{text}”
        </T>
        <Button title="Play test announcement" icon="play" onPress={test} small />
      </Card>
    </StepShell>
  );
}

function ActivateStep() {
  const {c, scheme} = useTheme();
  const insets = useSafeAreaInsets();
  const set = useSettings(s => s.set);
  const lang = useSettings(s => s.language);
  const [on, setOn] = useState(false);
  const scale = useSharedValue(1);
  const glow = useSharedValue(0);
  useEffect(() => {
    glow.value = withRepeat(withTiming(1, {duration: 1400}), -1, true);
  }, [glow]);
  const btn = useAnimatedStyle(() => ({transform: [{scale: scale.value}]}));
  const halo = useAnimatedStyle(() => ({opacity: interpolate(glow.value, [0, 1], [0.25, 0.6]), transform: [{scale: interpolate(glow.value, [0, 1], [1, 1.15])}]}));

  const activate = () => {
    scale.value = withSpring(0.9, {}, () => {
      scale.value = withSpring(1);
    });
    setOn(true);
    preview(TEST_TEXT[lang], lang).catch(() => {});
    setTimeout(() => set({active: true, onboarded: true}), 1400);
  };
  return (
    <View style={{flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, paddingBottom: insets.bottom + 24}}>
      <Animated.View entering={FadeInDown.springify()} style={{alignItems: 'center'}}>
        <T v="h1" style={{textAlign: 'center'}}>
          {on ? 'Soundbox is live!' : 'Ready to go'}
        </T>
        <T v="body" dim style={{textAlign: 'center', marginTop: 8, marginBottom: 48}}>
          {on ? 'Incoming payments will now be announced.' : 'Tap the button to switch on your soundbox.'}
        </T>
      </Animated.View>
      <View style={{alignItems: 'center', justifyContent: 'center'}}>
        <Animated.View style={[{position: 'absolute', width: 220, height: 220, borderRadius: 110, backgroundColor: on ? c.success : scheme.primary}, halo]} />
        <Animated.View style={btn}>
          <Tap onPress={on ? undefined : activate} hapticMs={25}>
            <Gradient colors={on ? ['#34D399', '#059669'] : scheme.gradient} style={{width: 170, height: 170, borderRadius: 85, alignItems: 'center', justifyContent: 'center'}}>
              <Icon name={on ? 'check-bold' : 'power'} size={72} color="#fff" />
            </Gradient>
          </Tap>
        </Animated.View>
      </View>
      {on && (
        <Animated.View entering={FadeInDown.delay(200)} style={{marginTop: 48, flexDirection: 'row', alignItems: 'center'}}>
          <Pulse color={c.success} />
          <T v="h3" color={c.success}>
            Listening for payments
          </T>
        </Animated.View>
      )}
      {Platform.OS === 'ios' && (
        <T v="small" mute style={{textAlign: 'center', marginTop: 24}}>
          On iPhone, add or import transactions to have them announced.
        </T>
      )}
    </View>
  );
}
