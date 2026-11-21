import {useNavigation} from '@react-navigation/native';
import React, {useCallback, useDeferredValue, useMemo, useState} from 'react';
import {ScrollView, SectionList, TextInput, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Field} from '../components/AccountForm';
import {Sheet} from '../components/Sheet';
import {TxRow} from '../components/TxRow';
import {Button, Chip, Empty, Icon, IconBtn, T} from '../components/ui';
import {SOURCES} from '../engine/sources';
import type {Txn} from '../engine/types';
import {TAB_BAR_HEIGHT} from '../navigation/Tabs';
import {useData} from '../store/data';
import {useTheme} from '../theme';
import {dayKey, dayLabel, groupIN, PERIODS, PeriodId, periodRange} from '../utils/format';
import {countsInTotals, effDirection, party} from '../utils/stats';

type Quick = 'all' | 'credit' | 'debit' | 'refund' | 'pending' | 'unknown' | 'review' | 'unannounced';
const QUICK: {id: Quick; label: string; icon: string}[] = [
  {id: 'all', label: 'All', icon: 'format-list-bulleted'},
  {id: 'credit', label: 'Received', icon: 'arrow-bottom-left'},
  {id: 'debit', label: 'Sent', icon: 'arrow-top-right'},
  {id: 'refund', label: 'Refunds', icon: 'cash-refund'},
  {id: 'pending', label: 'Pending/Failed', icon: 'clock-outline'},
  {id: 'unknown', label: 'Unknown', icon: 'help-circle-outline'},
  {id: 'review', label: 'Flagged', icon: 'flag-outline'},
  {id: 'unannounced', label: 'Not announced', icon: 'volume-off'},
];

interface Filters {
  period: PeriodId;
  accountId?: string;
  source?: string;
  min?: string;
  max?: string;
}

export function HistoryScreen() {
  const {c, radius} = useTheme();
  const nav = useNavigation();
  const insets = useSafeAreaInsets();
  const txns = useData(s => s.txns);
  const accounts = useData(s => s.accounts);
  const [q, setQ] = useState('');
  const query = useDeferredValue(q);
  const [quick, setQuick] = useState<Quick>('all');
  const [f, setF] = useState<Filters>({period: 'all'});
  const [sheet, setSheet] = useState(false);
  const activeFilters = Number(f.period !== 'all') + Number(!!f.accountId) + Number(!!f.source) + Number(!!f.min || !!f.max);

  const filtered = useMemo(() => {
    const r = periodRange(f.period);
    const ql = query.trim().toLowerCase();
    const min = parseFloat(f.min ?? ''), max = parseFloat(f.max ?? '');
    return txns.filter(t => {
      if (t.timestamp < r.from || t.timestamp > r.to) return false;
      if (f.accountId && (f.accountId === 'none' ? t.accountId : t.accountId !== f.accountId)) return false;
      if (f.source && t.source.id !== f.source) return false;
      if (!isNaN(min) && t.amount < min) return false;
      if (!isNaN(max) && t.amount > max) return false;
      switch (quick) {
        case 'credit': if (effDirection(t) !== 'credit' || t.kind !== 'payment') return false; break;
        case 'debit': if (effDirection(t) !== 'debit') return false; break;
        case 'refund': if (t.kind === 'payment') return false; break;
        case 'pending': if (t.status === 'success') return false; break;
        case 'unknown': if (t.category !== 'unknown') return false; break;
        case 'review': if (!t.review) return false; break;
        case 'unannounced': if (t.announce.status === 'announced') return false; break;
      }
      if (ql) {
        const hay = `${party(t) ?? ''} ${t.bank ?? ''} ${t.reference ?? ''} ${t.upiId ?? ''} ${t.amount} ${t.notes ?? ''} ${t.source.name}`.toLowerCase();
        if (!hay.includes(ql)) return false;
      }
      return true;
    });
  }, [txns, query, quick, f]);

  const sections = useMemo(() => {
    const map = new Map<string, {title: string; data: Txn[]; credit: number; debit: number}>();
    for (const t of filtered) {
      const k = dayKey(t.timestamp);
      let s = map.get(k);
      if (!s) {
        s = {title: dayLabel(t.timestamp), data: [], credit: 0, debit: 0};
        map.set(k, s);
      }
      s.data.push(t);
      if (countsInTotals(t)) {
        if (effDirection(t) === 'credit') s.credit += t.amount;
        else s.debit += t.amount;
      }
    }
    return [...map.values()];
  }, [filtered]);

  const renderItem = useCallback(({item}: {item: Txn}) => (
    <View style={{paddingHorizontal: 16}}>
      <TxRow t={item} onPress={() => nav.navigate('TxDetail', {id: item.id})} />
    </View>
  ), [nav]);

  return (
    <View style={{flex: 1, backgroundColor: c.bg, paddingTop: insets.top + 8}}>
      <View style={{paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}}>
        <T v="h1">History</T>
        <View>
          <IconBtn name="tune-variant" onPress={() => setSheet(true)} />
          {activeFilters > 0 && (
            <View style={{position: 'absolute', top: -2, right: -2, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center'}}>
              <T v="tiny" color="#fff">{activeFilters}</T>
            </View>
          )}
        </View>
      </View>
      <View style={{marginHorizontal: 16, marginTop: 14, flexDirection: 'row', alignItems: 'center', backgroundColor: c.card, borderRadius: radius.pill, paddingHorizontal: 16, height: 48, borderWidth: 0.5, borderColor: c.border, gap: 10}}>
        <Icon name="magnify" size={22} color={c.textMute} />
        <TextInput value={q} onChangeText={setQ} placeholder="Search name, amount, UTR, bank…" placeholderTextColor={c.textMute} style={{flex: 1, color: c.text, fontSize: 15, fontWeight: '500'}} />
        {q ? <IconBtn name="close" size={28} iconSize={16} onPress={() => setQ('')} /> : null}
      </View>
      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap: 8, paddingHorizontal: 16, paddingVertical: 12}}>
          {QUICK.map(x => (
            <Chip key={x.id} label={x.label} icon={x.icon} active={quick === x.id} onPress={() => setQuick(x.id)} />
          ))}
        </ScrollView>
      </View>
      <SectionList
        sections={sections}
        keyExtractor={t => t.id}
        renderItem={renderItem}
        stickySectionHeadersEnabled
        initialNumToRender={14}
        maxToRenderPerBatch={20}
        windowSize={9}
        contentContainerStyle={{paddingBottom: insets.bottom + TAB_BAR_HEIGHT + 30}}
        renderSectionHeader={({section}) => (
          <View style={{flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 8, backgroundColor: c.bg}}>
            <T v="small" dim style={{fontWeight: '800'}}>
              {section.title}
            </T>
            <T v="small" style={{fontVariant: ['tabular-nums']}}>
              <T v="small" color={c.success} style={{fontWeight: '700'}}>+₹{groupIN(section.credit)}</T>
              {section.debit ? <T v="small" color={c.danger} style={{fontWeight: '700'}}>{'  '}−₹{groupIN(section.debit)}</T> : null}
            </T>
          </View>
        )}
        ListEmptyComponent={<Empty icon="receipt-text-outline" title={txns.length ? 'Nothing matches' : 'No history yet'} subtitle={txns.length ? 'Try a different search or filter.' : 'Recognised payment notifications appear here.'} />}
      />

      <Sheet visible={sheet} onClose={() => setSheet(false)} title="Filters">
        <T v="tiny" mute style={{marginBottom: 8, textTransform: 'uppercase'}}>Date</T>
        <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18}}>
          {PERIODS.map(p => (
            <Chip key={p.id} label={p.label} active={f.period === p.id} onPress={() => setF({...f, period: p.id})} />
          ))}
        </View>
        <T v="tiny" mute style={{marginBottom: 8, textTransform: 'uppercase'}}>Account</T>
        <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18}}>
          <Chip label="Any" active={!f.accountId} onPress={() => setF({...f, accountId: undefined})} />
          {accounts.map(a => (
            <Chip key={a.id} label={a.displayName} active={f.accountId === a.id} onPress={() => setF({...f, accountId: a.id})} />
          ))}
          <Chip label="Unassigned" active={f.accountId === 'none'} onPress={() => setF({...f, accountId: 'none'})} />
        </View>
        <T v="tiny" mute style={{marginBottom: 8, textTransform: 'uppercase'}}>Source</T>
        <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18}}>
          <Chip label="Any" active={!f.source} onPress={() => setF({...f, source: undefined})} />
          {[...SOURCES.map(s => ({id: s.id, name: s.short})), {id: 'manual', name: 'Manual'}, {id: 'import', name: 'Imported'}].map(s => (
            <Chip key={s.id} label={s.name} active={f.source === s.id} onPress={() => setF({...f, source: s.id})} />
          ))}
        </View>
        <View style={{flexDirection: 'row', gap: 12}}>
          <View style={{flex: 1}}>
            <Field label="Min ₹" keyboardType="numeric" value={f.min ?? ''} onChangeText={min => setF({...f, min})} />
          </View>
          <View style={{flex: 1}}>
            <Field label="Max ₹" keyboardType="numeric" value={f.max ?? ''} onChangeText={max => setF({...f, max})} />
          </View>
        </View>
        <View style={{flexDirection: 'row', gap: 12, marginTop: 4, marginBottom: 8}}>
          <Button title="Reset" kind="secondary" onPress={() => setF({period: 'all'})} style={{flex: 1}} />
          <Button title={`Show ${filtered.length}`} onPress={() => setSheet(false)} style={{flex: 2}} />
        </View>
      </Sheet>
    </View>
  );
}
