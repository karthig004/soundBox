import type {Lang} from '../engine/types';

export interface VoicePersona {
  id: string;
  name: string;
  tagline: string;
  pitch: number;
  rate: number;
  gender?: 'male' | 'female';
  icon: string;
  colors: [string, string];
}

/** Voice "tunes": pitch/speed personas layered over whichever device voice is chosen. */
export const PERSONAS: VoicePersona[] = [
  {id: 'natural', name: 'Natural', tagline: 'Balanced, everyday voice', pitch: 1, rate: 1, icon: 'account-voice', colors: ['#6366F1', '#8B5CF6']},
  {id: 'shopkeeper', name: 'Shop Counter', tagline: 'Clear & loud for busy shops', pitch: 0.92, rate: 0.92, icon: 'storefront', colors: ['#F97316', '#EF4444']},
  {id: 'anchor', name: 'News Anchor', tagline: 'Crisp, confident delivery', pitch: 1, rate: 1.12, icon: 'microphone-variant', colors: ['#0EA5E9', '#2563EB']},
  {id: 'deep', name: 'Deep Baritone', tagline: 'Rich and authoritative', pitch: 0.7, rate: 0.9, gender: 'male', icon: 'waveform', colors: ['#334155', '#6366F1']},
  {id: 'bright', name: 'Bright & Cheerful', tagline: 'Friendly, upbeat tone', pitch: 1.25, rate: 1.05, gender: 'female', icon: 'emoticon-happy-outline', colors: ['#EC4899', '#F59E0B']},
  {id: 'calm', name: 'Calm Narrator', tagline: 'Slow and soothing', pitch: 0.95, rate: 0.8, icon: 'leaf', colors: ['#10B981', '#14B8A6']},
  {id: 'elder', name: 'Gentle Elder', tagline: 'Extra slow, easy to follow', pitch: 0.85, rate: 0.7, icon: 'human-cane', colors: ['#A16207', '#D97706']},
  {id: 'express', name: 'Express', tagline: 'Fast for high-volume counters', pitch: 1.05, rate: 1.45, icon: 'lightning-bolt', colors: ['#FACC15', '#F97316']},
  {id: 'robot', name: 'Robo', tagline: 'Retro machine voice', pitch: 0.5, rate: 1.05, icon: 'robot-outline', colors: ['#64748B', '#0EA5E9']},
  {id: 'chipmunk', name: 'Chipmunk', tagline: 'Just for fun', pitch: 1.9, rate: 1.2, icon: 'rabbit', colors: ['#A855F7', '#EC4899']},
];

export interface Chime {
  id: string;
  name: string;
  icon: string;
}

/** Synthesised natively (ChimePlayer.kt) — ids must match. */
export const CHIMES: Chime[] = [
  {id: 'none', name: 'No chime', icon: 'volume-off'},
  {id: 'classic', name: 'Ding Dong', icon: 'bell-ring-outline'},
  {id: 'cash', name: 'Cash Register', icon: 'cash-register'},
  {id: 'coin', name: 'Coin Drop', icon: 'hand-coin-outline'},
  {id: 'success', name: 'Success Rise', icon: 'trending-up'},
  {id: 'marimba', name: 'Marimba', icon: 'music-note'},
  {id: 'bell', name: 'Temple Bell', icon: 'bell-outline'},
  {id: 'airport', name: 'Announcement', icon: 'bullhorn-outline'},
  {id: 'digital', name: 'Digital Beep', icon: 'chip'},
  {id: 'soft', name: 'Soft Pad', icon: 'weather-night'},
  {id: 'drop', name: 'Water Drop', icon: 'water-outline'},
];

export const LANGS: {id: Lang; name: string; native: string; tag: string}[] = [
  {id: 'ta', name: 'Tamil', native: 'தமிழ்', tag: 'ta-IN'},
  {id: 'en', name: 'English', native: 'English', tag: 'en-IN'},
  {id: 'hi', name: 'Hindi', native: 'हिन्दी', tag: 'hi-IN'},
];

export const langTag = (l: Lang) => LANGS.find(x => x.id === l)?.tag ?? 'en-IN';
