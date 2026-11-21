import React, {useEffect, useMemo, useState} from 'react';
import {View} from 'react-native';
import Animated, {FadeInDown, FadeOutLeft, LinearTransition} from 'react-native-reanimated';
import {Field} from '../components/AccountForm';
import {Screen} from '../components/Screen';
import {toast} from '../components/Toast';
import {TxRow} from '../components/TxRow';
import {Badge, Button, Card, Chip, Empty, Group, Icon, Row, Segmented, T, Tap, Toggle} from '../components/ui';
import {addManualTxn, processEvent, trustSender, untrustSender} from '../engine/processor';
import {BANK_HEADERS, BANK_STEMS, headerOf} from '../engine/senders';
import {SOURCES} from '../engine/sources';
import type {Txn} from '../engine/types';
import type {ScreenProps} from '../navigation/types';
import {Soundbox} from '../native/Soundbox';
import {useData} from '../store/data';
import {useSettings} from '../store/settings';
import {useTheme} from '../theme';
import {groupIN, relTime} from '../utils/format';
import {parseStatement, ImportReport} from '../utils/importer';
import {needsReview} from '../utils/stats';
import {PermissionCards, requestSmsPermission} from './onboarding/OnboardingScreen';
import {BUSINESS_CATEGORIES, PERSONAL_CATEGORIES} from './TxDetailScreen';

// ---------------------------------------------------------------- Sources

export function SourcesScreen() {
  const {c} = useTheme();
  const sources = useSettings(s => s.sources);
  const capture = useSettings(s => s.captureUnknownApps);
  const set = useSettings(s => s.set);
  const txns = useData(s => s.txns);
  const diag = useData(s => s.diag);
  const [installed, setInstalled] = useState<Record<string, boolean>>({});
  useEffect(() => {
    Soundbox.installedPackages(SOURCES.flatMap(s => s.packages)).then(setInstalled).catch(() => {});
  }, []);

  const health = useMemo(
    () =>
      Object.fromEntries(
        SOURCES.map(s => {
          const lastEvent = diag.find(d => s.packages.includes(d.pkg));
          const lastTxn = txns.find(t => t.source.id === s.id);
          return [s.id, {lastEvent: lastEvent?.at, lastTxn: lastTxn?.timestamp}];
        }),
      ),
    [diag, txns],
  );

  return (
    <Screen title="Payment sources" subtitle="Which apps’ alerts are read and announced" back>
      <PermissionCards />
      <T v="tiny" mute style={{marginTop: 24, marginBottom: 8, marginLeft: 4, textTransform: 'uppercase'}}>Supported apps</T>
      <Card padded={false}>
        {SOURCES.map((s, i) => {
          const inst = s.packages.some(p => installed[p]);
          const h = health[s.id];
          const on = !!sources[s.id];
          const state = !on ? ['Disabled', c.textMute] : !inst && s.category !== 'sms' ? ['Not installed', c.textMute] : h.lastTxn && Date.now() - h.lastTxn < 7 * 86400000 ? ['Healthy', c.success] : h.lastEvent ? ['Alerts seen, none recognised', c.warning] : ['Waiting for first alert', c.info];
          return (
            <Animated.View key={s.id} entering={FadeInDown.delay(i * 30)} style={{flexDirection: 'row', alignItems: 'center', padding: 14, gap: 14, borderBottomWidth: i < SOURCES.length - 1 ? 0.5 : 0, borderBottomColor: c.border}}>
              <View style={{width: 42, height: 42, borderRadius: 13, backgroundColor: s.color, alignItems: 'center', justifyContent: 'center'}}>
                <Icon name={s.icon} size={22} color="#fff" />
              </View>
              <View style={{flex: 1}}>
                <T v="body" style={{fontWeight: '700'}}>{s.name}</T>
                <View style={{flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3}}>
                  <Badge label={state[0] as string} color={state[1] as string} />
                </View>
                <T v="tiny" mute style={{marginTop: 4}}>
                  {h.lastEvent ? `Last alert ${relTime(h.lastEvent)}` : 'No alerts yet'}
                  {h.lastTxn ? ` · last payment ${relTime(h.lastTxn)}` : ''}
                </T>
              </View>
              <Toggle value={on} onChange={v => set({sources: {...sources, [s.id]: v}})} />
            </Animated.View>
          );
        })}
      </Card>
      <T v="small" mute style={{marginTop: 8, marginHorizontal: 4}}>
        Listing an app doesn’t guarantee every alert format is understood. Unrecognised alerts go to the Review queue.
      </T>
      <BankSenders />
      <Group title="Advanced" style={{marginTop: 22}}>
        <Row icon="radar" title="Capture other apps" subtitle="Also read money alerts from unlisted apps (they’re marked medium confidence)" right={<Toggle value={capture} onChange={captureUnknownApps => set({captureUnknownApps})} />} last />
      </Group>
    </Screen>
  );
}

/** Only SMS from these sender codes may raise a sound. */
function BankSenders() {
  const {c} = useTheme();
  const smsVerify = useSettings(s => s.smsVerify);
  const trusted = useSettings(s => s.trustedSenders);
  const set = useSettings(s => s.set);
  const txns = useData(s => s.txns);
  const [code, setCode] = useState('');
  const header = headerOf(code);
  // Codes that sent payment-looking SMS but aren't trusted yet — so the user can see what their bank really sends.
  const seen = useMemo(() => {
    const m = new Map<string, {count: number; likelyBank?: string; last: number}>();
    for (const t of txns) {
      if (t.senderTrust !== 'unverified' || !t.smsSender || t.irrelevant) continue;
      const e = m.get(t.smsSender) ?? {count: 0, last: 0, likelyBank: BANK_STEMS.find(([st]) => t.smsSender!.startsWith(st))?.[1]};
      e.count++;
      e.last = Math.max(e.last, t.timestamp);
      m.set(t.smsSender, e);
    }
    return [...m.entries()].sort((a, b) => b[1].last - a[1].last);
  }, [txns]);
  const ruleLabel = (h: string) =>
    h.length < 6
      ? `Every code starting with ${h} (${BANK_STEMS.find(([st]) => h.startsWith(st) || st.startsWith(h))?.[1] ?? 'your bank'})`
      : BANK_HEADERS[h] ?? BANK_STEMS.find(([st]) => h.startsWith(st))?.[1] ?? 'Trusted by you';

  const toggleVerify = async (v: boolean) => {
    if (v && !(await requestSmsPermission())) {
      toast('SMS permission needed to verify senders', 'error');
      return;
    }
    set({smsVerify: v});
  };
  const add = () => {
    if (!header) return toast('Enter the bank part of the code, e.g. TMB or TMBANK', 'error');
    trustSender(header);
    setCode('');
    toast(header.length < 6 ? `All ${header}… codes trusted` : `${header} trusted — its SMS will now be announced`, 'success');
  };

  return (
    <Group title="Bank SMS senders" style={{marginTop: 22}} footer={`Only SMS from a bank sender code make a sound. ${Object.keys(BANK_HEADERS).length} bank codes are built in (HDFCBK, SBIINB, ICICIB, AXISBK…). Personal SMS are always ignored.`}>
      <Row icon="message-lock-outline" title="Verify SMS sender" subtitle="Read the real sender code of each SMS (recommended)" right={<Toggle value={smsVerify} onChange={toggleVerify} />} />
      {trusted.map(h => (
        <Row key={h} icon="shield-check-outline" iconColor={c.success} title={h.length < 6 ? `${h}…` : h} subtitle={ruleLabel(h)} right={
          <Tap onPress={() => untrustSender(h)} style={{padding: 6}}><Icon name="close" size={20} color={c.textMute} /></Tap>
        } />
      ))}
      {seen.map(([h, e]) => (
        <Row key={`seen-${h}`} icon="message-alert-outline" iconColor={c.warning} title={h}
          subtitle={`${e.count} payment SMS held, no sound${e.likelyBank ? ` · looks like ${e.likelyBank}` : ''} · ${relTime(e.last)}`}
          right={<Button small title="Trust" onPress={() => { trustSender(h); toast(`${h} trusted`, 'success'); }} />} />
      ))}
      <View style={{padding: 14}}>
        <Field
          label="Add your bank's sender code"
          value={code}
          onChangeText={setCode}
          autoCapitalize="characters"
          placeholder="TMB   or   TMBANK   or   JM-TMBANK-S"
          hint={
            header
              ? header.length < 6
                ? `Trusts every code starting with ${header} (e.g. ${header}ANK, ${header}SMS) — the JM-/SL-/AD- prefix and -S/-T ending are ignored`
                : `Trusts ${header} — the JM-/SL-/AD- prefix and -S/-T ending are ignored`
              : 'Type the bank part only. The 2 letters before the dash change every time; ignore them.'
          }
        />
        <Button small title="Trust sender" icon="plus" onPress={add} disabled={!code.trim()} />
      </View>
    </Group>
  );
}

// ---------------------------------------------------------------- Review queue

export function UnknownScreen({navigation}: ScreenProps<'Unknown'>) {
  const txns = useData(s => s.txns);
  const accounts = useData(s => s.accounts);
  const update = useData(s => s.updateTxn);
  const list = useMemo(() => txns.filter(t => needsReview(t, accounts.length > 0)), [txns, accounts.length]);
  const [tab, setTab] = useState<'all' | 'unknown' | 'unassigned' | 'flagged'>('all');
  const shown = list.filter(t => (tab === 'unknown' ? t.category === 'unknown' : tab === 'unassigned' ? !t.accountId && t.category !== 'unknown' : tab === 'flagged' ? t.review : true));

  return (
    <Screen title="Review queue" subtitle="Nothing is ever silently dropped" back>
      <Segmented value={tab} onChange={setTab} style={{marginBottom: 16}} options={[{id: 'all', label: `All ${list.length}`}, {id: 'unknown', label: 'Unknown'}, {id: 'unassigned', label: 'No account'}, {id: 'flagged', label: 'Flagged'}]} />
      {shown.length === 0 ? (
        <Empty icon="check-decagram" title="All clear" subtitle="Every transaction is identified and matched." />
      ) : (
        shown.map(t => (
          <Animated.View key={t.id} entering={FadeInDown} exiting={FadeOutLeft} layout={LinearTransition.springify()}>
            <Card style={{marginBottom: 12}}>
              <TxRow t={t} onPress={() => navigation.navigate('TxDetail', {id: t.id})} compact />
              <T v="small" dim style={{marginBottom: 10}}>{t.unknownReason ?? (t.review ? 'Flagged by you' : 'Account not identified')}</T>
              {!!t.raw?.text && (
                <T v="tiny" mute numberOfLines={2} style={{marginBottom: 10}}>“{t.raw.text}”</T>
              )}
              {accounts.length > 0 && t.category !== 'unknown' && !t.accountId && (
                <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10}}>
                  {accounts.map(a => (
                    <Chip key={a.id} label={a.displayName} icon="bank-outline" onPress={() => { update(t.id, {accountId: a.id, corrections: {...t.corrections, accountId: a.id}, unknownReason: undefined}); toast(`Assigned to ${a.displayName}`, 'success'); }} />
                  ))}
                </View>
              )}
              {t.senderTrust === 'unverified' && t.smsSender && (
                <Button small title={`Trust ${t.smsSender} as my bank`} icon="shield-check" style={{marginBottom: 10}}
                  onPress={() => { trustSender(t.smsSender!); toast(`${t.smsSender} trusted — future SMS will be announced`, 'success'); }} />
              )}
              <View style={{flexDirection: 'row', gap: 8}}>
                <Button small kind="secondary" title="Not relevant" icon="cancel" onPress={() => update(t.id, {irrelevant: true, excluded: true})} style={{flex: 1}} />
                <Button small kind="secondary" title={t.excluded ? 'Include' : 'Exclude'} icon={t.excluded ? 'eye' : 'eye-off'} onPress={() => update(t.id, {excluded: !t.excluded})} style={{flex: 1}} />
                {t.review && <Button small kind="secondary" title="Done" icon="check" onPress={() => update(t.id, {review: false})} style={{flex: 1}} />}
              </View>
            </Card>
          </Animated.View>
        ))
      )}
    </Screen>
  );
}

// ---------------------------------------------------------------- Manual entry

export function ManualEntryScreen({navigation}: ScreenProps<'ManualEntry'>) {
  const {c} = useTheme();
  const accounts = useData(s => s.accounts);
  const mode = useSettings(s => s.mode);
  const [dir, setDir] = useState<'credit' | 'debit'>('credit');
  const [kind, setKind] = useState<Txn['kind']>('payment');
  const [amount, setAmount] = useState('');
  const [partyName, setParty] = useState('');
  const [ref, setRef] = useState('');
  const [acc, setAcc] = useState<string | undefined>(accounts.find(a => a.isDefault)?.id);
  const [cat, setCat] = useState<string | undefined>();
  const [notes, setNotes] = useState('');
  const [announce, setAnnounce] = useState(true);
  const [paste, setPaste] = useState('');
  const value = parseFloat(amount.replace(/,/g, ''));

  const save = () => {
    addManualTxn({amount: value, direction: kind === 'payment' ? dir : 'credit', kind, party: partyName.trim() || undefined, accountId: acc, reference: ref.trim() || undefined, notes: notes.trim() || undefined, category: cat, announce});
    toast('Transaction added', 'success');
    navigation.goBack();
  };

  // "Share / paste" path (useful on iOS): run a pasted alert through the same recogniser.
  const parsePaste = () => {
    const r = processEvent({id: String(Date.now()), pkg: 'share', title: '', text: paste, postTime: Date.now(), origin: 'share'});
    if (r.decision === 'new') {
      toast('Payment recognised from text', 'success');
      navigation.goBack();
    } else toast(r.decision === 'duplicate' ? 'Already recorded' : 'Could not recognise a payment', 'error', r.detail);
  };

  return (
    <Screen title="Add transaction" subtitle="Recorded as manual entry, not a live alert" back>
      <Segmented value={dir} onChange={setDir} style={{marginBottom: 16}} options={[{id: 'credit', label: 'Money in', icon: 'arrow-bottom-left'}, {id: 'debit', label: 'Money out', icon: 'arrow-top-right'}]} />
      <Card style={{alignItems: 'center', paddingVertical: 22, marginBottom: 16}}>
        <T v="tiny" mute>AMOUNT</T>
        <View style={{flexDirection: 'row', alignItems: 'center'}}>
          <T v="h1" color={dir === 'credit' ? c.success : c.danger} style={{fontSize: 40}}>₹</T>
          <Field label="" value={amount} onChangeText={v => setAmount(v.replace(/[^\d.]/g, ''))} keyboardType="decimal-pad" placeholder="0" style={{fontSize: 40, fontWeight: '900', height: 64, minWidth: 160, backgroundColor: 'transparent', borderWidth: 0, textAlign: 'center', color: dir === 'credit' ? c.success : c.danger}} />
        </View>
        {value > 0 ? <T v="small" mute>₹{groupIN(value)}</T> : null}
      </Card>
      {dir === 'credit' && (
        <View style={{flexDirection: 'row', gap: 8, marginBottom: 16}}>
          {(['payment', 'refund', 'reversal'] as const).map(k => <Chip key={k} label={k[0].toUpperCase() + k.slice(1)} active={kind === k} onPress={() => setKind(k)} />)}
        </View>
      )}
      <Field label={dir === 'credit' ? 'From (sender)' : 'To (beneficiary)'} value={partyName} onChangeText={setParty} placeholder="Name" />
      <Field label="Reference / UTR (optional)" value={ref} onChangeText={setRef} autoCapitalize="characters" />
      {accounts.length > 0 && (
        <>
          <T v="tiny" mute style={{marginBottom: 8, textTransform: 'uppercase'}}>Account</T>
          <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16}}>
            {accounts.map(a => <Chip key={a.id} label={a.displayName} active={acc === a.id} onPress={() => setAcc(a.id)} />)}
          </View>
        </>
      )}
      <T v="tiny" mute style={{marginBottom: 8, textTransform: 'uppercase'}}>Category</T>
      <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16}}>
        {(mode === 'business' ? BUSINESS_CATEGORIES : PERSONAL_CATEGORIES).map(x => <Chip key={x} label={x} active={cat === x} onPress={() => setCat(cat === x ? undefined : x)} />)}
      </View>
      <Field label="Notes" value={notes} onChangeText={setNotes} />
      <Card padded={false} style={{marginBottom: 16}}>
        <Row icon="volume-high" title="Announce after saving" right={<Toggle value={announce} onChange={setAnnounce} />} last />
      </Card>
      <Button title="Save transaction" icon="check" onPress={save} disabled={!(value > 0)} />

      <Group title="Or paste a payment message" style={{marginTop: 28}}>
        <View style={{padding: 14}}>
          <Field label="Alert / SMS text" value={paste} onChangeText={setPaste} multiline placeholder="e.g. Rs.500 credited to A/c XX1234 by RAMESH UPI Ref 4123…" style={{height: 100, textAlignVertical: 'top', paddingTop: 12}} />
          <Button small title="Recognise & add" icon="text-recognition" onPress={parsePaste} disabled={paste.trim().length < 8} />
        </View>
      </Group>
    </Screen>
  );
}

// ---------------------------------------------------------------- Import

export function ImportScreen({navigation}: ScreenProps<'Import'>) {
  const {c} = useTheme();
  const txns = useData(s => s.txns);
  const accounts = useData(s => s.accounts);
  const addMany = useData(s => s.addMany);
  const [acc, setAcc] = useState<string | undefined>();
  const [report, setReport] = useState<(ImportReport & {name: string}) | null>(null);
  const [busy, setBusy] = useState(false);

  const pick = async () => {
    setBusy(true);
    try {
      const f = await Soundbox.pickTextFile();
      if (!f) return;
      const r = parseStatement(f.content, txns, accounts.find(a => a.id === acc));
      setReport({...r, name: f.name});
    } catch (e: any) {
      toast('Could not read file', 'error', e?.message);
    } finally {
      setBusy(false);
    }
  };
  const confirm = () => {
    if (!report) return;
    addMany(report.accepted);
    toast(`${report.accepted.length} transactions imported`, 'success');
    navigation.goBack();
  };

  return (
    <Screen title="Import statement" subtitle="Bring in older transactions from a CSV" back>
      <Card style={{gap: 10}}>
        <Icon name="file-delimited-outline" size={32} color={c.primary} />
        <T v="h3">Supported formats</T>
        <T v="small" dim style={{lineHeight: 19}}>
          CSV statements with a Date column plus either Debit/Credit (Withdrawal/Deposit) columns or an Amount with Dr/Cr type. RubyAlert CSV exports also work. Duplicates (same reference or same row) are skipped.
        </T>
      </Card>
      {accounts.length > 0 && (
        <>
          <T v="tiny" mute style={{marginTop: 20, marginBottom: 8, textTransform: 'uppercase'}}>Statement belongs to</T>
          <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8}}>
            <Chip label="Not sure" active={!acc} onPress={() => setAcc(undefined)} />
            {accounts.map(a => <Chip key={a.id} label={a.displayName} active={acc === a.id} onPress={() => setAcc(a.id)} />)}
          </View>
        </>
      )}
      <Button title="Choose CSV file" icon="folder-open-outline" onPress={pick} loading={busy} style={{marginTop: 20}} />
      {report && (
        <Animated.View entering={FadeInDown.springify()} style={{marginTop: 20}}>
          <Card>
            <T v="h3">{report.name}</T>
            <View style={{flexDirection: 'row', gap: 10, marginTop: 14}}>
              {[
                {l: 'Ready', v: report.accepted.length, col: c.success},
                {l: 'Duplicates', v: report.duplicates, col: c.info},
                {l: 'Rejected', v: report.rejected.length, col: c.danger},
              ].map(x => (
                <View key={x.l} style={{flex: 1, padding: 12, borderRadius: 14, backgroundColor: x.col + '18', alignItems: 'center'}}>
                  <T v="h2" color={x.col}>{x.v}</T>
                  <T v="tiny" mute>{x.l}</T>
                </View>
              ))}
            </View>
            {report.rejected.slice(0, 5).map(r => (
              <T key={r.row} v="small" mute style={{marginTop: 6}}>Row {r.row}: {r.reason}</T>
            ))}
            {report.accepted.slice(0, 4).map(t => <TxRow key={t.id} t={t} compact />)}
          </Card>
          <Button title={`Import ${report.accepted.length} transactions`} icon="check" onPress={confirm} disabled={!report.accepted.length} style={{marginTop: 14}} />
          <T v="tiny" mute style={{textAlign: 'center', marginTop: 8}}>Imported records are labelled as imported and never announced.</T>
        </Animated.View>
      )}
    </Screen>
  );
}

