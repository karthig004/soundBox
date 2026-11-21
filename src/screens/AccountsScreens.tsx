import React, {useState} from 'react';
import {Alert, View} from 'react-native';
import Animated, {FadeInDown, LinearTransition} from 'react-native-reanimated';
import {AccountDraft, AccountForm, draftToAccount, draftValid, emptyDraft} from '../components/AccountForm';
import {Screen} from '../components/Screen';
import {toast} from '../components/Toast';
import {Badge, Button, Empty, Gradient, Icon, IconBtn, T, Tap} from '../components/ui';
import type {ScreenProps} from '../navigation/types';
import {useData} from '../store/data';
import {ACCOUNT_PALETTE, useTheme} from '../theme';
import {groupIN} from '../utils/format';
import {countsInTotals, effDirection} from '../utils/stats';

export function AccountsScreen({navigation}: ScreenProps<'Accounts'>) {
  const {c} = useTheme();
  const accounts = useData(s => s.accounts);
  const txns = useData(s => s.txns);
  const setDefault = useData(s => s.setDefaultAccount);

  const totals = (id: string) => {
    let r = 0, n = 0;
    for (const t of txns) if (t.accountId === id && countsInTotals(t)) {
      n++;
      if (effDirection(t) === 'credit') r += t.amount;
    }
    return {r, n};
  };

  return (
    <Screen title="Bank accounts" subtitle="Payments are matched to these accounts" back right={<IconBtn name="plus" onPress={() => navigation.navigate('AccountEdit', {})} />}>
      {accounts.length === 0 ? (
        <Empty icon="bank-plus" title="No accounts yet" subtitle="Add the accounts you receive payments in. Only the last 4 digits are needed." action={<Button title="Add account" icon="plus" onPress={() => navigation.navigate('AccountEdit', {})} />} />
      ) : (
        accounts.map((a, i) => {
          const color = ACCOUNT_PALETTE[a.color % ACCOUNT_PALETTE.length];
          const {r, n} = totals(a.id);
          return (
            <Animated.View key={a.id} entering={FadeInDown.delay(i * 60).springify()} layout={LinearTransition.springify()}>
              <Tap onPress={() => navigation.navigate('AccountEdit', {id: a.id})} scaleTo={0.98} style={{marginBottom: 14, opacity: a.active ? 1 : 0.6}}>
                <Gradient colors={[color, color + 'AA']} style={{borderRadius: 24, padding: 18, height: 170, justifyContent: 'space-between', overflow: 'hidden'}}>
                  <View style={{position: 'absolute', right: -30, top: -30, width: 140, height: 140, borderRadius: 70, backgroundColor: 'rgba(255,255,255,0.12)'}} />
                  <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start'}}>
                    <View style={{flex: 1}}>
                      <T v="h3" color="#fff" numberOfLines={1}>{a.displayName}</T>
                      <T v="small" color="rgba(255,255,255,0.85)">{a.bank} · {a.type}</T>
                    </View>
                    <View style={{flexDirection: 'row', gap: 6}}>
                      {a.isDefault && <Badge label="DEFAULT" color="#fff" />}
                      {!a.active && <Badge label="INACTIVE" color="#fff" />}
                    </View>
                  </View>
                  <View>
                    <T v="h2" color="#fff" style={{letterSpacing: 3}}>•••• •••• {a.last4 ?? '????'}</T>
                    <View style={{flexDirection: 'row', justifyContent: 'space-between', marginTop: 6}}>
                      <T v="small" color="rgba(255,255,255,0.85)">{n} txns · ₹{groupIN(r, 0)} received</T>
                      {a.upiIds.length ? <T v="small" color="rgba(255,255,255,0.85)">{a.upiIds.length} UPI ID{a.upiIds.length > 1 ? 's' : ''}</T> : null}
                    </View>
                  </View>
                </Gradient>
              </Tap>
              {!a.isDefault && (
                <Tap onPress={() => setDefault(a.id)} style={{alignSelf: 'flex-end', marginTop: -8, marginBottom: 14}}>
                  <T v="small" color={c.primary} style={{fontWeight: '700'}}>Set as default</T>
                </Tap>
              )}
            </Animated.View>
          );
        })
      )}
      <View style={{flexDirection: 'row', gap: 10, alignItems: 'center', marginTop: 8}}>
        <Icon name="shield-check-outline" size={18} color={c.textMute} />
        <T v="small" mute style={{flex: 1}}>Never enter passwords, PINs or OTPs. The default account is only used for display — uncertain payments are never auto-assigned to it.</T>
      </View>
    </Screen>
  );
}

export function AccountEditScreen({route, navigation}: ScreenProps<'AccountEdit'>) {
  const {c} = useTheme();
  const existing = useData(s => s.accounts.find(a => a.id === route.params?.id));
  const upsert = useData(s => s.upsertAccount);
  const remove = useData(s => s.removeAccount);
  const [draft, setDraft] = useState<AccountDraft>(emptyDraft(existing));

  const save = () => {
    upsert({...(existing ? {id: existing.id} : {}), ...draftToAccount(draft)});
    toast(existing ? 'Account updated' : 'Account added', 'success');
    navigation.goBack();
  };
  const del = () =>
    Alert.alert('Delete account?', 'Past transactions stay in history but become unassigned.', [
      {text: 'Cancel', style: 'cancel'},
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          const d = useData.getState();
          d.txns.filter(t => t.accountId === existing!.id).forEach(t => d.updateTxn(t.id, {accountId: undefined}));
          remove(existing!.id);
          navigation.goBack();
        },
      },
    ]);

  return (
    <Screen title={existing ? 'Edit account' : 'New account'} back right={existing ? <IconBtn name="delete-outline" color={c.danger} bg="transparent" onPress={del} /> : undefined}>
      <AccountForm draft={draft} onChange={setDraft} />
      <Button title={existing ? 'Save changes' : 'Add account'} icon="check" onPress={save} disabled={!draftValid(draft)} style={{marginTop: 16}} />
    </Screen>
  );
}
