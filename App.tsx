import {DarkTheme, DefaultTheme, NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import React, {useEffect, useMemo, useRef, useState} from 'react';
import {AppState, StatusBar, View} from 'react-native';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {ToastHost, toast} from './src/components/Toast';
import {onNewTxn} from './src/engine/processor';
import {startService} from './src/engine/service';
import type {RootStack} from './src/navigation/types';
import {Tabs} from './src/navigation/Tabs';
import {LockScreen} from './src/screens/LockScreen';
import {screens} from './src/screens';
import {OnboardingScreen} from './src/screens/onboarding/OnboardingScreen';
import {useSettings} from './src/store/settings';
import {ThemeProvider, useTheme} from './src/theme';
import {effDirection, party} from './src/utils/stats';
import {money} from './src/utils/format';

const Stack = createNativeStackNavigator<RootStack>();

function Root() {
  const theme = useTheme();
  const onboarded = useSettings(s => s.onboarded);
  const appLock = useSettings(s => s.appLock);
  const [locked, setLocked] = useState(appLock);
  const bgAt = useRef(0);

  useEffect(() => {
    startService();
    return onNewTxn(t => {
      if (AppState.currentState !== 'active') return;
      const credit = effDirection(t) === 'credit';
      toast(`${credit ? 'Received' : 'Paid'} ${money(t.amount)}`, credit ? 'credit' : 'info', party(t) ?? t.source.name);
    });
  }, []);

  // Re-lock after 30s in background.
  useEffect(() => {
    const sub = AppState.addEventListener('change', st => {
      if (st === 'background') bgAt.current = Date.now();
      if (st === 'active' && appLock && bgAt.current && Date.now() - bgAt.current > 30000) setLocked(true);
    });
    return () => sub.remove();
  }, [appLock]);

  const navTheme = useMemo(() => {
    const base = theme.dark ? DarkTheme : DefaultTheme;
    return {...base, colors: {...base.colors, background: theme.c.bg, card: theme.c.bg, primary: theme.c.primary, text: theme.c.text, border: theme.c.border}};
  }, [theme]);

  return (
    <View style={{flex: 1, backgroundColor: theme.c.bg}}>
      <StatusBar translucent backgroundColor="transparent" barStyle={theme.dark ? 'light-content' : 'dark-content'} />
      <NavigationContainer theme={navTheme}>
        <Stack.Navigator screenOptions={{headerShown: false, animation: 'slide_from_right', contentStyle: {backgroundColor: theme.c.bg}}}>
          {!onboarded ? (
            <Stack.Screen name="Onboarding" component={OnboardingScreen} options={{animation: 'fade'}} />
          ) : (
            <>
              <Stack.Screen name="Main" component={Tabs} options={{animation: 'fade'}} />
              {screens.map(s => (
                <Stack.Screen key={s.name} name={s.name} component={s.component as any} options={s.options} />
              ))}
            </>
          )}
        </Stack.Navigator>
      </NavigationContainer>
      <ToastHost />
      {locked && appLock && <LockScreen onUnlock={() => setLocked(false)} />}
    </View>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{flex: 1}}>
      <SafeAreaProvider>
        <ThemeProvider>
          <Root />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
