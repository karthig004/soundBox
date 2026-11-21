import React, {useEffect} from 'react';
import {View} from 'react-native';
import Animated, {Easing, useAnimatedProps, useAnimatedStyle, useSharedValue, withDelay, withTiming} from 'react-native-reanimated';
import LinearGradient from 'react-native-linear-gradient';
import Svg, {Circle, Defs, LinearGradient as SvgGrad, Stop} from 'react-native-svg';
import {useTheme} from '../theme';
import {compactMoney} from '../utils/format';
import {T} from './ui';

function GrowBar({ratio, i, colors, height, highlight, empty}: {ratio: number; i: number; colors: string[]; height: number; highlight?: boolean; empty?: boolean}) {
  const v = useSharedValue(0);
  useEffect(() => {
    v.value = withDelay(i * 18, withTiming(ratio, {duration: 750, easing: Easing.out(Easing.exp)}));
  }, [ratio, i, v]);
  const s = useAnimatedStyle(() => ({height: Math.max(4, v.value * height)}));
  return (
    <Animated.View style={[{width: '100%', borderRadius: 6, overflow: 'hidden', opacity: empty ? 1 : highlight ? 1 : 0.8}, s]}>
      <LinearGradient colors={colors} start={{x: 0, y: 0}} end={{x: 0, y: 1}} style={{flex: 1}} />
    </Animated.View>
  );
}

/** Animated column chart. Bars grow in with a stagger whenever data changes. */
export function Bars({values, labels, height = 120, color, highlightIndex, showMax = true}: {
  values: number[];
  labels?: (string | null)[];
  height?: number;
  color?: string;
  highlightIndex?: number;
  showMax?: boolean;
}) {
  const {c} = useTheme();
  const peak = Math.max(0, ...values);
  const max = Math.max(1, peak);
  const empty = peak === 0;
  // No data: a short, quiet skeleton with a message instead of a tall empty box.
  const h = empty ? Math.min(height, 64) : height;
  const skeleton = (i: number) => 0.25 + 0.55 * Math.abs(Math.sin(i * 0.9 + 0.6));
  return (
    <View>
      {showMax && !empty && (
        <T v="tiny" mute style={{marginBottom: 6}}>
          peak {compactMoney(max)}
        </T>
      )}
      <View style={{flexDirection: 'row', alignItems: 'flex-end', height: h, gap: values.length > 20 ? 3 : 6}}>
        {values.map((v, i) => (
          <View key={i} style={{flex: 1, justifyContent: 'flex-end', height: h}}>
            <GrowBar
              ratio={empty ? skeleton(i) : v / max}
              i={i}
              height={h}
              empty={empty}
              highlight={i === highlightIndex}
              colors={empty ? [c.cardAlt, c.cardAlt] : i === highlightIndex ? [c.secondary, c.primary] : v ? [color ?? c.primary, (color ?? c.primary) + '66'] : [c.cardAlt, c.cardAlt]}
            />
          </View>
        ))}
        {empty && (
          <View style={{position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center'}}>
            <View style={{paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: c.card, borderWidth: 0.5, borderColor: c.border}}>
              <T v="small" dim style={{fontWeight: '600'}}>No collections yet</T>
            </View>
          </View>
        )}
      </View>
      {labels && (
        <View style={{flexDirection: 'row', marginTop: 6}}>
          {labels.map((l, i) => (
            // Cells are as narrow as a bar; the label floats centred over its cell so "12a" never truncates.
            <View key={i} style={{flex: 1, alignItems: 'center', height: 14}}>
              {l ? (
                <T v="tiny" mute style={{position: 'absolute', width: 40, textAlign: 'center', fontSize: 10}} numberOfLines={1}>
                  {l}
                </T>
              ) : null}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const ACircle = Animated.createAnimatedComponent(Circle);

function Arc({r, stroke, width, from, frac, color, delay}: {r: number; stroke: number; width: number; from: number; frac: number; color: string; delay: number}) {
  const C = 2 * Math.PI * r;
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withDelay(delay, withTiming(frac, {duration: 900, easing: Easing.out(Easing.cubic)}));
  }, [frac, delay, p]);
  const props = useAnimatedProps(() => ({strokeDasharray: [C * p.value, C]}) as any);
  return (
    <ACircle
      cx={width / 2}
      cy={width / 2}
      r={r}
      stroke={color}
      strokeWidth={stroke}
      strokeLinecap="round"
      fill="none"
      animatedProps={props}
      transform={`rotate(${-90 + from * 360} ${width / 2} ${width / 2})`}
    />
  );
}

/** Animated donut; each segment sweeps in sequence. */
export function Donut({segments, size = 140, stroke = 16, center}: {segments: {value: number; color: string}[]; size?: number; stroke?: number; center?: React.ReactNode}) {
  const {c} = useTheme();
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const r = (size - stroke) / 2;
  let acc = 0;
  const gap = segments.filter(s => s.value > 0).length > 1 ? 0.012 : 0;
  return (
    <View style={{width: size, height: size, alignItems: 'center', justifyContent: 'center'}}>
      <Svg width={size} height={size} style={{position: 'absolute'}}>
        <Defs>
          <SvgGrad id="g" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={c.primary} />
            <Stop offset="1" stopColor={c.secondary} />
          </SvgGrad>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={c.cardAlt} strokeWidth={stroke} fill="none" />
        {segments.map((s, i) => {
          const frac = s.value / total;
          const from = acc;
          acc += frac;
          if (frac <= 0) return null;
          return <Arc key={i} r={r} stroke={stroke} width={size} from={from} frac={Math.max(0, frac - gap)} color={s.color} delay={i * 180} />;
        })}
      </Svg>
      {center}
    </View>
  );
}

/** Thin progress bar with animated fill, for ranked lists. */
export function Meter({ratio, color}: {ratio: number; color: string}) {
  const {c} = useTheme();
  const v = useSharedValue(0);
  useEffect(() => {
    v.value = withTiming(Math.min(1, ratio), {duration: 800, easing: Easing.out(Easing.cubic)});
  }, [ratio, v]);
  const s = useAnimatedStyle(() => ({width: `${v.value * 100}%`}));
  return (
    <View style={{height: 6, borderRadius: 3, backgroundColor: c.cardAlt, overflow: 'hidden'}}>
      <Animated.View style={[{height: 6, borderRadius: 3, backgroundColor: color}, s]} />
    </View>
  );
}
