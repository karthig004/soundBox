import React, {useEffect, useMemo, useState} from 'react';
import {Alert, Share, View} from 'react-native';
import Animated, {FadeInDown, LinearTransition, ZoomIn} from 'react-native-reanimated';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Field} from '../components/AccountForm';
import {Donut, Meter} from '../components/charts';
import {AnimatedAmount, Orbs, Pulse} from '../components/motion';
import {APP_VERSION, AppIcon, Wordmark} from '../components/Brand';
import {Screen} from '../components/Screen';
import {Sheet} from '../components/Sheet';
import {toast} from '../components/Toast';
import {Badge, Button, Card, Chip, Gradient, Group, Icon, IconBtn, Row, Segmented, T, Tap, Toggle, useGridCell} from '../components/ui';
import {preview} from '../engine/announcer';
import {processEvent} from '../engine/processor';
import {drainNow} from '../engine/service';
import {buildAnnouncement, DEFAULT_TEMPLATES, TemplateKey, TOKENS} from '../engine/templates';
import type {DiagEntry, Txn} from '../engine/types';
import {useNativeStatus} from '../hooks/useNativeStatus';
import {DropEntry, Soundbox} from '../native/Soundbox';
import {useData, wipeAllLocalData} from '../store/data';
import {useSettings} from '../store/settings';
import {ACCOUNT_PALETTE, BRAND, SCHEMES, useTheme} from '../theme';
import {exportXlsx} from '../utils/exporter';
import {fmtDateLong, fmtTime, groupIN, money, periodRange, relTime} from '../utils/format';
import {groupBy, inRange, needsReview, summarize} from '../utils/stats';

// ---------------------------------------------------------------- Announcement rules

const KEY_LABEL: Record<TemplateKey, string> = {credit: 'Money received', debit: 'Money sent', refund: 'Refund', reversal: 'Reversal'};

function TimeStepper({label, value, onChange}: {label: string; value: string; onChange: (v: string) => void}) {
  const {c, radius} = useTheme();
  const [h, m] = value.split(':').map(Number);
  const step = (d: number) => {
    const t = (h * 60 + m + d + 1440) % 1440;
    onChange(`${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`);
  };
  return (
    <View style={{flex: 1}}>
      <T v="tiny" mute style={{marginBottom: 6}}>{label}</T>
      <View style={{flexDirection: 'row', alignItems: 'center', backgroundColor: c.cardAlt, borderRadius: radius.md}}>
        <IconBtn name="minus" bg="transparent" onPress={() => step(-30)} />
        <T v="h3" style={{flex: 1, textAlign: 'center', fontVariant: ['tabular-nums']}}>{value}</T>
        <IconBtn name="plus" bg="transparent" onPress={() => step(30)} />
      </View>
    </View>
  );
}

export function AnnouncementsScreen() {
  const {c} = useTheme();
  const s = useSettings();
  const a = s.announce;
  const [editing, setEditing] = useState<TemplateKey>('credit');
  const tpl = a.custom[editing] ?? DEFAULT_TEMPLATES[s.language][editing];
  const sample: Txn = {id: 'x', amount: 1250, direction: editing === 'debit' ? 'debit' : 'credit', kind: editing === 'refund' ? 'refund' : editing === 'reversal' ? 'reversal' : 'payment', status: 'success', category: 'received', confidence: 'high', sender: 'Ramesh', beneficiary: 'Kumar Traders', bank: 'HDFC Bank', timestamp: Date.now(), source: {id: 'gpay', name: 'GPay', category: 'upi'}, announce: {status: 'none', count: 0}, createdAt: 0, updatedAt: 0};
  const previewText = buildAnnouncement(sample, {lang: s.language, style: a.style, amountMode: a.amountMode, includeSender: a.includeSender, includeBank: a.includeBank, custom: a.custom, businessName: s.businessName});

  return (
    <Screen title="Announcement rules" subtitle="What gets spoken, and how" back>
      <Group title="Announce">
        <Row icon="arrow-bottom-left" iconColor={c.success} title="Money received" right={<Toggle value={a.credit} onChange={credit => s.setAnnounce({credit})} />} />
        <Row icon="arrow-top-right" iconColor={c.danger} title="Money sent" right={<Toggle value={a.debit} onChange={debit => s.setAnnounce({debit})} />} />
        <Row icon="cash-refund" iconColor={c.info} title="Refunds" right={<Toggle value={a.refund} onChange={refund => s.setAnnounce({refund})} />} />
        <Row icon="undo-variant" title="Reversals" right={<Toggle value={a.reversal} onChange={reversal => s.setAnnounce({reversal})} />} last />
      </Group>

      <Group title="Include in voice">
        <Row icon="account-outline" title="Sender / beneficiary name" subtitle="When available in the alert" right={<Toggle value={a.includeSender} onChange={includeSender => s.setAnnounce({includeSender})} />} />
        <Row icon="bank-outline" title="Bank name" right={<Toggle value={a.includeBank} onChange={includeBank => s.setAnnounce({includeBank})} />} last />
      </Group>

      <T v="tiny" mute style={{marginBottom: 8, marginLeft: 4, textTransform: 'uppercase'}}>Template</T>
      <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12}}>
        {([['amount', 'Amount only'], ['amount_sender', 'Amount + sender'], ['amount_bank', 'Amount + bank'], ['full', 'Full'], ['custom', 'Custom']] as const).map(([id, l]) => (
          <Chip key={id} label={l} active={a.style === id} onPress={() => s.setAnnounce({style: id})} />
        ))}
      </View>

      {a.style === 'custom' && (
        <Animated.View entering={FadeInDown.springify()}>
          <Card style={{marginBottom: 12}}>
            <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12}}>
              {(Object.keys(KEY_LABEL) as TemplateKey[]).map(k => <Chip key={k} label={KEY_LABEL[k]} active={editing === k} onPress={() => setEditing(k)} />)}
            </View>
            <Field label={`${KEY_LABEL[editing]} template`} value={tpl} onChangeText={v => s.setAnnounce({custom: {...a.custom, [editing]: v}})} multiline style={{height: 90, textAlignVertical: 'top', paddingTop: 12}} />
            <T v="tiny" mute style={{marginBottom: 8}}>TAP TO INSERT · wrap optional parts in [ ] so they vanish when missing</T>
            <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 6}}>
              {TOKENS.map(tk => <Chip key={tk} label={`{${tk}}`} onPress={() => s.setAnnounce({custom: {...a.custom, [editing]: `${tpl} {${tk}}`.trim()}})} />)}
              <Chip label="Reset" icon="restore" onPress={() => { const cu = {...a.custom}; delete cu[editing]; s.setAnnounce({custom: cu}); }} />
            </View>
          </Card>
        </Animated.View>
      )}
      <Card style={{marginBottom: 22, flexDirection: 'row', alignItems: 'center', gap: 12}}>
        <View style={{flex: 1}}>
          <T v="tiny" mute>PREVIEW</T>
          <T v="body" style={{marginTop: 4, fontWeight: '600'}}>“{previewText}”</T>
        </View>
        <IconBtn name="play" onPress={() => preview(previewText, s.language).catch(() => {})} />
      </Card>

      <Group title="Safety" footer="Pending and failed alerts are never announced as successful payments.">
        <Row icon="help-circle-outline" title="Announce low-confidence alerts" subtitle="Speaks a generic “please check” message" right={<Toggle value={a.lowConfidence} onChange={lowConfidence => s.setAnnounce({lowConfidence})} />} />
        <Row icon="bank-off-outline" title="Announce when account is unknown" subtitle="Payments not matched to one of your accounts" right={<Toggle value={a.unassigned} onChange={unassigned => s.setAnnounce({unassigned})} />} />
        <View style={{padding: 14}}>
          <Field label="Only announce amounts of at least (₹)" value={String(a.minAmount || '')} onChangeText={v => s.setAnnounce({minAmount: parseFloat(v) || 0})} keyboardType="numeric" placeholder="0" />
        </View>
      </Group>

      <Group title="Quiet hours">
        <Row icon="weather-night" title="Silence announcements at night" subtitle="Payments are still recorded" right={<Toggle value={s.quiet.enabled} onChange={enabled => s.set({quiet: {...s.quiet, enabled}})} />} last={!s.quiet.enabled} />
        {s.quiet.enabled && (
          <View style={{flexDirection: 'row', gap: 12, padding: 14}}>
            <TimeStepper label="From" value={s.quiet.start} onChange={start => s.set({quiet: {...s.quiet, start}})} />
            <TimeStepper label="To" value={s.quiet.end} onChange={end => s.set({quiet: {...s.quiet, end}})} />
          </View>
        )}
      </Group>
    </Screen>
  );
}

// ---------------------------------------------------------------- Appearance

export function AppearanceScreen() {
  const cell = useGridCell(3, 12);
  const {c, radius} = useTheme();
  const s = useSettings();
  return (
    <Screen title="Appearance" subtitle="Colours, theme & formats" back>
      <T v="tiny" mute style={{marginBottom: 8, marginLeft: 4, textTransform: 'uppercase'}}>Theme</T>
      <Segmented value={s.theme} onChange={theme => s.set({theme})} options={[{id: 'system', label: 'System', icon: 'theme-light-dark'}, {id: 'light', label: 'Light', icon: 'white-balance-sunny'}, {id: 'dark', label: 'Dark', icon: 'weather-night'}]} />
      <T v="tiny" mute style={{marginTop: 24, marginBottom: 10, marginLeft: 4, textTransform: 'uppercase'}}>Colour scheme</T>
      <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 12}}>
        {SCHEMES.map((sc, i) => {
          const on = s.scheme === sc.id;
          return (
            <Animated.View key={sc.id} entering={FadeInDown.delay(i * 40).springify()} style={{width: cell}}>
              <Tap onPress={() => s.set({scheme: sc.id})} style={{borderRadius: radius.lg, padding: 3, borderWidth: 2.5, borderColor: on ? c.text : 'transparent'}}>
                <Gradient colors={sc.gradient} style={{height: 88, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center'}}>
                  {on && (
                    <Animated.View entering={ZoomIn.springify()}>
                      <Icon name="check-circle" size={30} color="#fff" />
                    </Animated.View>
                  )}
                </Gradient>
                <T v="small" style={{textAlign: 'center', marginTop: 6, fontWeight: '700'}}>{sc.name}</T>
              </Tap>
            </Animated.View>
          );
        })}
      </View>
      <Animated.View layout={LinearTransition.springify()} style={{marginTop: 24}}>
        <Gradient style={{borderRadius: 24, padding: 18, overflow: 'hidden'}}>
          <Orbs colors={['#fff', c.secondary]} />
          <T v="small" color="rgba(255,255,255,0.8)">Preview · Received today</T>
          <T v="h1" color="#fff" style={{fontSize: 36}}>₹12,450</T>
          <View style={{flexDirection: 'row', gap: 8, marginTop: 10}}>
            <Badge label="LIVE" color="#fff" icon="circle" />
            <Badge label="24 PAYMENTS" color="#fff" />
          </View>
        </Gradient>
      </Animated.View>
      <Group title="Formats" style={{marginTop: 24}}>
        <View style={{padding: 14, borderBottomWidth: 0.5, borderBottomColor: c.border}}>
          <T v="small" style={{fontWeight: '700', marginBottom: 8}}>Date format</T>
          <Segmented value={s.dateFormat} onChange={dateFormat => s.set({dateFormat})} options={[{id: 'DMY', label: 'DD/MM/YYYY'}, {id: 'MDY', label: 'MM/DD/YYYY'}, {id: 'YMD', label: 'YYYY-MM-DD'}]} />
        </View>
        <Row icon="clock-outline" title="24-hour time" right={<Toggle value={s.time24} onChange={time24 => s.set({time24})} />} last />
      </Group>
    </Screen>
  );
}

// ---------------------------------------------------------------- Privacy

const RETENTION = [
  {id: '0', label: 'Forever'},
  {id: '30', label: '30 d'},
  {id: '90', label: '90 d'},
  {id: '180', label: '6 mo'},
  {id: '365', label: '1 yr'},
];

export function PrivacyScreen() {
  const {c} = useTheme();
  const s = useSettings();
  const txns = useData(s2 => s2.txns);
  const accounts = useData(s2 => s2.accounts);
  const prune = useData(s2 => s2.pruneOlderThan);
  const clearDiag = useData(s2 => s2.clearDiag);

  const toggleLock = async (v: boolean) => {
    if (v) {
      if (!(await Soundbox.canAuthenticate())) return toast('Set a screen lock or fingerprint on your phone first', 'error');
      if (!(await Soundbox.authenticate('Enable app lock', 'Confirm it’s you'))) return;
    }
    s.set({appLock: v});
  };
  const setRetention = (id: string) => {
    const days = Number(id);
    s.set({retentionDays: days});
    if (days) {
      const n = prune(days);
      if (n) toast(`${n} older transactions removed`, 'info');
    }
  };
  const wipe = () =>
    Alert.alert('Delete all transactions?', 'History, reports and diagnostics on this phone will be permanently erased. Accounts and settings are kept.', [
      {text: 'Cancel', style: 'cancel'},
      {text: 'Delete everything', style: 'destructive', onPress: () => { wipeAllLocalData(); toast('All transaction data deleted', 'success'); }},
    ]);
  const exportAll = async () => {
    try {
      const r = periodRange('all');
      await exportXlsx({txns, accounts, from: txns.length ? txns[txns.length - 1].timestamp : r.from, to: Date.now(), label: 'Full history'});
    } catch (e: any) {
      toast('Export failed', 'error', e?.message);
    }
  };

  return (
    <Screen title="Privacy & security" subtitle="Your data stays on this phone" back>
      <Card style={{marginBottom: 22, gap: 10}}>
        {[
          ['cloud-off-outline', 'Fully offline — no transaction data is uploaded anywhere.'],
          ['key-remove', 'Never asks for bank passwords, PINs or OTPs.'],
          ['bell-check-outline', 'Only reads alerts from the payment apps you enabled.'],
          ['shield-alert-outline', 'Reads notifications — does not verify payments with the bank. Always confirm large amounts in your bank app.'],
        ].map(([icon, text]) => (
          <View key={icon} style={{flexDirection: 'row', gap: 12, alignItems: 'center'}}>
            <Icon name={icon} size={20} color={c.primary} />
            <T v="small" dim style={{flex: 1}}>{text}</T>
          </View>
        ))}
      </Card>
      <Group title="Security">
        <Row icon="fingerprint" title="App lock" subtitle="Fingerprint, face or screen lock to open" right={<Toggle value={s.appLock} onChange={toggleLock} />} last />
      </Group>
      <T v="tiny" mute style={{marginBottom: 8, marginLeft: 4, textTransform: 'uppercase'}}>Keep transactions for</T>
      <Segmented value={String(s.retentionDays)} onChange={setRetention} options={RETENTION} style={{marginBottom: 22}} />
      <Group title="Your data">
        <Row icon="microsoft-excel" title="Export everything" subtitle={`${txns.length} transactions to Excel`} onPress={exportAll} />
        <Row icon="key-variant" title="Permissions" subtitle="Manage notification access" onPress={() => Soundbox.openNotificationAccess()} />
        <Row icon="broom" title="Clear diagnostic log" onPress={() => { clearDiag(); toast('Diagnostic log cleared', 'success'); }} />
        <Row icon="delete-forever-outline" title="Delete all transactions" danger onPress={wipe} last />
      </Group>
    </Screen>
  );
}

// ---------------------------------------------------------------- Diagnostics

const DECISION_COLOR: Record<DiagEntry['decision'], string> = {
  new: '#10B981', announced: '#6366F1', duplicate: '#0EA5E9', updated: '#14B8A6', informational: '#94A3B8', unparsed: '#F59E0B', 'ignored-source': '#94A3B8', 'announce-skipped': '#F59E0B', 'announce-failed': '#EF4444', 'ignored-sender': '#94A3B8',
};

export function DiagnosticsScreen() {
  const {c} = useTheme();
  const {status, supported, refresh} = useNativeStatus(2500);
  const diag = useData(s => s.diag);
  const clear = useData(s => s.clearDiag);
  const [filter, setFilter] = useState<'all' | DiagEntry['decision']>('all');
  const counts = useMemo(() => diag.reduce<Record<string, number>>((m, d) => ((m[d.decision] = (m[d.decision] ?? 0) + 1), m), {}), [diag]);
  const shown = filter === 'all' ? diag : diag.filter(d => d.decision === filter);
  const lastAnnounced = diag.find(d => d.decision === 'announced');
  const [fixGuide, setFixGuide] = useState(false);
  const [fixing, setFixing] = useState(false);
  const fixListener = async () => {
    setFixing(true);
    toast('Reconnecting the listener…');
    await Soundbox.forceRebind();
    // The system re-binds asynchronously; give it a moment before checking.
    await new Promise(r => setTimeout(r, 3500));
    const st = await Soundbox.getStatus().catch(() => null);
    setFixing(false);
    refresh();
    if (st?.listenerConnected) toast('Listener connected', 'success');
    else setFixGuide(true);
  };
  const [drops, setDrops] = useState<DropEntry[]>([]);
  const [smsApp, setSmsApp] = useState<string | null>(null);
  useEffect(() => {
    const load = () => {
      Soundbox.getDropLog().then(setDrops).catch(() => {});
      Soundbox.getDefaultSmsPackage().then(setSmsApp).catch(() => {});
    };
    load();
    const id = setInterval(load, 3000);
    return () => clearInterval(id);
  }, []);

  const checks = supported
    ? [
        ['Notification access', !!status?.notificationAccess, () => Soundbox.openNotificationAccess()],
        ['Listener connected', !!status?.listenerConnected, () => fixListener()],
        ['Background allowed', !!status?.ignoringBatteryOptimizations, () => Soundbox.openBatterySettings()],
        ['Speech engine ready', !!status?.ttsReady, () => Soundbox.ttsInit().then(refresh)],
      ] as const
    : [];
  const healthy = checks.every(x => x[1]);

  return (
    <Screen title="Diagnostics" subtitle="Health of your soundbox" back right={<IconBtn name="refresh" onPress={() => { refresh(); drainNow(); }} />}>
      <Gradient colors={healthy ? ['#10B981', '#0EA5E9'] : ['#F59E0B', '#EF4444']} style={{borderRadius: 24, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 12}}>
        <Pulse color="#fff" active={healthy} />
        <View style={{flex: 1}}>
          <T v="h3" color="#fff">{supported ? (healthy ? 'Everything looks good' : 'Action needed') : 'Manual / import mode'}</T>
          <T v="small" color="rgba(255,255,255,0.85)">
            {status?.lastEventAt ? `Last alert ${relTime(status.lastEventAt)}` : 'No alerts received yet'}
            {lastAnnounced ? ` · last voice ${relTime(lastAnnounced.at)}` : ''}
          </T>
        </View>
      </Gradient>
      {checks.length > 0 && (
        <Group title="Checks" style={{marginTop: 18}}>
          {checks.map(([label, ok, fix], i) => (
            <Row key={label} icon={ok ? 'check-circle' : 'alert-circle'} iconColor={ok ? c.success : c.warning} title={label} subtitle={ok ? 'OK' : 'Tap to fix'} onPress={ok ? undefined : fix} last={i === checks.length - 1} />
          ))}
        </Group>
      )}
      {fixing && <T v="small" color={c.primary} style={{marginBottom: 12, marginLeft: 4}}>Reconnecting…</T>}
      <Sheet visible={fixGuide} onClose={() => setFixGuide(false)} title="Your phone is blocking the listener">
        <T v="small" dim style={{lineHeight: 20, marginBottom: 16}}>
          {status?.manufacturer ?? 'This phone'} stopped RubyAlert in the background and won't let it reconnect by itself. Do these once:
        </T>
        {[
          {n: 1, title: 'Turn notification access OFF, then ON', text: 'Find RubyAlert in the list, switch it off, then on again.', cta: 'Open notification access', go: () => Soundbox.openNotificationAccess()},
          {n: 2, title: 'Allow Autostart / background start', text: 'Lets the phone restart the listener after it is closed.', cta: 'Open Autostart settings', go: () => Soundbox.openAutostartSettings()},
          {n: 3, title: 'Remove battery restrictions', text: 'Set battery usage to “Unrestricted” / “No restrictions”.', cta: 'Open battery settings', go: () => Soundbox.openBatterySettings()},
          {n: 4, title: 'Lock the app in Recents', text: 'Open recent apps, long-press RubyAlert and tap the lock icon.', cta: undefined, go: undefined},
        ].map(s => (
          <View key={s.n} style={{flexDirection: 'row', gap: 12, marginBottom: 16}}>
            <View style={{width: 28, height: 28, borderRadius: 14, backgroundColor: c.primarySoft, alignItems: 'center', justifyContent: 'center'}}>
              <T v="small" color={c.primary} style={{fontWeight: '800'}}>{s.n}</T>
            </View>
            <View style={{flex: 1}}>
              <T v="body" style={{fontWeight: '700'}}>{s.title}</T>
              <T v="small" dim style={{marginTop: 2}}>{s.text}</T>
              {s.cta && <Button small kind="secondary" title={s.cta} icon="open-in-new" onPress={s.go} style={{alignSelf: 'flex-start', marginTop: 8}} />}
            </View>
          </View>
        ))}
        <Button title="Check again" icon="refresh" onPress={() => { setFixGuide(false); fixListener(); }} style={{marginBottom: 8}} />
        <T v="tiny" mute style={{textAlign: 'center', marginBottom: 8}}>Bank SMS still work with “Verify SMS sender” on. This only affects UPI app alerts.</T>
      </Sheet>
      <Group title="Device">
        <Row icon="cellphone" title={`${status?.manufacturer ?? '—'} ${status?.model ?? ''}`} subtitle={`Android SDK ${status?.sdk ?? '—'} · ${status?.buffered ?? 0} events waiting`} />
        <Row icon="volume-high" title="Test announcement" onPress={() => preview('RubyAlert test. One hundred rupees received.', 'en').catch(e => toast('Speech failed', 'error', e?.message))} last />
      </Group>
      {supported && (
        <Group title="SMS app" footer="Bank SMS alerts are read from whichever app is your phone's default for SMS, any brand.">
          <Row icon="message-text-outline" title={smsApp ?? 'Not detected'} subtitle="Default SMS app on this phone" last />
        </Group>
      )}
      {drops.length > 0 && (
        <>
          <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8}}>
            <T v="tiny" mute style={{marginLeft: 4, textTransform: 'uppercase'}}>Skipped by listener ({drops.length})</T>
            <Tap onPress={() => Soundbox.clearDropLog().then(() => setDrops([]))}><T v="small" color={c.primary} style={{fontWeight: '700'}}>Clear</T></Tap>
          </View>
          <Card padded={false} style={{marginBottom: 22}}>
            {drops.slice(0, 30).map((d, i) => (
              <View key={`${d.at}-${i}`} style={{padding: 12, borderBottomWidth: i < Math.min(drops.length, 30) - 1 ? 0.5 : 0, borderBottomColor: c.border}}>
                <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
                  <Badge label="skipped" color={c.warning} />
                  <T v="tiny" mute style={{flex: 1}} numberOfLines={1}>{d.pkg}</T>
                  <T v="tiny" mute>{fmtTime(d.at)}</T>
                </View>
                <T v="small" style={{marginTop: 6, fontWeight: '600'}} numberOfLines={2}>{d.title ? `${d.title} — ` : ''}{d.snippet}</T>
                <T v="tiny" color={c.warning} style={{marginTop: 3}}>{d.reason}</T>
              </View>
            ))}
          </Card>
        </>
      )}
      <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8}}>
        <T v="tiny" mute style={{marginLeft: 4, textTransform: 'uppercase'}}>Event log ({diag.length})</T>
        <Tap onPress={clear}><T v="small" color={c.primary} style={{fontWeight: '700'}}>Clear</T></Tap>
      </View>
      <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12}}>
        <Chip label="All" active={filter === 'all'} onPress={() => setFilter('all')} />
        {(Object.keys(counts) as DiagEntry['decision'][]).map(k => <Chip key={k} label={`${k} ${counts[k]}`} active={filter === k} color={DECISION_COLOR[k]} onPress={() => setFilter(k)} />)}
      </View>
      <Card padded={false}>
        {shown.slice(0, 120).map((d, i) => (
          <View key={d.id} style={{padding: 12, borderBottomWidth: i < Math.min(shown.length, 120) - 1 ? 0.5 : 0, borderBottomColor: c.border}}>
            <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
              <Badge label={d.decision} color={DECISION_COLOR[d.decision]} />
              <T v="tiny" mute style={{flex: 1}} numberOfLines={1}>{d.pkg}</T>
              <T v="tiny" mute>{fmtTime(d.at)}</T>
            </View>
            <T v="small" style={{marginTop: 6, fontWeight: '600'}} numberOfLines={2}>{d.snippet}</T>
            {d.detail ? <T v="tiny" mute style={{marginTop: 3}}>{d.detail}</T> : null}
          </View>
        ))}
        {!shown.length && <T v="small" mute style={{padding: 16}}>No events yet.</T>}
      </Card>
    </Screen>
  );
}

// ---------------------------------------------------------------- Daily closing / insights

export function DailyClosingScreen() {
  const {c} = useTheme();
  const txns = useData(s => s.txns);
  const accounts = useData(s => s.accounts);
  const mode = useSettings(s => s.mode);
  const businessName = useSettings(s => s.businessName);
  const [p, setP] = useState<'today' | 'month'>(mode === 'business' ? 'today' : 'month');
  const r = periodRange(p);
  const list = useMemo(() => inRange(txns, r.from, r.to), [txns, r.from, r.to]);
  const s = summarize(list);
  const banks = groupBy(list, t => ({key: t.accountId ?? t.bank ?? '?', label: accounts.find(a => a.id === t.accountId)?.displayName ?? t.bank ?? 'Unassigned'}));
  const cats = groupBy(list, t => (t.userCategory ? {key: t.userCategory, label: t.userCategory} : {key: 'none', label: 'Uncategorised'}));
  const review = list.filter(t => needsReview(t, accounts.length > 0)).length;

  const shareText = () => {
    const lines = [
      `${businessName || 'RubyAlert'} — ${p === 'today' ? 'Daily closing' : 'Monthly summary'}`,
      fmtDateLong(Date.now()),
      '',
      `Received: ${money(s.received)} (${s.creditCount})`,
      `Refunds: ${money(s.refunds)}`,
      `Sent: ${money(s.sent)} (${s.debitCount})`,
      `Net movement: ${money(s.net)}`,
      '',
      ...banks.map(b => `${b.label}: ${money(b.received)} in / ${money(b.sent)} out`),
      '',
      review ? `${review} transaction(s) need review.` : 'All transactions identified.',
      'Based on payment alerts recorded on this phone — not a bank statement.',
    ];
    Share.share({message: lines.join('\n')});
  };

  return (
    <Screen title={mode === 'business' ? 'Daily closing' : 'Insights'} subtitle={fmtDateLong(Date.now())} back>
      <Segmented value={p} onChange={setP} style={{marginBottom: 16}} options={[{id: 'today', label: 'Today'}, {id: 'month', label: 'This month'}]} />
      <Gradient style={{borderRadius: 28, padding: 22, overflow: 'hidden'}}>
        <Orbs colors={['#fff', c.secondary]} />
        <T v="small" color="rgba(255,255,255,0.85)">Total received</T>
        <AnimatedAmount value={s.received + s.refunds} style={{fontSize: 42, fontWeight: '900', color: '#fff'}} />
        <View style={{flexDirection: 'row', marginTop: 16, gap: 10}}>
          {[['Sent', money(s.sent)], ['Net', money(s.net)], ['Txns', String(s.count)]].map(([k, v]) => (
            <View key={k} style={{flex: 1, padding: 10, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.16)'}}>
              <T v="tiny" color="rgba(255,255,255,0.8)">{k}</T>
              <T v="body" color="#fff" style={{fontWeight: '800'}} numberOfLines={1}>{v}</T>
            </View>
          ))}
        </View>
      </Gradient>
      {review > 0 && (
        <Card style={{marginTop: 12, backgroundColor: c.warningSoft, flexDirection: 'row', gap: 10, alignItems: 'center'}}>
          <Icon name="alert-outline" color={c.warning} />
          <T v="small" style={{flex: 1}}>{review} transaction(s) need review before closing.</T>
        </Card>
      )}
      <Card style={{marginTop: 12}}>
        <T v="h3" style={{marginBottom: 12}}>Bank-wise collections</T>
        {banks.length ? banks.map((b, i) => (
          <View key={b.key} style={{marginBottom: 12}}>
            <View style={{flexDirection: 'row', marginBottom: 5}}>
              <T v="body" style={{flex: 1, fontWeight: '600'}}>{b.label}</T>
              <T v="body" style={{fontWeight: '800'}}>{money(b.received)}</T>
            </View>
            <Meter ratio={b.received / Math.max(1, banks[0].received)} color={ACCOUNT_PALETTE[i % ACCOUNT_PALETTE.length]} />
          </View>
        )) : <T v="small" mute>No collections yet.</T>}
      </Card>
      {cats.length > 1 || (cats[0] && cats[0].key !== 'none') ? (
        <Card style={{marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 16}}>
          <Donut size={110} stroke={14} segments={cats.slice(0, 6).map((x, i) => ({value: x.received + x.sent, color: ACCOUNT_PALETTE[i % ACCOUNT_PALETTE.length]}))} />
          <View style={{flex: 1, gap: 6}}>
            {cats.slice(0, 6).map((x, i) => (
              <View key={x.key} style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
                <View style={{width: 8, height: 8, borderRadius: 4, backgroundColor: ACCOUNT_PALETTE[i % ACCOUNT_PALETTE.length]}} />
                <T v="small" style={{flex: 1}} numberOfLines={1}>{x.label}</T>
                <T v="small" style={{fontWeight: '700'}}>₹{groupIN(x.received + x.sent, 0)}</T>
              </View>
            ))}
          </View>
        </Card>
      ) : null}
      <View style={{flexDirection: 'row', gap: 12, marginTop: 20}}>
        <Button title="Share" icon="share-variant" kind="secondary" onPress={shareText} style={{flex: 1}} />
        <Button title="Excel" icon="microsoft-excel" onPress={() => exportXlsx({txns: list, accounts, from: r.from, to: r.to, label: r.label, businessName}).catch(e => toast('Export failed', 'error', e?.message))} style={{flex: 1}} />
      </View>
      <T v="tiny" mute style={{textAlign: 'center', marginTop: 12, lineHeight: 16}}>
        These totals only cover payments seen in alerts. They are not your full sales or cash balance.
      </T>
    </Screen>
  );
}

// ---------------------------------------------------------------- Simulator

const GPAY = 'com.google.android.apps.nbu.paisa.user';
const SMS = 'com.google.android.apps.messaging';
const NAMES = ['Ramesh', 'Priya', 'Arun Kumar', 'Lakshmi', 'Suresh', 'Divya', 'Karthik', 'Meena'];
const rnd = (a: number, b: number) => Math.round(a + Math.random() * (b - a));
const ref = () => String(4e11 + Math.floor(Math.random() * 9e10));

const SCENARIOS: {id: string; title: string; icon: string; make: () => {pkg: string; title: string; text: string}[]}[] = [
  {id: 'gpay', title: 'Google Pay credit', icon: 'google', make: () => { const n = NAMES[rnd(0, 7)]; return [{pkg: GPAY, title: `${n} paid you ₹${rnd(20, 2500)}.00`, text: 'Paid to your bank account'}]; }},
  {id: 'phonepe', title: 'PhonePe credit', icon: 'cellphone-nfc', make: () => [{pkg: 'com.phonepe.app', title: `Received ₹${rnd(50, 900)} from ${NAMES[rnd(0, 7)].toUpperCase()}`, text: 'Credited to your account'}]},
  {id: 'hdfc', title: 'HDFC bank SMS credit', icon: 'message-text', make: () => [{pkg: SMS, title: 'AX-HDFCBK', text: `Money Received - INR ${rnd(500, 20000)}.00 in your HDFC Bank A/c xx1234 on today by A/c linked to VPA ${NAMES[rnd(0, 7)].split(' ')[0].toLowerCase()}@okaxis (UPI Ref No ${ref()}).`}]},
  {id: 'debit', title: 'SBI SMS debit', icon: 'arrow-top-right', make: () => [{pkg: SMS, title: 'AD-SBIUPI', text: `Dear UPI user A/C X5678 debited by ${rnd(100, 3000)}.0 on date trf to KUMAR TRADERS Refno ${ref()}. If not u? call 1800111109. -SBI`}]},
  {id: 'dup', title: 'Same payment from 2 apps', icon: 'content-duplicate', make: () => { const a = rnd(100, 999), r = ref(); return [{pkg: GPAY, title: `Anitha paid you ₹${a}.00`, text: `UPI transaction ID: ${r}`}, {pkg: SMS, title: 'JD-ICICIB', text: `Dear Customer, Acct XX9012 is credited with Rs ${a}.00 from Anitha. UPI:${r}-ICICI Bank`}]; }},
  {id: 'pending', title: 'Pending → success', icon: 'clock-check-outline', make: () => { const a = rnd(100, 999); return [{pkg: 'com.phonepe.app', title: 'Payment pending', text: `₹${a} from Vijay is pending`}, {pkg: 'com.phonepe.app', title: `Received ₹${a} from VIJAY`, text: 'Payment successful'}]; }},
  {id: 'refund', title: 'Refund', icon: 'cash-refund', make: () => [{pkg: 'net.one97.paytm', title: 'Refund received', text: `Refund of ₹${rnd(30, 400)} credited from Swiggy`}]},
  {id: 'otp', title: 'OTP (ignored)', icon: 'message-lock-outline', make: () => [{pkg: SMS, title: 'AX-HDFCBK', text: `${rnd(100000, 999999)} is your OTP for txn of Rs 500. Do not share.`}]},
  {id: 'unknown', title: 'Unclear alert', icon: 'help-circle-outline', make: () => [{pkg: GPAY, title: 'Transaction update', text: `Your transaction of ₹${rnd(50, 500)} was processed`}]},
];

export function SimulatorScreen() {
  const cell = useGridCell(2, 10);
  const {c, radius} = useTheme();
  const [log, setLog] = useState<{id: number; text: string; decision: string}[]>([]);
  const run = (sc: (typeof SCENARIOS)[number]) => {
    const evs = sc.make();
    evs.forEach((e, i) =>
      setTimeout(() => {
        const r = processEvent({id: `sim-${Date.now()}-${i}`, pkg: e.pkg, title: e.title, text: e.text, postTime: Date.now(), origin: 'simulated'});
        setLog(l => [{id: Date.now() + i, text: `${e.title} — ${e.text}`.slice(0, 120), decision: `${r.decision}${r.detail ? ` · ${r.detail}` : ''}`}, ...l].slice(0, 30));
      }, i * 1200),
    );
  };
  const burst = () => [0, 1, 2, 3, 4].forEach(i => setTimeout(() => run(SCENARIOS[i % 2]), i * 400));

  return (
    <Screen title="Try it out" subtitle="Simulated alerts go through the real recogniser, dedup & voice" back>
      <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 10}}>
        {SCENARIOS.map((sc, i) => (
          <Animated.View key={sc.id} entering={FadeInDown.delay(i * 40).springify()} style={{width: cell}}>
            <Tap onPress={() => run(sc)} style={{padding: 14, borderRadius: radius.lg, backgroundColor: c.card, borderWidth: 0.5, borderColor: c.border, minHeight: 92, justifyContent: 'space-between'}}>
              <Icon name={sc.icon} color={c.primary} size={26} />
              <T v="small" style={{fontWeight: '700', marginTop: 8}}>{sc.title}</T>
            </Tap>
          </Animated.View>
        ))}
      </View>
      <Button title="Rush hour: 5 payments at once" icon="lightning-bolt" onPress={burst} style={{marginTop: 16}} />
      <T v="tiny" mute style={{marginTop: 20, marginBottom: 8, marginLeft: 4, textTransform: 'uppercase'}}>Results</T>
      <Card padded={false}>
        {log.map((l, i) => (
          <View key={l.id} style={{padding: 12, borderBottomWidth: i < log.length - 1 ? 0.5 : 0, borderBottomColor: c.border}}>
            <T v="small" style={{fontWeight: '700'}} color={l.decision.startsWith('new') ? c.success : l.decision.startsWith('dup') ? c.info : c.warning}>{l.decision}</T>
            <T v="tiny" mute numberOfLines={2}>{l.text}</T>
          </View>
        ))}
        {!log.length && <T v="small" mute style={{padding: 16}}>Tap a scenario above.</T>}
      </Card>
      <T v="tiny" mute style={{textAlign: 'center', marginTop: 12}}>Simulated payments are saved like real ones — delete them from History when done.</T>
    </Screen>
  );
}

// ---------------------------------------------------------------- About

export function AboutScreen() {
  const {c} = useTheme();
  return (
    <Screen title="About" back>
      <Gradient colors={BRAND.gradient} style={{borderRadius: 28, padding: 24, alignItems: 'center', overflow: 'hidden'}}>
        <Orbs colors={['#ffffff', BRAND.rubyLight]} />
        <AppIcon size={92} />
        <Wordmark onDark height={34} style={{marginTop: 16}} />
        <T v="small" color="rgba(255,255,255,0.85)" style={{marginTop: 4}}>Version {APP_VERSION}</T>
        <T v="body" color="#fff" style={{marginTop: 14, textAlign: 'center', fontWeight: '600'}}>Simple to use. Fast to announce.{'\n'}Reliable to record. Private by design.</T>
      </Gradient>
      <Card style={{marginTop: 18, gap: 10}}>
        <T v="h3">Important</T>
        <T v="small" dim style={{lineHeight: 19}}>
          RubyAlert reads payment notifications made available by supported apps on this phone. Reading a notification is not the same as verifying a payment with your bank, and totals shown are not a bank balance. Always confirm important payments in your official banking app.
        </T>
        <T v="small" dim style={{lineHeight: 19}}>
          It cannot send money, never asks for bank credentials, and works without internet.
        </T>
      </Card>
      <View style={{flexDirection: 'row', justifyContent: 'center', marginTop: 16}}>
        <Icon name="heart" size={16} color={c.danger} />
        <T v="small" mute> Made for Indian shops & families</T>
      </View>
    </Screen>
  );
}

// ---------------------------------------------------------------- Lock

export function LockScreen({onUnlock}: {onUnlock: () => void}) {
  const insets = useSafeAreaInsets();
  const unlock = async () => {
    // If the phone's own screen lock was removed there is nothing to authenticate against.
    if (!(await Soundbox.canAuthenticate().catch(() => true))) return onUnlock();
    try {
      if (await Soundbox.authenticate('Unlock RubyAlert', 'Use fingerprint, face or screen lock')) onUnlock();
    } catch {
      // stay locked; user can tap Unlock again
    }
  };
  useEffect(() => {
    const t = setTimeout(unlock, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <View style={{position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100} as any}>
      <Gradient style={{flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: insets.bottom}}>
        <Orbs colors={['#fff', '#fff']} />
        <Animated.View entering={ZoomIn.springify()}>
          <AppIcon size={104} />
          <View style={{position: 'absolute', right: -8, bottom: -8, width: 38, height: 38, borderRadius: 19, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center'}}>
            <Icon name="lock" size={20} color={BRAND.ruby} />
          </View>
        </Animated.View>
        <T v="h2" color="#fff" style={{marginTop: 24}}>RubyAlert is locked</T>
        <T v="small" color="rgba(255,255,255,0.85)" style={{marginTop: 6}}>Announcements keep working in the background</T>
        <Tap onPress={unlock} style={{marginTop: 32, paddingHorizontal: 28, height: 52, borderRadius: 26, backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', gap: 10}}>
          <Icon name="fingerprint" size={24} color={BRAND.ruby} />
          <T v="h3" color={BRAND.ruby}>Unlock</T>
        </Tap>
      </Gradient>
    </View>
  );
}
