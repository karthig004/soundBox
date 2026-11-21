import React, {useState} from 'react';
import {Alert, View} from 'react-native';
import Animated, {FadeInDown, ZoomIn} from 'react-native-reanimated';
import {Field} from '../components/AccountForm';
import {Screen} from '../components/Screen';
import {toast} from '../components/Toast';
import {Badge, Button, Card, Chip, Gradient, Group, Icon, IconBtn, Row, T, Toggle} from '../components/ui';
import {announceTxn} from '../engine/announcer';
import type {ScreenProps} from '../navigation/types';
import {useData} from '../store/data';
import {useSettings} from '../store/settings';
import {useTheme} from '../theme';
import {fmtDateLong, fmtTime, groupIN, maskAcc} from '../utils/format';
import {effDirection, party} from '../utils/stats';

export const BUSINESS_CATEGORIES = ['Customer Payment', 'Sales Collection', 'Customer Advance', 'Supplier Payment', 'Business Expense', 'Refund', 'Other'];
export const PERSONAL_CATEGORIES = ['Salary', 'Family', 'Food', 'Groceries', 'Shopping', 'Bills', 'Rent', 'Travel', 'Fuel', 'Health', 'Education', 'Entertainment', 'Investment', 'Other'];

const CONF_COLOR = {high: '#10B981', medium: '#F59E0B', low: '#EF4444'};

export function TxDetailScreen({route, navigation}: ScreenProps<'TxDetail'>) {
  const {c} = useTheme();
  const t = useData(s => s.txns.find(x => x.id === route.params.id));
  const accounts = useData(s => s.accounts);
  const update = useData(s => s.updateTxn);
  const del = useData(s => s.deleteTxn);
  const mode = useSettings(s => s.mode);
  const [editName, setEditName] = useState(false);
  const [name, setName] = useState('');
  const [notes, setNotes] = useState(t?.notes ?? '');

  if (!t) {
    return (
      <Screen title="Transaction" back>
        <T dim>This transaction no longer exists.</T>
      </Screen>
    );
  }
  const dir = effDirection(t);
  const credit = dir === 'credit';
  const grad = t.status !== 'success' ? ['#F59E0B', '#D97706'] : credit ? ['#10B981', '#047857'] : dir === 'debit' ? ['#FB7185', '#BE123C'] : ['#94A3B8', '#475569'];
  const account = accounts.find(a => a.id === t.accountId);
  const cats = mode === 'business' ? BUSINESS_CATEGORIES : PERSONAL_CATEGORIES;
  const label = t.kind === 'refund' ? 'Refund' : t.kind === 'reversal' ? 'Reversal' : credit ? 'Received' : dir === 'debit' ? 'Sent' : 'Unidentified';

  const saveName = () => {
    const key = credit ? 'sender' : 'beneficiary';
    update(t.id, {corrections: {...t.corrections, [key]: name.trim() || undefined}});
    setEditName(false);
    toast('Name corrected', 'success');
  };
  const remove = () =>
    Alert.alert('Delete transaction?', 'It will be removed from history and reports on this phone.', [
      {text: 'Cancel', style: 'cancel'},
      {text: 'Delete', style: 'destructive', onPress: () => { del(t.id); navigation.goBack(); }},
    ]);

  const info: [string, string, string | undefined][] = [
    ['clock-outline', 'Date & time', `${fmtDateLong(t.timestamp)} · ${fmtTime(t.timestamp)}`],
    ['apps', 'Source', `${t.source.name}${t.source.category === 'import' ? ' (imported)' : t.source.category === 'manual' ? ' (entered by you)' : ''}`],
    ['message-lock-outline', 'SMS sender', t.smsSender ? `${t.smsSender} · ${t.senderTrust === 'unverified' ? 'not a verified bank (no sound)' : t.senderTrust === 'trusted' ? 'trusted by you' : 'verified bank'}` : undefined],
    ['bank-outline', 'Bank', t.bank],
    ['credit-card-outline', 'Account in alert', t.last4 ? maskAcc(t.last4) : undefined],
    ['pound', 'Reference (UTR/RRN)', t.reference],
    ['at', 'UPI ID', t.upiId],
  ];

  return (
    <Screen title={label} back right={<IconBtn name="delete-outline" onPress={remove} color={c.danger} bg="transparent" />}>
      <Animated.View entering={ZoomIn.springify().damping(14)}>
        <Gradient colors={grad} style={{borderRadius: 28, padding: 22, alignItems: 'center'}}>
          <View style={{width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center'}}>
            <Icon name={credit ? 'arrow-bottom-left-thick' : dir === 'debit' ? 'arrow-top-right-thick' : 'help'} size={30} color="#fff" />
          </View>
          <T v="h1" color="#fff" style={{fontSize: 40, marginTop: 12, fontVariant: ['tabular-nums']}}>
            {t.amount ? `₹${groupIN(t.amount)}` : '—'}
          </T>
          <T v="body" color="rgba(255,255,255,0.9)" style={{marginTop: 4}}>
            {party(t) ? `${credit ? 'from' : 'to'} ${party(t)}` : credit ? 'Sender not available' : dir === 'debit' ? 'Beneficiary not available' : 'Details not available'}
          </T>
          <View style={{flexDirection: 'row', gap: 6, marginTop: 14, flexWrap: 'wrap', justifyContent: 'center'}}>
            <Badge label={t.status.toUpperCase()} color="#fff" />
            <Badge label={`${t.confidence.toUpperCase()} CONFIDENCE`} color="#fff" />
            {t.mergedEvents ? <Badge label={`${t.mergedEvents + 1} ALERTS MERGED`} color="#fff" /> : null}
          </View>
        </Gradient>
      </Animated.View>

      {t.status === 'pending' && (
        <Card style={{marginTop: 12, backgroundColor: c.warningSoft}}>
          <T v="small">Pending — not announced as a successful payment. It will update automatically if a success alert arrives.</T>
        </Card>
      )}
      {t.unknownReason && (
        <Card style={{marginTop: 12, backgroundColor: c.infoSoft}}>
          <T v="small"><T v="small" style={{fontWeight: '800'}}>Why it needs review: </T>{t.unknownReason}</T>
        </Card>
      )}

      <Animated.View entering={FadeInDown.delay(80).springify()} style={{marginTop: 18}}>
        <Group title="Details">
          {info.map(([icon, k, val], i) => (
            <Row key={k} icon={icon} title={k} subtitle={val ?? 'Not available'} last={i === info.length - 1} />
          ))}
        </Group>
      </Animated.View>

      <Group title="Your corrections" footer="Corrections are stored separately — the original alert text below is never changed.">
        {editName ? (
          <View style={{padding: 14}}>
            <Field label={credit ? 'Sender name' : 'Beneficiary name'} value={name} onChangeText={setName} autoFocus placeholder={party(t) ?? ''} />
            <View style={{flexDirection: 'row', gap: 10}}>
              <Button small title="Cancel" kind="secondary" onPress={() => setEditName(false)} style={{flex: 1}} />
              <Button small title="Save" onPress={saveName} style={{flex: 1}} />
            </View>
          </View>
        ) : (
          <Row icon="account-edit-outline" title={credit ? 'Sender name' : 'Beneficiary name'} subtitle={(t.corrections?.sender ?? t.corrections?.beneficiary) ? `Corrected: ${party(t)} (original: ${(credit ? t.sender : t.beneficiary) ?? 'none'})` : party(t) ?? 'Not recognised'} onPress={() => { setName(party(t) ?? ''); setEditName(true); }} />
        )}
        <View style={{padding: 14, borderBottomWidth: 0.5, borderBottomColor: c.border}}>
          <T v="small" style={{fontWeight: '700', marginBottom: 8}}>Account {t.corrections?.accountId ? '(assigned by you)' : account ? '(matched automatically)' : ''}</T>
          <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8}}>
            {accounts.map(a => (
              <Chip key={a.id} label={a.displayName} active={t.accountId === a.id} onPress={() => update(t.id, {accountId: a.id, bank: t.bank ?? a.bank, corrections: {...t.corrections, accountId: a.id}, unknownReason: undefined})} />
            ))}
            {!accounts.length && <T v="small" mute>Add bank accounts in Settings to assign.</T>}
          </View>
        </View>
        {t.direction === 'unknown' && (
          <View style={{padding: 14, borderBottomWidth: 0.5, borderBottomColor: c.border}}>
            <T v="small" style={{fontWeight: '700', marginBottom: 8}}>Credit or debit?</T>
            <View style={{flexDirection: 'row', gap: 8}}>
              <Chip label="Credit" active={t.corrections?.direction === 'credit'} onPress={() => update(t.id, {corrections: {...t.corrections, direction: 'credit'}, category: t.amount ? 'received' : 'unknown'})} />
              <Chip label="Debit" active={t.corrections?.direction === 'debit'} onPress={() => update(t.id, {corrections: {...t.corrections, direction: 'debit'}, category: t.amount ? 'sent' : 'unknown'})} />
            </View>
          </View>
        )}
        <View style={{padding: 14}}>
          <T v="small" style={{fontWeight: '700', marginBottom: 8}}>Category</T>
          <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8}}>
            {cats.map(cat => (
              <Chip key={cat} label={cat} active={t.userCategory === cat} onPress={() => update(t.id, {userCategory: t.userCategory === cat ? undefined : cat})} />
            ))}
          </View>
          <View style={{height: 14}} />
          <Field label="Notes" value={notes} onChangeText={setNotes} onBlur={() => update(t.id, {notes: notes.trim() || undefined})} placeholder="Bill no., item, remarks…" multiline style={{height: 80, textAlignVertical: 'top', paddingTop: 12}} />
        </View>
      </Group>

      <Group title="Flags">
        <Row icon="flag-outline" iconColor={c.warning} title="Mark for review" right={<Toggle value={!!t.review} onChange={review => update(t.id, {review})} />} />
        <Row icon="file-hidden" title="Exclude from reports" right={<Toggle value={!!t.excluded} onChange={excluded => update(t.id, {excluded})} />} />
        <Row icon="cancel" title="Not relevant" subtitle="Hide from review queue and totals" right={<Toggle value={!!t.irrelevant} onChange={irrelevant => update(t.id, {irrelevant})} />} last />
      </Group>

      <Group title="Announcement">
        <Row icon="volume-high" title={t.announce.status === 'announced' ? `Announced ${t.announce.count}×` : `Status: ${t.announce.status}`} subtitle={t.announce.text ?? t.announce.reason ?? (t.announce.at ? fmtTime(t.announce.at) : undefined)} />
        {!!t.announce.textEn && t.announce.lang !== 'en' && <Row icon="translate" title="English" subtitle={t.announce.textEn} chevron={false} />}
        {t.announce.reason && t.announce.status !== 'announced' ? <Row icon="information-outline" title="Reason" subtitle={t.announce.reason} /> : null}
        <Row icon="replay" title="Announce now" onPress={() => { announceTxn(t, true); toast('Announcing…'); }} last />
      </Group>

      {t.raw && (
        <Group title="Original alert (evidence)">
          <View style={{padding: 14}}>
            <T v="small" style={{fontWeight: '800'}}>{t.raw.title}</T>
            <T v="small" dim style={{marginTop: 4, lineHeight: 19}} selectable>{t.raw.text}</T>
          </View>
        </Group>
      )}
      <T v="tiny" mute style={{textAlign: 'center', lineHeight: 16}}>
        Read from a notification on this device. RubyAlert does not verify transactions with your bank.
      </T>
      <View style={{flexDirection: 'row', gap: 8, marginTop: 12, justifyContent: 'center'}}>
        <Badge label={`confidence: ${t.confidence}`} color={CONF_COLOR[t.confidence]} />
      </View>
    </Screen>
  );
}
