import {useNavigation} from '@react-navigation/native';
import React from 'react';
import {RefreshControlProps, StyleProp, View, ViewStyle} from 'react-native';
import Animated, {interpolate, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, Extrapolation} from 'react-native-reanimated';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useTheme} from '../theme';
import {IconBtn, T} from './ui';

/**
 * Standard screen: large title that collapses into a compact bar on scroll.
 * Pass `back` for stack screens.
 */
export function Screen({title, subtitle, back, right, children, contentStyle, scroll = true, refreshControl, bottomInset = 0}: {
  title: string;
  subtitle?: string;
  back?: boolean;
  right?: React.ReactNode;
  children: React.ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  scroll?: boolean;
  refreshControl?: React.ReactElement<RefreshControlProps>;
  bottomInset?: number;
}) {
  const {c} = useTheme();
  const insets = useSafeAreaInsets();
  const nav = useNavigation();
  const y = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler(e => {
    y.value = e.contentOffset.y;
  });
  const bar = useAnimatedStyle(() => ({opacity: interpolate(y.value, [30, 70], [0, 1], Extrapolation.CLAMP)}));
  const big = useAnimatedStyle(() => ({
    opacity: interpolate(y.value, [0, 50], [1, 0], Extrapolation.CLAMP),
    transform: [{translateY: interpolate(y.value, [-100, 0, 80], [20, 0, -20], Extrapolation.CLAMP)}, {scale: interpolate(y.value, [-100, 0], [1.08, 1], Extrapolation.CLAMP)}],
  }));

  const header = (
    <View style={{paddingTop: insets.top, backgroundColor: 'transparent', position: 'absolute', left: 0, right: 0, top: 0, zIndex: 10}}>
      <View style={{height: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 8}}>
        {back ? <IconBtn name="arrow-left" onPress={() => nav.goBack()} bg="transparent" /> : <View style={{width: 4}} />}
        <Animated.View style={[{flex: 1}, bar]}>
          <T v="h3" numberOfLines={1}>
            {title}
          </T>
        </Animated.View>
        {right}
      </View>
    </View>
  );

  const titleBlock = (
    <Animated.View style={[{paddingHorizontal: 20, paddingBottom: 14}, big]}>
      <T v="h1">{title}</T>
      {subtitle ? (
        <T v="body" dim style={{marginTop: 4}}>
          {subtitle}
        </T>
      ) : null}
    </Animated.View>
  );

  return (
    <View style={{flex: 1, backgroundColor: c.bg}}>
      {scroll ? (
        <Animated.ScrollView
          onScroll={onScroll}
          scrollEventThrottle={16}
          refreshControl={refreshControl}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{paddingTop: insets.top + 52, paddingBottom: insets.bottom + 32 + bottomInset}}>
          {titleBlock}
          <View style={[{paddingHorizontal: 16}, contentStyle]}>{children}</View>
        </Animated.ScrollView>
      ) : (
        <View style={{flex: 1, paddingTop: insets.top + 52}}>
          {titleBlock}
          <View style={[{flex: 1}, contentStyle]}>{children}</View>
        </View>
      )}
      {header}
    </View>
  );
}
