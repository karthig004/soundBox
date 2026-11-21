import {useFocusEffect} from '@react-navigation/native';
import {useCallback, useEffect, useState} from 'react';
import {AppState, Platform} from 'react-native';
import {NativeStatus, Soundbox} from '../native/Soundbox';

/** Polls listener/permission status while the screen is focused and when the app returns to foreground. */
export function useNativeStatus(intervalMs = 4000) {
  const [status, setStatus] = useState<NativeStatus | null>(null);
  const refresh = useCallback(async () => {
    try {
      setStatus(await Soundbox.getStatus());
    } catch {
      setStatus(null);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
      const id = setInterval(refresh, intervalMs);
      return () => clearInterval(id);
    }, [refresh, intervalMs]),
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', s => s === 'active' && refresh());
    return () => sub.remove();
  }, [refresh]);

  const supported = Platform.OS === 'android';
  return {status, refresh, supported, granted: !!status?.notificationAccess};
}
