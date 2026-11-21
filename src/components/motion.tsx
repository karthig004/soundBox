import React, {useEffect, useState} from 'react';
import {StyleProp, TextInput, TextStyle, View, ViewStyle} from 'react-native';
import {Gesture, GestureDetector} from 'react-native-gesture-handler';
import Animated, {
  Easing,
  cancelAnimation,
  interpolate,
  runOnJS,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import {useTheme} from '../theme';
import {groupIN, haptic} from '../utils/format';
import Svg, {Defs, RadialGradient, Rect, Stop} from 'react-native-svg';
import {Gradient, T} from './ui';

Animated.addWhitelistedNativeProps({text: true});
const AnimatedInput = Animated.createAnimatedComponent(TextInput);

function groupWorklet(n: number, decimals: number) {
  'worklet';
  const neg = n < 0;
  const fixed = Math.abs(n).toFixed(decimals);
  const parts = fixed.split('.');
  const int = parts[0];
  let out = int;
  if (int.length > 3) {
    const last3 = int.slice(int.length - 3);
    let rest = int.slice(0, int.length - 3);
    let grouped = '';
    while (rest.length > 2) {
      grouped = ',' + rest.slice(rest.length - 2) + grouped;
      rest = rest.slice(0, rest.length - 2);
    }
    out = rest + grouped + ',' + last3;
  }
  const dec = parts[1] && parts[1] !== '00' ? '.' + parts[1] : '';
  return (neg ? '-' : '') + out + dec;
}

/** Counts up to `value` on the UI thread — no JS re-renders per frame. */
export function AnimatedAmount({value, style, prefix = '₹', decimals = 0, duration = 900}: {value: number; style?: StyleProp<TextStyle>; prefix?: string; decimals?: number; duration?: number}) {
  const sv = useSharedValue(0);
  useEffect(() => {
    sv.value = withTiming(value, {duration, easing: Easing.out(Easing.cubic)});
  }, [value, sv, duration]);
  const props = useAnimatedProps(() => ({text: prefix + groupWorklet(sv.value, decimals)}) as any);
  return (
    <AnimatedInput
      editable={false}
      underlineColorAndroid="transparent"
      defaultValue={prefix + groupIN(value, decimals)}
      animatedProps={props}
      style={[{padding: 0, margin: 0, includeFontPadding: false, fontVariant: ['tabular-nums']}, style]}
    />
  );
}

/** Concentric pulsing rings, used for the "soundbox live" indicator. */
export function Pulse({color, size = 12, active = true}: {color: string; size?: number; active?: boolean}) {
  const p = useSharedValue(0);
  useEffect(() => {
    if (active) p.value = withRepeat(withTiming(1, {duration: 1600, easing: Easing.out(Easing.quad)}), -1, false);
    else {
      cancelAnimation(p);
      p.value = 0;
    }
  }, [active, p]);
  const ring = useAnimatedStyle(() => ({opacity: interpolate(p.value, [0, 1], [0.6, 0]), transform: [{scale: interpolate(p.value, [0, 1], [1, 2.8])}]}));
  return (
    <View style={{width: size * 3, height: size * 3, alignItems: 'center', justifyContent: 'center'}}>
      {active && <Animated.View style={[{position: 'absolute', width: size, height: size, borderRadius: size / 2, backgroundColor: color}, ring]} />}
      <View style={{width: size, height: size, borderRadius: size / 2, backgroundColor: color}} />
    </View>
  );
}

function Bar({i, active, color, h}: {i: number; active: boolean; color: string; h: number}) {
  const v = useSharedValue(0.25);
  useEffect(() => {
    if (active) {
      const d = 260 + ((i * 97) % 220);
      v.value = withDelay(i * 40, withRepeat(withSequence(withTiming(1, {duration: d}), withTiming(0.2 + ((i * 13) % 5) / 10, {duration: d})), -1, true));
    } else {
      cancelAnimation(v);
      v.value = withTiming(0.25, {duration: 300});
    }
  }, [active, i, v]);
  const s = useAnimatedStyle(() => ({height: h * v.value}));
  return <Animated.View style={[{width: 4, borderRadius: 2, backgroundColor: color, marginHorizontal: 2}, s]} />;
}

/** Live voice waveform that dances while an announcement is playing. */
export function Waveform({active, color, bars = 18, height = 36}: {active: boolean; color: string; bars?: number; height?: number}) {
  return (
    <View style={{flexDirection: 'row', alignItems: 'center', height}}>
      {Array.from({length: bars}).map((_, i) => (
        <Bar key={i} i={i} active={active} color={color} h={height} />
      ))}
    </View>
  );
}

/** Floating gradient orbs behind hero areas. */
let glowSeq = 0;

/** A soft light spot: radial gradient fading to fully transparent, so it reads as light, not a shape. */
function Glow({color, size, opacity}: {color: string; size: number; opacity: number}) {
  const id = React.useMemo(() => `glow${++glowSeq}`, []);
  return (
    <Svg width={size} height={size}>
      <Defs>
        <RadialGradient id={id} cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={color} stopOpacity={opacity} />
          <Stop offset="0.45" stopColor={color} stopOpacity={opacity * 0.45} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect width={size} height={size} fill={`url(#${id})`} />
    </Svg>
  );
}

/**
 * Ambient "aurora" behind hero areas: three slowly drifting light glows.
 * Runs on the UI thread; respects the Reduce motion setting by staying still.
 */
export function Orbs({colors}: {colors: string[]}) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withRepeat(withTiming(1, {duration: 11000, easing: Easing.inOut(Easing.sin)}), -1, true);
  }, [t]);
  const a = useAnimatedStyle(() => ({transform: [{translateX: interpolate(t.value, [0, 1], [-40, 50])}, {translateY: interpolate(t.value, [0, 1], [-10, 40])}, {scale: interpolate(t.value, [0, 1], [1, 1.15])}]}));
  const b = useAnimatedStyle(() => ({transform: [{translateX: interpolate(t.value, [0, 1], [40, -40])}, {translateY: interpolate(t.value, [0, 1], [30, -20])}, {scale: interpolate(t.value, [0, 1], [1.1, 0.95])}]}));
  const d = useAnimatedStyle(() => ({opacity: interpolate(t.value, [0, 0.5, 1], [0.6, 1, 0.6]), transform: [{translateX: interpolate(t.value, [0, 1], [0, 30])}]}));
  return (
    <View pointerEvents="none" style={{position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden'}}>
      <Animated.View style={[{position: 'absolute', top: -170, right: -150}, a]}>
        <Glow color={colors[0]} size={420} opacity={0.42} />
      </Animated.View>
      <Animated.View style={[{position: 'absolute', bottom: -220, left: -170}, b]}>
        <Glow color={colors[1] ?? colors[0]} size={460} opacity={0.5} />
      </Animated.View>
      <Animated.View style={[{position: 'absolute', top: 40, left: 60}, d]}>
        <Glow color="#ffffff" size={240} opacity={0.12} />
      </Animated.View>
    </View>
  );
}

/** Gesture-driven slider; runs entirely on the UI thread and snaps to `step`. */
export function Slider({value, min = 0, max = 1, step = 0.01, onChange, onEnd, format, style}: {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange?: (v: number) => void;
  onEnd?: (v: number) => void;
  format?: (v: number) => string;
  style?: StyleProp<ViewStyle>;
}) {
  const {c} = useTheme();
  const [w, setW] = useState(0);
  const [label, setLabel] = useState(value);
  const pos = useSharedValue(0);
  const knobScale = useSharedValue(1);
  const KNOB = 26;
  const track = Math.max(1, w - KNOB);

  useEffect(() => {
    if (w) pos.value = withSpring(((value - min) / (max - min)) * track, {damping: 20, stiffness: 240});
    setLabel(value);
  }, [value, w, min, max, track, pos]);

  const emit = (v: number, end: boolean) => {
    setLabel(v);
    onChange?.(v);
    if (end) {
      haptic(8);
      onEnd?.(v);
    }
  };
  const toValue = (x: number) => {
    'worklet';
    const raw = min + (Math.min(Math.max(x, 0), track) / track) * (max - min);
    return Math.round(raw / step) * step;
  };
  const start = useSharedValue(0);
  const pan = Gesture.Pan()
    .onBegin(e => {
      knobScale.value = withSpring(1.25);
      pos.value = Math.min(Math.max(e.x - KNOB / 2, 0), track);
      start.value = pos.value;
    })
    .onUpdate(e => {
      pos.value = Math.min(Math.max(start.value + e.translationX, 0), track);
      runOnJS(emit)(toValue(pos.value), false);
    })
    .onFinalize(() => {
      knobScale.value = withSpring(1);
      runOnJS(emit)(toValue(pos.value), true);
    });

  const fill = useAnimatedStyle(() => ({width: pos.value + KNOB / 2}));
  const knob = useAnimatedStyle(() => ({transform: [{translateX: pos.value}, {scale: knobScale.value}]}));

  return (
    <View style={style}>
      {format ? (
        <T v="small" color={c.primary} style={{alignSelf: 'flex-end', fontWeight: '800', marginBottom: 4}}>
          {format(label)}
        </T>
      ) : null}
      <GestureDetector gesture={pan}>
        <View onLayout={e => setW(e.nativeEvent.layout.width)} style={{height: 34, justifyContent: 'center'}}>
          <View style={{height: 8, borderRadius: 4, backgroundColor: c.cardAlt, overflow: 'hidden', borderWidth: 0.5, borderColor: c.border}}>
            <Animated.View style={[{height: 8, overflow: 'hidden', borderRadius: 4}, fill]}>
              <Gradient angle={0} style={{flex: 1}} />
            </Animated.View>
          </View>
          <Animated.View style={[{position: 'absolute', left: 0, width: KNOB, height: KNOB, borderRadius: KNOB / 2, backgroundColor: '#fff', borderWidth: 3, borderColor: c.primary, elevation: 3, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 4, shadowOffset: {width: 0, height: 2}}, knob]} />
        </View>
      </GestureDetector>
    </View>
  );
}
