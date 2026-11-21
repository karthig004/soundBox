import React, {useEffect, useState} from 'react';
import {Pressable, StyleSheet, useWindowDimensions, View} from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Svg, {Path} from 'react-native-svg';
import {BrandMark} from '../components/Brand';
import {Pulse, Waveform} from '../components/motion';
import {Sheet} from '../components/Sheet';
import {toast} from '../components/Toast';
import {Button, Chip, Gradient, Icon, Row, T, Tap, Toggle} from '../components/ui';
import {preview, stopAll, useAnnouncer} from '../engine/announcer';
import {TEST_TEXT} from '../engine/templates';
import {HistoryScreen} from '../screens/HistoryScreen';
import {HomeScreen} from '../screens/HomeScreen';
import {ReportsScreen} from '../screens/ReportsScreen';
import {SettingsScreen} from '../screens/SettingsScreen';
import {useSettings} from '../store/settings';
import {useTheme} from '../theme';
import {fmtTime, haptic} from '../utils/format';

const TABS = [
  {id: 'home', label: 'Home', icon: 'home-variant', iconOff: 'home-variant-outline', C: HomeScreen},
  {id: 'history', label: 'History', icon: 'history', iconOff: 'history', C: HistoryScreen},
  {id: 'reports', label: 'Reports', icon: 'chart-box', iconOff: 'chart-box-outline', C: ReportsScreen},
  {id: 'settings', label: 'Settings', icon: 'cog', iconOff: 'cog-outline', C: SettingsScreen},
] as const;

const BAR = 66; // bar height above the system inset
const FAB = 62; // centre button diameter
const NOTCH = 40; // notch radius around the centre button

/** Space screens leave at the bottom so content clears the bar and the raised centre button. */
export const TAB_BAR_HEIGHT = BAR + 18;

/** Bar outline with a smooth notch cut out for the centre button. */
function notchPath(w: number, h: number) {
  const cx = w / 2, r = NOTCH, d = 12; // d: where the notch meets the shoulders
  const chord = Math.sqrt(r * r - (r - d) * (r - d)) + 6;
  return [
    `M0,0 L${cx - chord - 18},0`,
    `C${cx - chord - 6},0 ${cx - chord - 2},2 ${cx - chord + 3},${d - 4}`,
    `A${r},${r} 0 0 0 ${cx + chord - 3},${d - 4}`,
    `C${cx + chord + 2},2 ${cx + chord + 6},0 ${cx + chord + 18},0`,
    `L${w},0 L${w},${h} L0,${h} Z`,
  ].join(' ');
}

function TabButton({active, label, icon, iconOff, onPress}: {active: boolean; label: string; icon: string; iconOff: string; onPress: () => void}) {
  const {c} = useTheme();
  const p = useSharedValue(active ? 1 : 0);
  useEffect(() => {
    p.value = withSpring(active ? 1 : 0, {damping: 14, stiffness: 200});
  }, [active, p]);
  const iconStyle = useAnimatedStyle(() => ({transform: [{translateY: interpolate(p.value, [0, 1], [2, -1])}, {scale: interpolate(p.value, [0, 0.5, 1], [1, 1.18, 1.08])}]}));
  const dot = useAnimatedStyle(() => ({opacity: p.value, transform: [{scaleX: interpolate(p.value, [0, 1], [0.2, 1])}]}));
  return (
    <Pressable onPress={onPress} style={{flex: 1, alignItems: 'center', justifyContent: 'center', height: BAR}}>
      <Animated.View style={iconStyle}>
        <Icon name={active ? icon : iconOff} size={24} color={active ? c.primary : c.textMute} />
      </Animated.View>
      <T v="tiny" color={active ? c.text : c.textMute} style={{marginTop: 3, fontWeight: active ? '800' : '600'}}>
        {label}
      </T>
      <Animated.View style={[{marginTop: 4, width: 16, height: 3, borderRadius: 2, backgroundColor: c.primary}, dot]} />
    </Pressable>
  );
}

/** Raised centre button: soundbox status at a glance; opens quick controls. */
function SoundboxButton({onPress}: {onPress: () => void}) {
  const {c, scheme} = useTheme();
  const active = useSettings(s => s.active);
  const pausedUntil = useSettings(s => s.pausedUntil);
  const speaking = useAnnouncer(s => s.speaking);
  const live = active && pausedUntil <= Date.now();
  const ring = useSharedValue(0);
  useEffect(() => {
    if (live) ring.value = withRepeat(withTiming(1, {duration: 2200, easing: Easing.out(Easing.quad)}), -1, false);
    else {
      cancelAnimation(ring);
      ring.value = 0;
    }
  }, [live, ring]);
  const ringStyle = useAnimatedStyle(() => ({opacity: interpolate(ring.value, [0, 1], [0.45, 0]), transform: [{scale: interpolate(ring.value, [0, 1], [1, 1.55])}]}));
  return (
    // Centred on the notch circle (≈16px above the bar edge) so an even gap rings the button.
    <View style={{position: 'absolute', alignSelf: 'center', top: -FAB / 2 - 17, width: FAB, height: FAB, alignItems: 'center', justifyContent: 'center'}}>
      {live && <Animated.View pointerEvents="none" style={[{position: 'absolute', width: FAB, height: FAB, borderRadius: FAB / 2, backgroundColor: scheme.primary}, ringStyle]} />}
      <Tap onPress={onPress} hapticMs={14} scaleTo={0.9}>
        <Gradient colors={live ? scheme.gradient : ['#64748B', '#334155']} style={{width: FAB, height: FAB, borderRadius: FAB / 2, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: c.bg}}>
          {speaking ? <Waveform active color="#fff" bars={5} height={22} /> : live ? <BrandMark white height={22} style={{marginLeft: 2}} /> : <Icon name="volume-off" size={28} color="#fff" />}
        </Gradient>
      </Tap>
    </View>
  );
}

function ControlSheet({visible, onClose}: {visible: boolean; onClose: () => void}) {
  const {c} = useTheme();
  const s = useSettings();
  const speaking = useAnnouncer(x => x.speaking);
  const paused = s.pausedUntil > Date.now();
  const live = s.active && !paused;
  const pause = (ms: number | 'tomorrow') => {
    const until = ms === 'tomorrow' ? (() => {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      d.setHours(7, 0, 0, 0);
      return d.getTime();
    })() : Date.now() + ms;
    s.set({pausedUntil: until});
    toast(`Paused until ${fmtTime(until)}`);
    onClose();
  };
  return (
    <Sheet visible={visible} onClose={onClose} title="RubyAlert">
      <Gradient colors={live ? ['#10B981', '#0EA5E9'] : paused ? ['#F59E0B', '#F97316'] : ['#64748B', '#334155']} style={{borderRadius: 22, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16}}>
        <Pulse color="#fff" active={live} />
        <View style={{flex: 1}}>
          <T v="h3" color="#fff">{live ? 'Live — announcing payments' : paused ? `Paused until ${fmtTime(s.pausedUntil)}` : 'Switched off'}</T>
          <T v="small" color="rgba(255,255,255,0.88)">{s.keepAlive ? 'Always on · works even when the app is closed' : 'Only while the app is running'}</T>
        </View>
      </Gradient>

      <View style={{borderRadius: 18, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: c.border, marginBottom: 16}}>
        <Row icon="power" iconColor={s.active ? c.success : c.danger} title="Soundbox on" right={<Toggle value={s.active} onChange={active => s.set({active, pausedUntil: 0})} />} />
        <Row icon="lightning-bolt-outline" iconColor={c.primary} title="Always on" subtitle="Survives swipe-away · instant" right={<Toggle value={s.keepAlive} onChange={keepAlive => s.set({keepAlive})} />} last />
      </View>

      <T v="tiny" mute style={{marginBottom: 8, marginLeft: 4}}>PAUSE ANNOUNCEMENTS</T>
      <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18}}>
        <Chip label="15 min" icon="timer-outline" onPress={() => pause(15 * 60000)} />
        <Chip label="1 hour" icon="timer-outline" onPress={() => pause(3600000)} />
        <Chip label="Until tomorrow" icon="weather-night" onPress={() => pause('tomorrow')} />
        {paused && <Chip label="Resume now" icon="play" active onPress={() => { s.set({pausedUntil: 0}); onClose(); }} />}
      </View>

      <View style={{flexDirection: 'row', gap: 10, marginBottom: 8}}>
        <Button small kind="secondary" title="Test voice" icon="play-circle-outline" style={{flex: 1}} onPress={() => preview(TEST_TEXT[s.language], s.language).catch(() => toast('Voice not available', 'error'))} />
        <Button small kind="secondary" title="Stop speaking" icon="stop-circle-outline" style={{flex: 1}} disabled={!speaking} onPress={() => stopAll()} />
      </View>
    </Sheet>
  );
}

/** Lightweight tab host: screens stay mounted (instant switching) and cross-fade. */
export function Tabs() {
  const {c, dark} = useTheme();
  const insets = useSafeAreaInsets();
  const {width} = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const [visited, setVisited] = useState<Set<number>>(new Set([0]));
  const [controls, setControls] = useState(false);
  const h = BAR + insets.bottom;

  const go = (i: number) => {
    if (i === index) return;
    haptic(6);
    setVisited(v => new Set(v).add(i));
    setIndex(i);
  };

  const tab = (i: number) => {
    const t = TABS[i];
    return <TabButton key={t.id} active={i === index} label={t.label} icon={t.icon} iconOff={t.iconOff} onPress={() => go(i)} />;
  };

  return (
    <View style={{flex: 1, backgroundColor: c.bg}}>
      {TABS.map((t, i) =>
        visited.has(i) ? (
          <TabPane key={t.id} active={i === index}>
            <t.C />
          </TabPane>
        ) : null,
      )}
      {/* Soft fade so content dissolves just above the bar. */}
      <View pointerEvents="none" style={{position: 'absolute', left: 0, right: 0, bottom: h - 1, height: 28}}>
        <Gradient colors={[c.bg + '00', c.bg + 'CC']} angle={90} style={{flex: 1}} />
      </View>

      {/* Docked bar with a notch for the raised centre button. */}
      <View style={{position: 'absolute', left: 0, right: 0, bottom: 0, height: h}}>
        <Svg width={width} height={h} style={StyleSheet.absoluteFill}>
          <Path d={notchPath(width, h)} fill={dark ? c.surface : '#FFFFFF'} stroke={c.border} strokeWidth={1} />
        </Svg>
        <View style={{flexDirection: 'row', height: BAR}}>
          {tab(0)}
          {tab(1)}
          <View style={{width: NOTCH * 2 + 12}} />
          {tab(2)}
          {tab(3)}
        </View>
        <SoundboxButton onPress={() => setControls(true)} />
      </View>

      <ControlSheet visible={controls} onClose={() => setControls(false)} />
    </View>
  );
}

function TabPane({active, children}: {active: boolean; children: React.ReactNode}) {
  const o = useSharedValue(active ? 1 : 0);
  useEffect(() => {
    o.value = withTiming(active ? 1 : 0, {duration: active ? 220 : 0});
  }, [active, o]);
  const s = useAnimatedStyle(() => ({opacity: o.value, transform: [{translateY: interpolate(o.value, [0, 1], [8, 0])}]}));
  return (
    <Animated.View pointerEvents={active ? 'auto' : 'none'} style={[StyleSheet.absoluteFill, s, !active && {zIndex: -1}]}>
      {children}
    </Animated.View>
  );
}
