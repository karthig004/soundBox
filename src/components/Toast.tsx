import React, {useEffect} from 'react';
import {View} from 'react-native';
import Animated, {FadeInUp, FadeOutUp, LinearTransition} from 'react-native-reanimated';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {create} from 'zustand';
import {useTheme} from '../theme';
import {Icon, T} from './ui';

interface ToastItem {
  id: number;
  text: string;
  sub?: string;
  kind: 'success' | 'error' | 'info' | 'credit';
}

const useToasts = create<{items: ToastItem[]}>(() => ({items: []}));
let seq = 0;

export function toast(text: string, kind: ToastItem['kind'] = 'info', sub?: string) {
  const id = ++seq;
  useToasts.setState(s => ({items: [...s.items.slice(-2), {id, text, sub, kind}]}));
  setTimeout(() => useToasts.setState(s => ({items: s.items.filter(i => i.id !== id)})), 3200);
}

export function ToastHost() {
  const items = useToasts(s => s.items);
  const {c, dark} = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View pointerEvents="none" style={{position: 'absolute', top: insets.top + 8, left: 16, right: 16, gap: 8}}>
      {items.map(t => {
        const color = t.kind === 'error' ? c.danger : t.kind === 'success' || t.kind === 'credit' ? c.success : c.primary;
        const icon = t.kind === 'error' ? 'alert-circle' : t.kind === 'credit' ? 'arrow-bottom-left-thick' : t.kind === 'success' ? 'check-circle' : 'information';
        return (
          <Animated.View key={t.id} entering={FadeInUp.springify().damping(16)} exiting={FadeOutUp.duration(200)} layout={LinearTransition.springify()}
            style={{flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 18, backgroundColor: dark ? '#1F2440' : '#FFFFFF', borderWidth: 1, borderColor: color + '55', elevation: 8, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 16, shadowOffset: {width: 0, height: 8}}}>
            <View style={{width: 34, height: 34, borderRadius: 17, backgroundColor: color + '22', alignItems: 'center', justifyContent: 'center'}}>
              <Icon name={icon} size={20} color={color} />
            </View>
            <View style={{flex: 1}}>
              <T v="body" style={{fontWeight: '700'}}>{t.text}</T>
              {t.sub ? <T v="small" dim numberOfLines={2}>{t.sub}</T> : null}
            </View>
          </Animated.View>
        );
      })}
    </View>
  );
}

export function useToastOnMount(text?: string) {
  useEffect(() => {
    if (text) toast(text);
  }, [text]);
}
