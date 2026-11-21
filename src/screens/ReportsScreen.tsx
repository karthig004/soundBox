import {useNavigation} from '@react-navigation/native';
import React, {useMemo, useState} from 'react';
import {ScrollView, View} from 'react-native';
import Animated, {FadeInDown} from 'react-native-reanimated';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Bars, Donut, Meter} from '../components/charts';
import {AnimatedAmount} from '../components/motion';
import {Sheet} from '../components/Sheet';
import {toast} from '../components/Toast';
import {Button, Card, Chip, Gradient, Icon, IconBtn, Row, T, Tap} from '../components/ui';
import type {Txn} from '../engine/types';
import {TAB_BAR_HEIGHT} from '../navigation/Tabs';
import {useData} from '../store/data';
import {useSettings} from '../store/settings';
import {ACCOUNT_PALETTE, useTheme} from '../theme';
import {exportCsv, exportXlsx} from '../utils/exporter';
import {fmtDate, fmtDateLong, groupIN, money, PERIODS, PeriodId, periodRange, startOfDay} from '../utils/format';
import {byDay, effDirection, groupBy, inRange, party, summarize} from '../utils/stats';

type Scope = 'all' | 'credit' | 'debit' | 'unknown' | 'bank' | 'sender';

function DateStepper({label, value, onChange}: {label: string; value: number; onChange: (v: number) => void}) {
  const {c, radius} = useTheme();
  const day = 86400000;
  return (
    <View style={{flex: 1}}>
      <T v="tiny" mute style={{marginBottom: 6, textTransform: 'uppercase'}}>{label}</T>
      <View style={{flexDirection: 'row', alignItems: 'center', backgroundColor: c.cardAlt, borderRadius: radius.md, borderWidth: 0.5, borderColor: c.border}}>
        <IconBtn name="chevron-left" bg="transparent" onPress={() => onChange(value - day)} />
        <T v="small" style={{flex: 1, textAlign: 'center', fontWeight: '700'}}>{fmtDate(value)}</T>
        <IconBtn name="chevron-right" bg="transparent" onPress={() => onChange(Math.min(startOfDay(Date.now()), value + day))} />
      </View>
    </View>
  );
}

export function ReportsScreen() {
  const {c} = useTheme();
  const nav = useNavigation();
  const insets = useSafeAreaInsets();
  const txns = useData(s => s.txns);
  const accounts = useData(s => s.accounts);
  const mode = useSettings(s => s.mode);
  const businessName = useSettings(s => s.businessName);
  const [period, setPeriod] = useState<PeriodId>('today');
  const [custom, setCustom] = useState({from: startOfDay(Date.now()) - 6 * 86400000, to: startOfDay(Date.now())});
  const [sheet, setSheet] = useState(false);
  const [scope, setScope] = useState<Scope>('all');
  const [scopeKey, setScopeKey] = useState<string | undefined>();
  const [busy, setBusy] = useState<string | null>(null);

  const range = period === 'custom' ? periodRange('custom', {from: custom.from, to: custom.to + 86400000 - 1}) : periodRange(period);
  const list = useMemo(() => inRange(txns, range.from, range.to), [txns, range.from, range.to]);
  const s = useMemo(() => summarize(list), [list]);
  const days = useMemo(() => byDay(list, range.from, Math.min(range.to, Date.now())), [list, range.from, range.to]);
  const senders = useMemo(() => groupBy(list.filter(t => effDirection(t) === 'credit'), t => (party(t) ? {key: party(t)!.toLowerCase(), label: party(t)!} : null)), [list]);
  const banks = useMemo(() => groupBy(list, t => ({key: t.accountId ?? t.bank ?? '?', label: accounts.find(a => a.id === t.accountId)?.displayName ?? t.bank ?? 'Unassigned'})), [list, accounts]);

  const scoped = (): Txn[] => {
    switch (scope) {
      case 'credit': return list.filter(t => effDirection(t) === 'credit');
      case 'debit': return list.filter(t => effDirection(t) === 'debit');
      case 'unknown': return list.filter(t => t.category === 'unknown' || !t.accountId);
      case 'bank': return list.filter(t => (t.accountId ?? t.bank ?? '?') === scopeKey);
      case 'sender': return list.filter(t => party(t)?.toLowerCase() === scopeKey);
      default: return list;
    }
  };

  const doExport = async (kind: 'xlsx' | 'csv') => {
    const data = scoped();
    if (!data.length) return toast('Nothing to export for this selection', 'error');
    setBusy(kind);
    try {
      const input = {txns: data, accounts, from: range.from, to: range.to, label: range.label, businessName: mode === 'business' ? businessName : undefined};
      const r = kind === 'xlsx' ? await exportXlsx(input) : await exportCsv(input);
      toast(`${kind === 'xlsx' ? 'Excel' : 'CSV'} report saved`, 'success', r.savedTo || r.name);
    } catch (e: any) {
      toast('Export failed', 'error', e?.message);
    } finally {
      setBusy(null);
    }
  };

  const donut = [
    {value: s.received, color: c.success},
    {value: s.refunds, color: c.info},
    {value: s.sent, color: c.danger},
  ];
  const max = Math.max(1, senders[0]?.received ?? 1);

  return (
    <ScrollView style={{flex: 1, backgroundColor: c.bg}} contentContainerStyle={{paddingTop: insets.top + 8, paddingBottom: insets.bottom + TAB_BAR_HEIGHT + 40}}>
      <View style={{paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}}>
        <View>
          <T v="h1">Reports</T>
          <T v="small" dim>{range.label === 'Today' ? fmtDateLong(Date.now()) : range.label}</T>
        </View>
        <IconBtn name="file-export-outline" onPress={() => setSheet(true)} />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap: 8, paddingHorizontal: 16, paddingVertical: 14}}>
        {[...PERIODS, {id: 'custom' as PeriodId, label: 'Custom'}].map(p => (
          <Chip key={p.id} label={p.label} icon={p.id === 'custom' ? 'calendar-range' : undefined} active={period === p.id} onPress={() => setPeriod(p.id)} />
        ))}
      </ScrollView>

      <View style={{paddingHorizontal: 16}}>
        {period === 'custom' && (
          <Animated.View entering={FadeInDown.springify()} style={{flexDirection: 'row', gap: 10, marginBottom: 12}}>
            <DateStepper label="From" value={custom.from} onChange={from => setCustom(x => ({...x, from: Math.min(from, x.to)}))} />
            <DateStepper label="To" value={custom.to} onChange={to => setCustom(x => ({...x, to: Math.max(to, x.from)}))} />
          </Animated.View>
        )}

        <Card style={{flexDirection: 'row', alignItems: 'center', gap: 16}}>
          <Donut
            segments={donut}
            size={130}
            center={
              <View style={{alignItems: 'center'}}>
                <T v="tiny" mute>NET</T>
                <T v="h3" color={s.net >= 0 ? c.success : c.danger} style={{fontVariant: ['tabular-nums']}}>
                  {s.net < 0 ? '−' : ''}₹{groupIN(Math.abs(Math.round(s.net)), 0)}
                </T>
              </View>
            }
          />
          <View style={{flex: 1, gap: 10}}>
            {[
              {label: 'Received', v: s.received, color: c.success, n: s.creditCount},
              {label: 'Refunds', v: s.refunds, color: c.info},
              {label: 'Sent', v: s.sent, color: c.danger, n: s.debitCount},
            ].map(x => (
              <View key={x.label} style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
                <View style={{width: 10, height: 10, borderRadius: 5, backgroundColor: x.color}} />
                <View style={{flex: 1}}>
                  <T v="tiny" mute>{x.label}{x.n !== undefined ? ` · ${x.n}` : ''}</T>
                  <AnimatedAmount value={x.v} style={{fontSize: 16, fontWeight: '800', color: c.text}} />
                </View>
              </View>
            ))}
          </View>
        </Card>

        {mode === 'business' && (
          <Tap onPress={() => nav.navigate('DailyClosing')} style={{marginTop: 12, borderRadius: 20, overflow: 'hidden'}}>
            <Gradient angle={0} style={{padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14}}>
              <Icon name="store-check" size={28} color="#fff" />
              <View style={{flex: 1}}>
                <T v="h3" color="#fff">Daily closing</T>
                <T v="small" color="rgba(255,255,255,0.85)">Today’s collection summary, ready to share</T>
              </View>
              <Icon name="chevron-right" color="#fff" />
            </Gradient>
          </Tap>
        )}

        {days.length > 1 && (
          <Card style={{marginTop: 12}}>
            <T v="h3" style={{marginBottom: 10}}>Daily movement</T>
            <Bars values={days.map(d => d.received + d.refunds)} labels={days.map((d, i) => (i % Math.ceil(days.length / 7) === 0 ? String(new Date(d.ts).getDate()) : null))} highlightIndex={days.length - 1} height={110} />
            <View style={{marginTop: 14}}>
              {days.slice(-7).reverse().filter(d => d.count).map(d => (
                <View key={d.key} style={{flexDirection: 'row', paddingVertical: 7, borderTopWidth: 0.5, borderTopColor: c.border}}>
                  <T v="small" dim style={{flex: 1}}>{fmtDate(d.ts)}</T>
                  <T v="small" color={c.success} style={{width: 90, textAlign: 'right', fontWeight: '700'}}>+{groupIN(d.received + d.refunds, 0)}</T>
                  <T v="small" color={c.danger} style={{width: 80, textAlign: 'right', fontWeight: '700'}}>−{groupIN(d.sent, 0)}</T>
                  <T v="small" mute style={{width: 34, textAlign: 'right'}}>{d.count}</T>
                </View>
              ))}
            </View>
          </Card>
        )}

        {senders.length > 0 && (
          <Card style={{marginTop: 12}}>
            <T v="h3" style={{marginBottom: 10}}>{mode === 'business' ? 'Customer-wise' : 'Sender-wise'}</T>
            {senders.slice(0, 10).map((p, i) => (
              <View key={p.key} style={{marginBottom: 12}}>
                <View style={{flexDirection: 'row', marginBottom: 5}}>
                  <T v="body" style={{flex: 1, fontWeight: '600'}} numberOfLines={1}>{p.label}</T>
                  <T v="small" mute>{p.count}× · </T>
                  <T v="body" style={{fontWeight: '800'}}>{money(p.received)}</T>
                </View>
                <Meter ratio={p.received / max} color={ACCOUNT_PALETTE[i % ACCOUNT_PALETTE.length]} />
              </View>
            ))}
          </Card>
        )}

        {banks.length > 0 && (
          <Card style={{marginTop: 12}} padded={false}>
            <T v="h3" style={{margin: 16, marginBottom: 4}}>Bank summary</T>
            {banks.map((b, i) => (
              <Row key={b.key} icon="bank" iconColor={ACCOUNT_PALETTE[i % ACCOUNT_PALETTE.length]} title={b.label} subtitle={`${b.count} transactions · sent ${money(b.sent)}`} right={<T v="h3" color={c.success}>{money(b.received)}</T>} last={i === banks.length - 1} />
            ))}
          </Card>
        )}

        <View style={{flexDirection: 'row', gap: 12, marginTop: 20}}>
          <Button title="Excel" icon="microsoft-excel" onPress={() => doExport('xlsx')} loading={busy === 'xlsx'} style={{flex: 1}} />
          <Button title="CSV" icon="file-delimited-outline" kind="secondary" onPress={() => doExport('csv')} loading={busy === 'csv'} style={{flex: 1}} />
        </View>
        <T v="tiny" mute style={{textAlign: 'center', marginTop: 10}}>
          Exports include Summary, Transactions, Daily, Bank and Unknown sheets.
        </T>
      </View>

      <Sheet visible={sheet} onClose={() => setSheet(false)} title="Export options">
        <T v="small" dim style={{marginBottom: 12}}>Period: {range.label}</T>
        <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16}}>
          {([['all', 'Everything'], ['credit', 'Credits only'], ['debit', 'Debits only'], ['unknown', 'Unknown / unassigned'], ['bank', 'One bank'], ['sender', 'One sender']] as [Scope, string][]).map(([id, l]) => (
            <Chip key={id} label={l} active={scope === id} onPress={() => { setScope(id); setScopeKey(undefined); }} />
          ))}
        </View>
        {scope === 'bank' && (
          <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16}}>
            {banks.map(b => <Chip key={b.key} label={b.label} active={scopeKey === b.key} onPress={() => setScopeKey(b.key)} />)}
          </View>
        )}
        {scope === 'sender' && (
          <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16}}>
            {senders.slice(0, 30).map(b => <Chip key={b.key} label={b.label} active={scopeKey === b.key} onPress={() => setScopeKey(b.key)} />)}
          </View>
        )}
        <T v="small" mute style={{marginBottom: 14}}>{scoped().length} transactions selected</T>
        <View style={{flexDirection: 'row', gap: 12, marginBottom: 8}}>
          <Button title="Excel" icon="microsoft-excel" onPress={() => doExport('xlsx')} style={{flex: 1}} />
          <Button title="CSV" icon="file-delimited-outline" kind="secondary" onPress={() => doExport('csv')} style={{flex: 1}} />
        </View>
      </Sheet>
    </ScrollView>
  );
}
