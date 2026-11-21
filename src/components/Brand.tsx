import React from 'react';
import {Image, ImageStyle, StyleProp, View, ViewStyle} from 'react-native';
import {useTheme} from '../theme';

/** RubyAlert brand assets (generated from the master logo — see branding/README.md). */
const ICON = require('../assets/brand/icon.png');
const MARK = require('../assets/brand/mark.png');
const MARK_WHITE = require('../assets/brand/mark-white.png');
const WORDMARK = require('../assets/brand/wordmark.png');
const WORDMARK_INK = require('../assets/brand/wordmark-ink.png');
const LOGO = require('../assets/brand/logo.png');

export const APP_NAME = 'RubyAlert';
export const APP_VERSION = '1.0.0';

// Intrinsic aspect ratios of the trimmed artwork.
const MARK_RATIO = 1.4;
const WORDMARK_RATIO = 4.58;

/** The app icon tile (rounded ruby square with the mark), with a soft ruby shadow. */
export function AppIcon({size = 48, style}: {size?: number; style?: StyleProp<ViewStyle>}) {
  return (
    <View style={[{width: size, height: size, borderRadius: size * 0.2, backgroundColor: '#3A0410', shadowColor: '#E0103A', shadowOpacity: 0.45, shadowRadius: size * 0.25, shadowOffset: {width: 0, height: size * 0.08}, elevation: Math.round(size / 8)}, style]}>
      <Image source={ICON} style={{width: size, height: size}} />
    </View>
  );
}

/** The faceted R with sound waves; `white` for use on gradients and coloured surfaces. */
export function BrandMark({height = 32, white, style}: {height?: number; white?: boolean; style?: StyleProp<ImageStyle>}) {
  return <Image source={white ? MARK_WHITE : MARK} resizeMode="contain" style={[{height, width: height * MARK_RATIO}, style]} />;
}

/** "RubyAlert" lettering. Picks the ink version on light surfaces unless `onDark` is forced. */
export function Wordmark({height = 28, onDark, style}: {height?: number; onDark?: boolean; style?: StyleProp<ImageStyle>}) {
  const {dark} = useTheme();
  return <Image source={onDark ?? dark ? WORDMARK : WORDMARK_INK} resizeMode="contain" style={[{height, width: height * WORDMARK_RATIO}, style]} />;
}

/** The complete logo exactly as designed (tile + mark + wordmark). */
export function FullLogo({size = 160, style}: {size?: number; style?: StyleProp<ImageStyle>}) {
  return <Image source={LOGO} style={[{width: size, height: size}, style]} />;
}
