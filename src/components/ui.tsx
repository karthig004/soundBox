import React, {useEffect} from 'react';
import {Pressable, PressableProps, StyleProp, StyleSheet, Text, TextProps, TextStyle, useWindowDimensions, View, ViewProps, ViewStyle} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Animated, {
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import MCI from 'react-native-vector-icons/MaterialCommunityIcons';
import {font, useTheme} from '../theme';
import {haptic} from '../utils/format';

export const Icon = ({name, size = 22, color, style}: {name: string; size?: number; color?: string; style?: any}) => {
  const {c} = useTheme();
  return <MCI name={name} size={size} color={color ?? c.text} style={style} />;
};

type Variant = keyof typeof font;
export function T({v = 'body', color, dim, mute, style, ...p}: TextProps & {v?: Variant; color?: string; dim?: boolean; mute?: boolean}) {
  const {c} = useTheme();
  return <Text {...p} style={[font[v] as TextStyle, {color: color ?? (mute ? c.textMute : dim ? c.textDim : c.text)}, style]} />;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Pressable with a spring "squish" and a light haptic tick. */
export function Tap({style, children, scaleTo = 0.96, onPress, hapticMs = 8, disabled, ...p}: PressableProps & {style?: StyleProp<ViewStyle>; scaleTo?: number; hapticMs?: number; children?: React.ReactNode}) {
  const s = useSharedValue(1);
  const a = useAnimatedStyle(() => ({transform: [{scale: s.value}]}));
  return (
    <AnimatedPressable
      {...p}
      disabled={disabled}
      onPressIn={e => {
        s.value = withSpring(scaleTo, {damping: 15, stiffness: 400});
        p.onPressIn?.(e);
      }}
      onPressOut={e => {
        s.value = withSpring(1, {damping: 12, stiffness: 300});
        p.onPressOut?.(e);
      }}
      onPress={e => {
        if (hapticMs) haptic(hapticMs);
        onPress?.(e);
      }}
      style={[a, style, disabled && {opacity: 0.45}]}>
      {children}
    </AnimatedPressable>
  );
}

export function Gradient({colors, style, children, angle = 135, ...p}: ViewProps & {colors?: string[]; angle?: number}) {
  const {scheme} = useTheme();
  const rad = (angle * Math.PI) / 180;
  return (
    <LinearGradient
      {...p}
      colors={colors ?? scheme.gradient}
      start={{x: 0.5 - Math.cos(rad) / 2, y: 0.5 - Math.sin(rad) / 2}}
      end={{x: 0.5 + Math.cos(rad) / 2, y: 0.5 + Math.sin(rad) / 2}}
      style={style}>
      {children}
    </LinearGradient>
  );
}

/**
 * Surface for grouped content. Dark theme: a subtle top-lit gradient with a highlight edge for
 * depth; light theme: white with a soft shadow.
 */
export function Card({style, children, padded = true, alt, ...p}: ViewProps & {padded?: boolean; alt?: boolean}) {
  const {c, dark, radius} = useTheme();
  const flat = StyleSheet.flatten(style) ?? {};
  const r = (flat.borderRadius as number | undefined) ?? radius.lg;
  return (
    <View
      {...p}
      style={[
        {
          backgroundColor: alt ? c.cardAlt : c.card,
          borderRadius: r,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: c.border,
          padding: padded ? 16 : 0,
        },
        !dark && {shadowColor: c.shadow, shadowOpacity: 0.07, shadowRadius: 18, shadowOffset: {width: 0, height: 8}, elevation: 3},
        style,
      ]}>
      {dark && !alt && flat.backgroundColor === undefined && (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, {borderRadius: r, overflow: 'hidden'}]}>
          <LinearGradient colors={[c.cardTop, c.cardBottom]} style={StyleSheet.absoluteFill} />
          <LinearGradient colors={[c.highlight, 'transparent']} start={{x: 0, y: 0}} end={{x: 0, y: 1}} style={{height: 1.5, marginHorizontal: r / 2}} />
        </View>
      )}
      {children}
    </View>
  );
}

/** Width of one cell in an N-column grid that exactly fills the screen (avoids % rounding wraps). */
export function useGridCell(cols: number, gap: number, sidePadding = 32) {
  const {width} = useWindowDimensions();
  return Math.floor((width - sidePadding - gap * (cols - 1)) / cols);
}

export function Button({title, icon, onPress, kind = 'primary', style, small, disabled, loading}: {
  title: string;
  icon?: string;
  onPress?: () => void;
  kind?: 'primary' | 'secondary' | 'ghost' | 'danger';
  style?: StyleProp<ViewStyle>;
  small?: boolean;
  disabled?: boolean;
  loading?: boolean;
}) {
  const {c, radius} = useTheme();
  const h = small ? 40 : 54;
  const content = (
    <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: h, paddingHorizontal: small ? 14 : 20}}>
      {icon ? <Icon name={loading ? 'loading' : icon} size={small ? 18 : 20} color={kind === 'primary' || kind === 'danger' ? '#fff' : c.primary} /> : null}
      <T v={small ? 'small' : 'h3'} color={kind === 'primary' || kind === 'danger' ? '#fff' : kind === 'ghost' ? c.primary : c.text} style={{fontWeight: '700'}}>
        {title}
      </T>
    </View>
  );
  return (
    <Tap onPress={onPress} disabled={disabled || loading} style={[{borderRadius: radius.pill, overflow: 'hidden'}, style]}>
      {kind === 'primary' ? (
        <Gradient angle={0}>{content}</Gradient>
      ) : (
        <View style={{backgroundColor: kind === 'danger' ? c.danger : kind === 'secondary' ? c.cardAlt : 'transparent', borderWidth: kind === 'secondary' ? StyleSheet.hairlineWidth : 0, borderColor: c.border, borderRadius: radius.pill}}>
          {content}
        </View>
      )}
    </Tap>
  );
}

export function IconBtn({name, onPress, color, bg, size = 40, iconSize = 22}: {name: string; onPress?: () => void; color?: string; bg?: string; size?: number; iconSize?: number}) {
  const {c} = useTheme();
  return (
    <Tap onPress={onPress} style={{width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: bg ?? c.cardAlt}}>
      <Icon name={name} size={iconSize} color={color ?? c.text} />
    </Tap>
  );
}

export function Toggle({value, onChange, disabled}: {value: boolean; onChange: (v: boolean) => void; disabled?: boolean}) {
  const {c, dark} = useTheme();
  const off = dark ? '#2A2F47' : '#D9DCE8';
  const on = c.primary;
  const p = useSharedValue(value ? 1 : 0);
  useEffect(() => {
    p.value = withSpring(value ? 1 : 0, {damping: 16, stiffness: 220});
  }, [value, p]);
  const track = useAnimatedStyle(() => ({backgroundColor: interpolateColor(p.value, [0, 1], [off, on])}));
  const knob = useAnimatedStyle(() => ({transform: [{translateX: interpolate(p.value, [0, 1], [2, 22])}, {scale: interpolate(p.value, [0, 0.5, 1], [1, 1.12, 1])}]}));
  return (
    <Tap onPress={() => onChange(!value)} disabled={disabled} scaleTo={0.92}>
      <Animated.View style={[{width: 50, height: 30, borderRadius: 15, justifyContent: 'center'}, track]}>
        <Animated.View style={[{width: 26, height: 26, borderRadius: 13, backgroundColor: '#fff', elevation: 2, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 3, shadowOffset: {width: 0, height: 1}}, knob]} />
      </Animated.View>
    </Tap>
  );
}

export function Chip({label, active, onPress, icon, color}: {label: string; active?: boolean; onPress?: () => void; icon?: string; color?: string}) {
  const {c, radius} = useTheme();
  const tint = color ?? c.primary;
  return (
    <Tap onPress={onPress} style={{flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 36, borderRadius: radius.pill, backgroundColor: active ? tint : c.cardAlt, borderWidth: StyleSheet.hairlineWidth, borderColor: active ? tint : c.border}}>
      {icon ? <Icon name={icon} size={16} color={active ? '#fff' : c.textDim} /> : null}
      <T v="small" color={active ? '#fff' : c.textDim} style={{fontWeight: '700'}}>
        {label}
      </T>
    </Tap>
  );
}

/** Segmented control with a sliding pill indicator. */
export function Segmented<T extends string>({options, value, onChange, style, glass}: {options: {id: T; label: string; icon?: string}[]; value: T; onChange: (v: T) => void; style?: StyleProp<ViewStyle>; /** Frosted track for use on top of gradients. */ glass?: boolean}) {
  const {c, radius} = useTheme();
  const [w, setW] = React.useState(0);
  const idx = Math.max(0, options.findIndex(o => o.id === value));
  const x = useSharedValue(0);
  const seg = w / options.length;
  useEffect(() => {
    x.value = withSpring(idx * seg, {damping: 18, stiffness: 220});
  }, [idx, seg, x]);
  const pill = useAnimatedStyle(() => ({transform: [{translateX: x.value}]}));
  return (
    <View onLayout={e => setW(e.nativeEvent.layout.width - 8)} style={[{flexDirection: 'row', backgroundColor: glass ? 'rgba(255,255,255,0.16)' : c.cardAlt, borderRadius: radius.pill, padding: 4, borderWidth: StyleSheet.hairlineWidth, borderColor: glass ? 'rgba(255,255,255,0.3)' : c.border}, style]}>
      {w > 0 && (
        <Animated.View style={[{position: 'absolute', top: 4, left: 4, bottom: 4, width: seg, borderRadius: radius.pill, overflow: 'hidden'}, pill]}>
          {glass ? <View style={{flex: 1, backgroundColor: '#fff'}} /> : <Gradient angle={0} style={{flex: 1}} />}
        </Animated.View>
      )}
      {options.map(o => (
        <Pressable key={o.id} onPress={() => { haptic(6); onChange(o.id); }} style={{flex: 1, height: 36, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6}}>
          {o.icon ? <Icon name={o.icon} size={16} color={o.id === value ? (glass ? c.primary : '#fff') : glass ? 'rgba(255,255,255,0.9)' : c.textDim} /> : null}
          <T v="small" color={o.id === value ? (glass ? c.primary : '#fff') : glass ? 'rgba(255,255,255,0.9)' : c.textDim} style={{fontWeight: '700'}} numberOfLines={1}>
            {o.label}
          </T>
        </Pressable>
      ))}
    </View>
  );
}

export function Row({icon, iconColor, title, subtitle, right, onPress, chevron = !!onPress, danger, last}: {
  icon?: string;
  iconColor?: string;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  chevron?: boolean;
  danger?: boolean;
  last?: boolean;
}) {
  const {c} = useTheme();
  const tint = danger ? c.danger : iconColor ?? c.primary;
  const body = (
    <View style={{flexDirection: 'row', alignItems: 'center', paddingVertical: 13, paddingHorizontal: 14, gap: 14, borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth, borderBottomColor: c.border}}>
      {icon ? (
        <View style={{width: 36, height: 36, borderRadius: 11, backgroundColor: tint + '22', alignItems: 'center', justifyContent: 'center'}}>
          <Icon name={icon} size={20} color={tint} />
        </View>
      ) : null}
      <View style={{flex: 1}}>
        <T v="body" color={danger ? c.danger : undefined} style={{fontWeight: '600'}}>
          {title}
        </T>
        {subtitle ? (
          <T v="small" mute style={{marginTop: 2}} numberOfLines={2}>
            {subtitle}
          </T>
        ) : null}
      </View>
      {right}
      {chevron ? <Icon name="chevron-right" size={22} color={c.textMute} /> : null}
    </View>
  );
  return onPress ? (
    <Tap onPress={onPress} scaleTo={0.985}>
      {body}
    </Tap>
  ) : (
    body
  );
}

export function Group({title, children, style, footer}: {title?: string; children: React.ReactNode; style?: StyleProp<ViewStyle>; footer?: string}) {
  return (
    <View style={[{marginBottom: 22}, style]}>
      {title ? (
        <T v="tiny" mute style={{marginLeft: 6, marginBottom: 8, textTransform: 'uppercase'}}>
          {title}
        </T>
      ) : null}
      <Card padded={false} style={{overflow: 'hidden'}}>
        {children}
      </Card>
      {footer ? (
        <T v="small" mute style={{marginHorizontal: 6, marginTop: 8}}>
          {footer}
        </T>
      ) : null}
    </View>
  );
}

export function Badge({label, color, icon}: {label: string; color: string; icon?: string}) {
  return (
    <View style={{flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: color + '22', alignSelf: 'flex-start'}}>
      {icon ? <Icon name={icon} size={12} color={color} /> : null}
      <T v="tiny" color={color}>
        {label}
      </T>
    </View>
  );
}

export function Empty({icon, title, subtitle, action}: {icon: string; title: string; subtitle?: string; action?: React.ReactNode}) {
  const {c} = useTheme();
  const f = useSharedValue(0);
  useEffect(() => {
    f.value = withTiming(1, {duration: 600});
  }, [f]);
  const a = useAnimatedStyle(() => ({opacity: f.value, transform: [{translateY: interpolate(f.value, [0, 1], [16, 0])}]}));
  return (
    <Animated.View style={[{alignItems: 'center', paddingVertical: 48, paddingHorizontal: 32}, a]}>
      <View style={{width: 84, height: 84, borderRadius: 42, backgroundColor: c.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: 16}}>
        <Icon name={icon} size={38} color={c.primary} />
      </View>
      <T v="h3" style={{textAlign: 'center'}}>
        {title}
      </T>
      {subtitle ? (
        <T v="small" dim style={{textAlign: 'center', marginTop: 6, lineHeight: 19}}>
          {subtitle}
        </T>
      ) : null}
      {action ? <View style={{marginTop: 18}}>{action}</View> : null}
    </Animated.View>
  );
}

export const Divider = () => {
  const {c} = useTheme();
  return <View style={{height: StyleSheet.hairlineWidth, backgroundColor: c.border, marginVertical: 12}} />;
};
