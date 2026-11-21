import {MMKV} from 'react-native-mmkv';

export const storage = new MMKV({id: 'smart-soundbox'});

export function readJSON<T>(key: string, fallback: T): T {
  try {
    const s = storage.getString(key);
    return s ? (JSON.parse(s) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJSON(key: string, value: unknown) {
  storage.set(key, JSON.stringify(value));
}

/** Coalesces bursts of writes (e.g. a flood of notifications) into one disk write. */
export function debouncedWriter(key: string, delay = 250) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: unknown;
  const flush = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    writeJSON(key, pending);
  };
  return {
    write(value: unknown) {
      pending = value;
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, delay);
    },
    flush() {
      if (timer) flush();
    },
  };
}

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
