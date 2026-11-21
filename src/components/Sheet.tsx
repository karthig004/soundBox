import React, {useEffect, useState} from 'react';
import {Dimensions, Modal, Pressable, ScrollView, StyleSheet, View} from 'react-native';
import {Gesture, GestureDetector, GestureHandlerRootView} from 'react-native-gesture-handler';
import Animated, {Easing, runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming} from 'react-native-reanimated';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useTheme} from '../theme';
import {T} from './ui';

const H = Dimensions.get('window').height;

/** Bottom sheet with spring entrance, backdrop fade and drag-to-dismiss. */
export function Sheet({visible, onClose, title, children, maxHeight = 0.86}: {visible: boolean; onClose: () => void; title?: string; children: React.ReactNode; maxHeight?: number}) {
  const {c, radius} = useTheme();
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(visible);
  const y = useSharedValue(H);
  const fade = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      y.value = withSpring(0, {damping: 22, stiffness: 220, mass: 0.9});
      fade.value = withTiming(1, {duration: 220});
    } else if (mounted) {
      fade.value = withTiming(0, {duration: 180});
      y.value = withTiming(H, {duration: 240, easing: Easing.in(Easing.cubic)}, done => {
        if (done) runOnJS(setMounted)(false);
      });
    }
  }, [visible, mounted, y, fade]);

  const drag = Gesture.Pan()
    .onUpdate(e => {
      y.value = Math.max(0, e.translationY);
    })
    .onEnd(e => {
      if (e.translationY > 120 || e.velocityY > 900) runOnJS(onClose)();
      else y.value = withSpring(0, {damping: 20, stiffness: 240});
    });

  const sheet = useAnimatedStyle(() => ({transform: [{translateY: y.value}]}));
  const backdrop = useAnimatedStyle(() => ({opacity: fade.value}));

  if (!mounted) return null;
  return (
    <Modal transparent visible statusBarTranslucent animationType="none" onRequestClose={onClose}>
      <GestureHandlerRootView style={{flex: 1}}>
        <Animated.View style={[StyleSheet.absoluteFill, {backgroundColor: c.overlay}, backdrop]}>
          <Pressable style={{flex: 1}} onPress={onClose} />
        </Animated.View>
        <Animated.View style={[{position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: H * maxHeight, backgroundColor: c.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingBottom: insets.bottom + 12}, sheet]}>
          <GestureDetector gesture={drag}>
            <View style={{paddingTop: 10, paddingBottom: 6, alignItems: 'center'}}>
              <View style={{width: 44, height: 5, borderRadius: 3, backgroundColor: c.border}} />
              {title ? (
                <T v="h3" style={{marginTop: 12, alignSelf: 'flex-start', marginHorizontal: 20}}>
                  {title}
                </T>
              ) : null}
            </View>
          </GestureDetector>
          <ScrollView contentContainerStyle={{paddingHorizontal: 20, paddingTop: 8}} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
}
