import {AppState, PermissionsAndroid, Platform} from 'react-native';
import {Soundbox} from '../native/Soundbox';
import {data, flushStores} from '../store/data';
import {getSettings, useSettings} from '../store/settings';
import {whenIdle} from './announcer';
import {processEvents} from './processor';
import {SOURCES} from './sources';
import {langTag} from '../voice/presets';
import type {RawEvent} from './types';

export function watchedPackages() {
  const s = getSettings();
  return SOURCES.filter(src => s.sources[src.id]).flatMap(src => src.packages);
}

export async function syncNativeConfig() {
  const s = getSettings();
  await Soundbox.setConfig(s.active, watchedPackages(), s.captureUnknownApps, s.sources.sms !== false, s.smsVerify);
}

export async function drainNow() {
  const events: RawEvent[] = await Soundbox.drainEvents();
  if (events.length) await processEvents(events);
  return events.length;
}

/** Headless entry point invoked by the native listener (index.js registers it). */
export async function headlessTask() {
  try {
    await drainNow();
    await whenIdle();
  } finally {
    flushStores();
  }
}

let started = false;

export function startService() {
  if (started) return;
  started = true;
  void Soundbox.ttsInit(getSettings().voice.engine);
  void syncNativeConfig();
  void syncKeepAlive();
  warmVoice();
  // Access granted but the system never re-bound the listener (common after an update or an OEM
  // background kill)? Force it while the app is open, so alerts start flowing without user action.
  setTimeout(async () => {
    const st = await Soundbox.getStatus().catch(() => null);
    if (st?.notificationAccess && !st.listenerConnected) await Soundbox.forceRebind();
  }, 3000);
  void drainNow();
  const s = getSettings();
  if (s.retentionDays) data().pruneOlderThan(s.retentionDays);
  // A process killed mid-announcement leaves items "queued". Don't replay stale payments aloud
  // minutes later — mark them so they show up as not announced (they can be re-announced by hand).
  const stale = Date.now() - 2 * 60 * 1000;
  data()
    .txns.filter(t => t.announce.status === 'queued' && t.updatedAt < stale)
    .forEach(t => data().updateTxn(t.id, {announce: {...t.announce, status: 'failed', reason: 'Interrupted before it could be spoken'}}));

  AppState.addEventListener('change', st => {
    if (st === 'active') void drainNow();
  });
  // Keep the native filter in sync with source / on-off changes.
  useSettings.subscribe((cur, prev) => {
    if (cur.sources !== prev.sources || cur.active !== prev.active || cur.captureUnknownApps !== prev.captureUnknownApps || cur.smsVerify !== prev.smsVerify) {
      void syncNativeConfig();
    }
    if (cur.active !== prev.active || cur.keepAlive !== prev.keepAlive) void syncKeepAlive();
    if (cur.language !== prev.language || cur.voice.voiceByLang !== prev.voice.voiceByLang) warmVoice();
  });
}

/**
 * Runs the foreground "Live" service while the soundbox is on. Android 13+ needs the notification
 * permission for its status notification to be visible (the service works either way).
 */
export async function syncKeepAlive() {
  const s = getSettings();
  const on = s.active && s.keepAlive;
  if (on && Platform.OS === 'android' && Number(Platform.Version) >= 33) {
    const perm = PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS;
    if (perm && !(await PermissionsAndroid.check(perm))) await PermissionsAndroid.request(perm).catch(() => null);
  }
  await Soundbox.setKeepAlive(on);
}

/** Keeps the announcement voice loaded in the speech engine, so speaking starts instantly. */
function warmVoice() {
  const s = getSettings();
  void Soundbox.warmVoice(langTag(s.language), s.voice.voiceByLang[s.language] ?? null);
}
