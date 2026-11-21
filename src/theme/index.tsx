import React, {createContext, useContext, useMemo} from 'react';
import {useColorScheme} from 'react-native';
import {useSettings} from '../store/settings';

export interface Scheme {
  id: string;
  name: string;
  primary: string;
  secondary: string;
  gradient: [string, string, string];
  /** Optional tinted neutrals so the whole surface carries the scheme, not just the accents. */
  darkTint?: Partial<Colors>;
  lightTint?: Partial<Colors>;
}

/** RubyAlert brand colours, sampled from the logo. */
export const BRAND = {
  ruby: '#E0103A',
  rubyBright: '#FF2D55',
  rubyLight: '#FF7A8F',
  rubyDeep: '#8A0626',
  rubyNight: '#2A0008',
  gradient: ['#FF5A6E', '#E0103A', '#8A0626'] as [string, string, string],
};

export const SCHEMES: Scheme[] = [
  {
    id: 'ruby',
    name: 'Ruby',
    primary: '#FF2D55',
    secondary: '#FF7A8F',
    gradient: BRAND.gradient,
    darkTint: {
      bg: '#0B0609',
      bgAlt: '#110A0E',
      surface: '#160D12',
      card: '#180E14',
      cardAlt: '#24141C',
      border: 'rgba(255,214,224,0.08)',
      textDim: '#C2A9B2',
      textMute: '#86707A',
      overlay: 'rgba(10,3,6,0.62)',
      cardTop: '#22131A',
      cardBottom: '#120A0E',
      highlight: 'rgba(255,200,215,0.10)',
    },
    lightTint: {
      primary: '#E0103A',
      bg: '#FBF5F7',
      bgAlt: '#F5ECEF',
      cardAlt: '#FBF6F8',
      border: '#F0E1E6',
      textDim: '#5E4A52',
      textMute: '#A08C94',
      cardBottom: '#FDF9FA',
      shadow: '#3B0A18',
    },
  },
  {id: 'aurora', name: 'Aurora', primary: '#7C5CFF', secondary: '#22D3EE', gradient: ['#7C3AED', '#4F46E5', '#06B6D4']},
  {id: 'sunset', name: 'Sunset', primary: '#F97316', secondary: '#EC4899', gradient: ['#F59E0B', '#F97316', '#DB2777']},
  {id: 'emerald', name: 'Emerald', primary: '#10B981', secondary: '#0EA5E9', gradient: ['#059669', '#10B981', '#0EA5E9']},
  {id: 'royal', name: 'Royal', primary: '#6366F1', secondary: '#A855F7', gradient: ['#312E81', '#6366F1', '#A855F7']},
  {id: 'ocean', name: 'Ocean', primary: '#0EA5E9', secondary: '#22D3EE', gradient: ['#1E3A8A', '#0284C7', '#22D3EE']},
  {id: 'saffron', name: 'Saffron', primary: '#F59E0B', secondary: '#EF4444', gradient: ['#FBBF24', '#F59E0B', '#EF4444']},
  {id: 'rose', name: 'Rose Gold', primary: '#F43F5E', secondary: '#FB923C', gradient: ['#BE123C', '#F43F5E', '#FB923C']},
  {id: 'mint', name: 'Mint Fresh', primary: '#14B8A6', secondary: '#84CC16', gradient: ['#0F766E', '#14B8A6', '#84CC16']},
  {id: 'midnight', name: 'Midnight', primary: '#818CF8', secondary: '#38BDF8', gradient: ['#0F172A', '#1E293B', '#4F46E5']},
  {id: 'berry', name: 'Berry', primary: '#D946EF', secondary: '#6366F1', gradient: ['#86198F', '#D946EF', '#6366F1']},
];

export const ACCOUNT_PALETTE = ['#6366F1', '#10B981', '#F59E0B', '#EC4899', '#0EA5E9', '#EF4444', '#8B5CF6', '#14B8A6'];

export interface Colors {
  bg: string;
  bgAlt: string;
  surface: string;
  card: string;
  cardAlt: string;
  border: string;
  text: string;
  textDim: string;
  textMute: string;
  primary: string;
  secondary: string;
  onPrimary: string;
  success: string;
  successSoft: string;
  danger: string;
  dangerSoft: string;
  warning: string;
  warningSoft: string;
  info: string;
  infoSoft: string;
  overlay: string;
  primarySoft: string;
  shadow: string;
  /** Card surfaces are a subtle vertical gradient with a lighter top edge, for depth. */
  cardTop: string;
  cardBottom: string;
  highlight: string;
}

export interface Theme {
  dark: boolean;
  c: Colors;
  scheme: Scheme;
  radius: {sm: number; md: number; lg: number; xl: number; pill: number};
  space: (n: number) => number;
}

const alpha = (hex: string, a: number) => {
  const v = Math.round(a * 255).toString(16).padStart(2, '0');
  return hex + v;
};

function build(dark: boolean, scheme: Scheme): Theme {
  const c: Colors = dark
    ? {
        bg: '#07080F',
        bgAlt: '#0B0D18',
        surface: '#11131F',
        card: '#121524',
        cardAlt: '#1A1E31',
        border: 'rgba(255,255,255,0.07)',
        text: '#F4F5FB',
        textDim: '#A3A8C3',
        textMute: '#6B7090',
        primary: scheme.primary,
        secondary: scheme.secondary,
        onPrimary: '#FFFFFF',
        success: '#34D399',
        successSoft: 'rgba(52,211,153,0.14)',
        danger: '#FB7185',
        dangerSoft: 'rgba(251,113,133,0.14)',
        warning: '#FBBF24',
        warningSoft: 'rgba(251,191,36,0.14)',
        info: '#60A5FA',
        infoSoft: 'rgba(96,165,250,0.14)',
        overlay: 'rgba(3,4,10,0.6)',
        primarySoft: alpha(scheme.primary, 0.16),
        shadow: '#000000',
        cardTop: '#181C30',
        cardBottom: '#0F111D',
        highlight: 'rgba(255,255,255,0.09)',
      }
    : {
        bg: '#F4F5FA',
        bgAlt: '#ECEEF6',
        surface: '#FFFFFF',
        card: '#FFFFFF',
        cardAlt: '#F6F7FB',
        border: '#E5E7F0',
        text: '#0F1222',
        textDim: '#545A78',
        textMute: '#9095AE',
        primary: scheme.primary,
        secondary: scheme.secondary,
        onPrimary: '#FFFFFF',
        success: '#059669',
        successSoft: 'rgba(5,150,105,0.10)',
        danger: '#E11D48',
        dangerSoft: 'rgba(225,29,72,0.09)',
        warning: '#D97706',
        warningSoft: 'rgba(217,119,6,0.10)',
        info: '#2563EB',
        infoSoft: 'rgba(37,99,235,0.09)',
        overlay: 'rgba(15,18,34,0.45)',
        primarySoft: alpha(scheme.primary, 0.12),
        shadow: '#1B1F3B',
        cardTop: '#FFFFFF',
        cardBottom: '#FAFAFE',
        highlight: '#FFFFFF',
      };
  Object.assign(c, dark ? scheme.darkTint : scheme.lightTint);
  if (!dark && scheme.lightTint?.primary) c.primarySoft = alpha(scheme.lightTint.primary, 0.12);
  return {
    dark,
    c,
    scheme,
    radius: {sm: 10, md: 14, lg: 20, xl: 28, pill: 999},
    space: n => n * 4,
  };
}

const Ctx = createContext<Theme>(build(true, SCHEMES[0]));

export function ThemeProvider({children}: {children: React.ReactNode}) {
  const sys = useColorScheme();
  const pref = useSettings(s => s.theme);
  const schemeId = useSettings(s => s.scheme);
  const dark = pref === 'system' ? sys !== 'light' : pref === 'dark';
  const theme = useMemo(() => build(dark, SCHEMES.find(s => s.id === schemeId) ?? SCHEMES[0]), [dark, schemeId]);
  return <Ctx.Provider value={theme}>{children}</Ctx.Provider>;
}

export const useTheme = () => useContext(Ctx);

export const font = {
  h1: {fontSize: 30, fontWeight: '800' as const, letterSpacing: -0.6},
  h2: {fontSize: 22, fontWeight: '800' as const, letterSpacing: -0.3},
  h3: {fontSize: 17, fontWeight: '700' as const},
  body: {fontSize: 15, fontWeight: '500' as const},
  small: {fontSize: 13, fontWeight: '500' as const},
  tiny: {fontSize: 11, fontWeight: '600' as const, letterSpacing: 0.4},
  num: {fontVariant: ['tabular-nums' as const]},
};
