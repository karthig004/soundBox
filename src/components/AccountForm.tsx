import React, {useState} from 'react';
import {ScrollView, TextInput, View} from 'react-native';
import {BANK_NAMES, SOURCES} from '../engine/sources';
import type {BankAccount} from '../engine/types';
import {useTheme} from '../theme';
import {Chip, Segmented, T, Toggle} from './ui';

export interface AccountDraft {
  displayName: string;
  bank: string;
  last4: string;
  type: BankAccount['type'];
  upi: string;
  sources: string[];
  active: boolean;
}

export const emptyDraft = (a?: BankAccount): AccountDraft => ({
  displayName: a?.displayName ?? '',
  bank: a?.bank ?? '',
  last4: a?.last4 ?? '',
  type: a?.type ?? 'savings',
  upi: a?.upiIds.join(', ') ?? '',
  sources: a?.sources ?? [],
  active: a?.active ?? true,
});

export const draftValid = (d: AccountDraft) => d.bank.trim().length > 1 && (!d.last4 || /^\d{3,6}$/.test(d.last4));

export const draftToAccount = (d: AccountDraft) => ({
  displayName: d.displayName.trim() || `${d.bank}${d.last4 ? ' ' + d.last4 : ''}`,
  bank: d.bank.trim(),
  last4: d.last4.trim() || undefined,
  type: d.type,
  upiIds: d.upi.split(/[,\s]+/).map(s => s.trim().toLowerCase()).filter(s => s.includes('@')),
  sources: d.sources,
  active: d.active,
});

export function Field({label, hint, ...p}: React.ComponentProps<typeof TextInput> & {label: string; hint?: string}) {
  const {c, radius} = useTheme();
  const [focus, setFocus] = useState(false);
  return (
    <View style={{marginBottom: 16}}>
      <T v="tiny" mute style={{marginBottom: 6, textTransform: 'uppercase'}}>
        {label}
      </T>
      <TextInput
        placeholderTextColor={c.textMute}
        {...p}
        onFocus={e => {
          setFocus(true);
          p.onFocus?.(e);
        }}
        onBlur={e => {
          setFocus(false);
          p.onBlur?.(e);
        }}
        style={[{height: 52, borderRadius: radius.md, paddingHorizontal: 16, backgroundColor: c.cardAlt, color: c.text, fontSize: 16, fontWeight: '600', borderWidth: 1.5, borderColor: focus ? c.primary : c.border}, p.style]}
      />
      {hint ? (
        <T v="small" mute style={{marginTop: 6}}>
          {hint}
        </T>
      ) : null}
    </View>
  );
}

const POPULAR = BANK_NAMES.slice(0, 12);

export function AccountForm({draft, onChange, showSources = true}: {draft: AccountDraft; onChange: (d: AccountDraft) => void; showSources?: boolean}) {
  const {c} = useTheme();
  const set = (p: Partial<AccountDraft>) => onChange({...draft, ...p});
  return (
    <View>
      <T v="tiny" mute style={{marginBottom: 8, textTransform: 'uppercase'}}>
        Bank
      </T>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap: 8, paddingBottom: 12}}>
        {POPULAR.map(b => (
          <Chip key={b} label={b.replace(/ Bank$/, '')} active={draft.bank === b} onPress={() => set({bank: b})} />
        ))}
      </ScrollView>
      <Field label="Bank name" value={draft.bank} onChangeText={bank => set({bank})} placeholder="e.g. Indian Bank" />
      <Field label="Account last 4 digits" value={draft.last4} onChangeText={v => set({last4: v.replace(/\D/g, '').slice(0, 6)})} keyboardType="number-pad" placeholder="1234" hint="Used to match alerts like “A/c XX1234”. Never enter your full number, PIN or password." />
      <Field label="Display name" value={draft.displayName} onChangeText={displayName => set({displayName})} placeholder="Shop current account" />
      <T v="tiny" mute style={{marginBottom: 8, textTransform: 'uppercase'}}>
        Account type
      </T>
      <Segmented
        style={{marginBottom: 16}}
        value={draft.type}
        onChange={type => set({type})}
        options={[
          {id: 'savings', label: 'Savings'},
          {id: 'current', label: 'Current'},
          {id: 'other', label: 'Other'},
        ]}
      />
      <Field label="UPI IDs (optional)" value={draft.upi} onChangeText={upi => set({upi})} autoCapitalize="none" placeholder="shop@okhdfcbank, 98xxxxxx@ybl" hint="Separate several with commas." />
      {showSources && (
        <>
          <T v="tiny" mute style={{marginBottom: 8, textTransform: 'uppercase'}}>
            Apps that pay into this account
          </T>
          <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8}}>
            {SOURCES.filter(s => s.category !== 'bank').map(s => {
              const on = draft.sources.includes(s.id);
              return <Chip key={s.id} label={s.short} icon={s.icon} active={on} color={s.color} onPress={() => set({sources: on ? draft.sources.filter(x => x !== s.id) : [...draft.sources, s.id]})} />;
            })}
          </View>
          <T v="small" mute style={{marginBottom: 16}}>
            If only one account is linked to an app, its payments are matched to that account when the alert doesn’t say which.
          </T>
        </>
      )}
      <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8}}>
        <View style={{flex: 1}}>
          <T v="body" style={{fontWeight: '600'}}>
            Active
          </T>
          <T v="small" mute>
            Inactive accounts are recorded but never announced
          </T>
        </View>
        <Toggle value={draft.active} onChange={active => set({active})} />
      </View>
      <View style={{height: 1, backgroundColor: c.border, opacity: 0}} />
    </View>
  );
}
