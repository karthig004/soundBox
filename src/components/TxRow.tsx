import React, {memo} from 'react';
import {View} from 'react-native';
import type {Txn} from '../engine/types';
import {shortBank} from '../engine/sources';
import {useTheme} from '../theme';
import {useSettings} from '../store/settings';
import {fmtTime, groupIN, initials, maskAcc} from '../utils/format';
import {effDirection, party} from '../utils/stats';
import {Gradient, Icon, T, Tap} from './ui';

const STATUS_ICON: Partial<Record<Txn['category'], string>> = {
  pending: 'clock-outline',
  failed: 'close-circle-outline',
  unknown: 'help-circle-outline',
  refund: 'cash-refund',
  reversal: 'undo-variant',
};

export const TxRow = memo(function TxRow({t, onPress, compact}: {t: Txn; onPress?: () => void; compact?: boolean}) {
  const {c} = useTheme();
  const show = useSettings(s => s.showAmounts);
  const dir = effDirection(t);
  const credit = dir === 'credit';
  const name = party(t) ?? (t.category === 'unknown' ? 'Unidentified' : credit ? 'Payment received' : dir === 'debit' ? 'Payment sent' : 'Transaction');
  const tint = t.status !== 'success' ? c.warning : t.category === 'unknown' ? c.textMute : credit ? c.success : c.danger;
  const grad = credit ? ['#10B981', '#059669'] : dir === 'debit' ? ['#FB7185', '#E11D48'] : ['#94A3B8', '#64748B'];
  const meta = [fmtTime(t.timestamp), shortBank(t.bank) || t.source.name, maskAcc(t.last4)].filter(Boolean).join(' · ');
  const statusIcon = STATUS_ICON[t.category];

  return (
    <Tap onPress={onPress} scaleTo={0.98} style={{flexDirection: 'row', alignItems: 'center', paddingVertical: compact ? 10 : 12, gap: 12}}>
      <View>
        <Gradient colors={grad} style={{width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center'}}>
          {party(t) ? (
            <T v="h3" color="#fff" style={{fontSize: 15}}>
              {initials(party(t))}
            </T>
          ) : (
            <Icon name={credit ? 'arrow-bottom-left' : dir === 'debit' ? 'arrow-top-right' : 'help'} size={20} color="#fff" />
          )}
        </Gradient>
        {statusIcon ? (
          <View style={{position: 'absolute', right: -4, bottom: -4, backgroundColor: c.card, borderRadius: 10, padding: 1}}>
            <Icon name={statusIcon} size={15} color={tint} />
          </View>
        ) : null}
      </View>
      <View style={{flex: 1}}>
        <T v="body" style={{fontWeight: '700'}} numberOfLines={1}>
          {name}
        </T>
        <T v="small" mute numberOfLines={1}>
          {meta}
        </T>
      </View>
      <View style={{alignItems: 'flex-end'}}>
        <T v="h3" color={tint} style={{fontVariant: ['tabular-nums']}}>
          {show ? `${credit ? '+' : dir === 'debit' ? '−' : ''}₹${groupIN(t.amount)}` : '₹ ••••'}
        </T>
        <View style={{flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2}}>
          {t.announce.status === 'announced' && <Icon name="volume-high" size={13} color={c.textMute} />}
          {t.announce.status === 'failed' && <Icon name="volume-off" size={13} color={c.danger} />}
          {t.review && <Icon name="flag" size={13} color={c.warning} />}
          {t.status !== 'success' && (
            <T v="tiny" color={c.warning}>
              {t.status.toUpperCase()}
            </T>
          )}
        </View>
      </View>
    </Tap>
  );
});
