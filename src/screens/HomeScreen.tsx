import {useNavigation} from '@react-navigation/native';
import React, {useEffect, useMemo, useState} from 'react';
import {Platform, RefreshControl, ScrollView, StyleSheet, View} from 'react-native';
import Animated, {
  Extrapolation,
  FadeInDown,
  LinearTransition,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Bars, Meter} from '../components/charts';
import {AnimatedAmount, Orbs, Pulse, Waveform} from '../components/motion';
import {AppIcon} from '../components/Brand';
import {toast} from '../components/Toast';
import {TxRow} from '../components/TxRow';
import {Button, Card, Chip, Gradient, Icon, IconBtn, T, Tap, useGridCell} from '../components/ui';
import {stopAll, useAnnouncer} from '../engine/announcer';
import {drainNow} from '../engine/service';
import {useNativeStatus} from '../hooks/useNativeStatus';
import {Soundbox} from '../native/Soundbox';
import {TAB_BAR_HEIGHT} from '../navigation/Tabs';
import {useData} from '../store/data';
import {useSettings} from '../store/settings';
import {ACCOUNT_PALETTE, useTheme} from '../theme';
import {compactMoney, fmtTime, groupIN, initials, money, PeriodId, periodRange, relTime} from '../utils/format';
import {byDay, groupBy, hourly, inRange, needsReview, party, summarize} from '../utils/stats';

const DASH_PERIODS: {id: PeriodId; label: string}[] = [
  {id: 'today', label: 'Today'},
  {id: 'yesterday', label: 'Yesterday'},
  {id: '7d', label: '7 days'},
  {id: '30d', label: '30 days'},
  {id: 'month', label: 'This month'},
  {id: 'prevMonth', label: 'Last month'},
];

const HERO_H = 300;

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

function SectionTitle({title, right}: {title: string; right?: React.ReactNode}) {
  return (
    <View style={{flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 28, marginBottom: 12, paddingHorizontal: 4}}>
      <T v="h3" style={{fontSize: 18, letterSpacing: -0.2}}>{title}</T>
      {right}
    </View>
  );
}

export function HomeScreen() {
  const {c, scheme, dark} = useTheme();
  const nav = useNavigation();
  const insets = useSafeAreaInsets();
  const txns = useData(s => s.txns);
  const accounts = useData(s => s.accounts);
  const lastId = useData(s => s.lastAnnouncedId);
  const mode = useSettings(s => s.mode);
  const businessName = useSettings(s => s.businessName);
  const ownerName = useSettings(s => s.ownerName);
  const active = useSettings(s => s.active);
  const pausedUntil = useSettings(s => s.pausedUntil);
  const showAmounts = useSettings(s => s.showAmounts);
  const set = useSettings(s => s.set);
  const speaking = useAnnouncer(s => s.speaking);
  const current = useAnnouncer(s => s.current);
  const {status, supported} = useNativeStatus();
  const business = mode === 'business';
  // Business watches today's collections; Personal watches the month's spending.
  const [period, setPeriod] = useState<PeriodId>(business ? 'today' : 'month');
  useEffect(() => setPeriod(business ? 'today' : 'month'), [business]);
  const [refreshing, setRefreshing] = useState(false);
  const quickW = useGridCell(5, 8);
  const tileW = useGridCell(2, 12);

  // ---- data
  const range = periodRange(period);
  const list = useMemo(() => inRange(txns, range.from, range.to), [txns, range.from, range.to]);
  const s = useMemo(() => summarize(list), [list]);
  const yesterday = useMemo(() => {
    const r = periodRange('yesterday');
    return summarize(inRange(txns, r.from, r.to));
  }, [txns]);
  const singleDay = period === 'today' || period === 'yesterday';
  const chart = useMemo(() => {
    if (singleDay) {
      const h = hourly(list);
      return {values: h, labels: h.map((_, i) => (i % 4 === 0 ? `${i % 12 || 12}${i < 12 ? 'a' : 'p'}` : null)), hi: period === 'today' ? new Date().getHours() : undefined};
    }
    const d = byDay(list, range.from, Math.min(range.to, Date.now()));
    return {values: d.map(x => x.received + x.refunds), labels: d.map((x, i) => (i % Math.ceil(d.length / 6) === 0 ? String(new Date(x.ts).getDate()) : null)), hi: d.length - 1};
  }, [list, singleDay, period, range.from, range.to]);
  const banks = useMemo(() => groupBy(list, t => ({key: t.accountId ?? t.bank ?? 'unknown', label: accounts.find(a => a.id === t.accountId)?.displayName ?? t.bank ?? 'Unassigned'})).slice(0, 5), [list, accounts]);
  const topSenders = useMemo(() => groupBy(list.filter(t => t.direction === 'credit'), t => (party(t) ? {key: party(t)!.toLowerCase(), label: party(t)!} : null)).slice(0, 4), [list]);
  const review = useMemo(() => txns.filter(t => needsReview(t, accounts.length > 0)).length, [txns, accounts.length]);
  const last = lastId ? txns.find(t => t.id === lastId) : undefined;

  const received = s.received + s.refunds;
  const prev = yesterday.received + yesterday.refunds;
  const delta = business && period === 'today' && prev > 0 ? Math.round(((received - prev) / prev) * 100) : undefined;
  // The hero's headline number depends on the mode.
  const heroValue = business ? received : s.sent;
  const heroLabel = business
    ? period === 'today' ? 'Collected today' : `Collected · ${range.label}`
    : period === 'month' ? 'Spent this month' : `Spent · ${range.label}`;

  // ---- soundbox state
  const paused = pausedUntil > Date.now();
  const state = !active ? 'off' : paused ? 'paused' : supported && status && !status.notificationAccess ? 'blocked' : 'live';
  const stateLabel = state === 'live' ? 'Live' : state === 'off' ? 'Off' : state === 'paused' ? 'Paused' : 'No access';
  const stateDot = state === 'live' ? '#6EE7B7' : state === 'off' ? '#FCA5A5' : '#FDE68A';

  const toggleActive = () => {
    if (state === 'blocked') return Soundbox.openNotificationAccess();
    if (paused) {
      set({pausedUntil: 0});
      return toast('Announcements resumed', 'success');
    }
    set({active: !active});
    toast(active ? 'Soundbox switched off' : 'Soundbox is live', active ? 'info' : 'success');
  };

  const onRefresh = async () => {
    setRefreshing(true);
    const n = await drainNow();
    setRefreshing(false);
    if (n) toast(`${n} new event${n > 1 ? 's' : ''} processed`, 'success');
  };

  // ---- scroll-linked motion: hero parallax + fade, compact header slides in
  const y = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler(e => {
    y.value = e.contentOffset.y;
  });
  // Background moves up at half the scroll speed (depth), stretches on pull-down, then fades away.
  const heroBg = useAnimatedStyle(() => ({
    opacity: interpolate(y.value, [HERO_H * 0.5, HERO_H * 1.05], [1, 0], Extrapolation.CLAMP),
    transform: [
      {translateY: interpolate(y.value, [-200, 0, HERO_H * 2], [0, 0, -HERO_H], Extrapolation.CLAMP)},
      {scale: interpolate(y.value, [-200, 0], [1.3, 1], Extrapolation.CLAMP)},
    ],
  }));
  const heroContent = useAnimatedStyle(() => ({
    opacity: interpolate(y.value, [0, HERO_H * 0.55], [1, 0], Extrapolation.CLAMP),
    transform: [
      {translateY: interpolate(y.value, [0, HERO_H], [0, HERO_H * 0.3], Extrapolation.CLAMP)},
      {scale: interpolate(y.value, [0, HERO_H * 0.6], [1, 0.92], Extrapolation.CLAMP)},
    ],
  }));
  const compact = useAnimatedStyle(() => ({
    opacity: interpolate(y.value, [HERO_H - 150, HERO_H - 90], [0, 1], Extrapolation.CLAMP),
    transform: [{translateY: interpolate(y.value, [HERO_H - 150, HERO_H - 90], [-16, 0], Extrapolation.CLAMP)}],
  }));

  const hidden = (v: string) => (showAmounts ? v : '••••');
  const name = mode === 'business' ? businessName || 'Your shop' : ownerName || 'Your money';

  const quick = [
    paused
      ? {icon: 'play', label: 'Resume', tint: c.success, onPress: () => set({pausedUntil: 0})}
      : {icon: 'pause', label: 'Pause 1h', tint: '#F59E0B', onPress: () => { set({pausedUntil: Date.now() + 3600000}); toast('Paused for 1 hour'); }},
    {icon: 'plus', label: 'Add entry', tint: '#10B981', onPress: () => nav.navigate('ManualEntry')},
    mode === 'business'
      ? {icon: 'store-check-outline', label: 'Day close', tint: '#0EA5E9', onPress: () => nav.navigate('DailyClosing')}
      : {icon: 'chart-pie', label: 'Insights', tint: '#0EA5E9', onPress: () => nav.navigate('DailyClosing')},
    {icon: 'account-voice', label: 'Voice', tint: c.primary, onPress: () => nav.navigate('VoiceStudio')},
    {icon: 'translate', label: 'Translate', tint: '#8B5CF6', onPress: () => nav.navigate('Translate')},
  ];

  const tiles = [
    {label: 'Largest payment', value: hidden(money(s.largest)), icon: 'trophy-outline', color: '#F59E0B'},
    {label: 'Avg. payment', value: hidden(money(Math.round(s.avgTicket))), icon: 'chart-line-variant', color: '#8B5CF6'},
    {label: 'Refunds', value: hidden(money(s.refunds)), icon: 'cash-refund', color: '#0EA5E9'},
    {label: 'Pending / failed', value: String(s.pending + s.failed), icon: 'clock-alert-outline', color: c.warning},
  ];

  return (
    <View style={{flex: 1, backgroundColor: c.bg}}>
      {/* Hero background lives behind the scroll content for the parallax effect. */}
      <Animated.View style={[{position: 'absolute', top: 0, left: 0, right: 0, height: HERO_H + insets.top + 40, borderBottomLeftRadius: 36, borderBottomRightRadius: 36, overflow: 'hidden'}, heroBg]}>
        <Gradient colors={dark ? [scheme.gradient[0], scheme.gradient[1], c.bg] : scheme.gradient} angle={110} style={StyleSheet.absoluteFill} />
        <Orbs colors={[scheme.secondary, scheme.gradient[0]]} />
        <Gradient colors={['transparent', dark ? 'rgba(7,8,15,0.55)' : 'rgba(0,0,0,0.12)']} angle={90} style={{position: 'absolute', left: 0, right: 0, bottom: 0, height: 120}} />
      </Animated.View>

      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{paddingBottom: insets.bottom + TAB_BAR_HEIGHT + 48}}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" colors={[c.primary]} progressViewOffset={insets.top + 20} />}>
        {/* ---------- Hero ---------- */}
        <Animated.View style={[{paddingTop: insets.top + 14, paddingHorizontal: 20, height: HERO_H + insets.top - 60}, heroContent]}>
          <View style={{flexDirection: 'row', alignItems: 'center'}}>
            <View style={{width: 44, height: 44, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.18)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)', alignItems: 'center', justifyContent: 'center', marginRight: 12}}>
              {mode === 'business' && !businessName ? <Icon name="storefront" size={22} color="#fff" /> : <T v="h3" color="#fff">{initials(name)}</T>}
            </View>
            <View style={{flex: 1}}>
              <T v="small" color="rgba(255,255,255,0.75)">{greeting()}</T>
              <T v="h3" color="#fff" numberOfLines={1} style={{fontSize: 18}}>{name}</T>
            </View>
            <Tap onPress={toggleActive} style={{flexDirection: 'row', alignItems: 'center', paddingRight: 14, paddingLeft: 2, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.16)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)'}}>
              <Pulse color={stateDot} size={8} active={state === 'live'} />
              <T v="small" color="#fff" style={{fontWeight: '800'}}>{stateLabel}</T>
            </Tap>
            <View style={{width: 8}} />
            <IconBtn name="bell-outline" onPress={() => nav.navigate('Reminders')} bg="rgba(255,255,255,0.16)" color="#fff" size={38} iconSize={19} />
            <View style={{width: 8}} />
            <IconBtn name={showAmounts ? 'eye-outline' : 'eye-off-outline'} onPress={() => set({showAmounts: !showAmounts})} bg="rgba(255,255,255,0.16)" color="#fff" size={38} iconSize={19} />
          </View>

          <View style={{marginTop: 28}}>
            <T v="small" color="rgba(255,255,255,0.78)" style={{letterSpacing: 0.3}}>
              {heroLabel}
            </T>
            <View style={{flexDirection: 'row', alignItems: 'flex-start', marginTop: 4}}>
              <T color="#fff" style={{fontSize: 28, fontWeight: '700', marginTop: 8, marginRight: 4, opacity: 0.9}}>₹</T>
              {showAmounts ? (
                <AnimatedAmount value={heroValue} prefix="" style={{fontSize: 52, fontWeight: '900', color: '#fff', letterSpacing: -1.5}} />
              ) : (
                <T color="#fff" style={{fontSize: 52, fontWeight: '900'}}>••••••</T>
              )}
            </View>
            <View style={{flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8}}>
              {delta !== undefined && (
                <View style={{flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: delta >= 0 ? 'rgba(110,231,183,0.22)' : 'rgba(252,165,165,0.22)'}}>
                  <Icon name={delta >= 0 ? 'trending-up' : 'trending-down'} size={14} color={delta >= 0 ? '#A7F3D0' : '#FECACA'} />
                  <T v="tiny" color={delta >= 0 ? '#D1FAE5' : '#FEE2E2'}>{Math.abs(delta)}% vs yesterday</T>
                </View>
              )}
              {!business && (
                <View style={{flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: 'rgba(110,231,183,0.22)'}}>
                  <Icon name="arrow-bottom-left" size={13} color="#A7F3D0" />
                  <T v="tiny" color="#D1FAE5">{hidden(compactMoney(received))} received</T>
                </View>
              )}
              <T v="small" color="rgba(255,255,255,0.75)">
                {business ? `${s.creditCount} payment${s.creditCount === 1 ? '' : 's'}` : `${s.debitCount} payment${s.debitCount === 1 ? '' : 's'} made`}
              </T>
            </View>
          </View>
        </Animated.View>

        <View style={{paddingHorizontal: 16}}>
          {/* ---------- Glass metrics strip (overlaps the hero) ---------- */}
          <Animated.View entering={FadeInDown.delay(80).springify().damping(18)}>
            <Card padded={false} style={{flexDirection: 'row', paddingVertical: 16, borderRadius: 24}}>
              {[
                {label: 'Received', value: hidden(compactMoney(received)), color: c.success, icon: 'arrow-bottom-left'},
                {label: 'Sent', value: hidden(compactMoney(s.sent)), color: c.danger, icon: 'arrow-top-right'},
                {label: 'Net', value: hidden(compactMoney(s.net)), color: c.primary, icon: 'scale-balance'},
              ].map((m, i) => (
                <View key={m.label} style={{flex: 1, alignItems: 'center', borderLeftWidth: i ? StyleSheet.hairlineWidth : 0, borderLeftColor: c.border}}>
                  <View style={{flexDirection: 'row', alignItems: 'center', gap: 4}}>
                    <Icon name={m.icon} size={13} color={m.color} />
                    <T v="tiny" mute>{m.label.toUpperCase()}</T>
                  </View>
                  <T v="h3" style={{marginTop: 6, fontSize: 18, fontVariant: ['tabular-nums']}}>{m.value}</T>
                </View>
              ))}
            </Card>
          </Animated.View>

          {/* ---------- Now speaking / last announced ---------- */}
          <Animated.View entering={FadeInDown.delay(140).springify().damping(18)} layout={LinearTransition.springify()} style={{marginTop: 12}}>
            <Card style={{flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 22}}>
              <Gradient colors={speaking ? [c.success, '#059669'] : [c.primary, scheme.secondary]} style={{width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center'}}>
                <Icon name={speaking ? 'volume-high' : 'bullhorn-variant-outline'} size={22} color="#fff" />
              </Gradient>
              <View style={{flex: 1}}>
                <T v="tiny" mute style={{letterSpacing: 0.6}}>{speaking ? 'ANNOUNCING NOW' : 'LAST ANNOUNCED'}</T>
                <T v="body" style={{fontWeight: '700', marginTop: 2}} numberOfLines={2}>
                  {speaking ? current : last ? `${hidden(money(last.amount))}${party(last) ? ` · ${party(last)}` : ''}` : 'Waiting for the first payment'}
                </T>
                {!speaking && last?.announce.at ? <T v="small" mute>{relTime(last.announce.at)}</T> : null}
              </View>
              {speaking ? (
                <Tap onPress={() => stopAll()}>
                  <Waveform active color={c.success} bars={6} height={26} />
                </Tap>
              ) : (
                <Pulse color={state === 'live' ? c.success : c.textMute} size={8} active={state === 'live'} />
              )}
            </Card>
          </Animated.View>

          {/* ---------- Attention ---------- */}
          {state === 'blocked' && (
            <Animated.View entering={FadeInDown.springify()} layout={LinearTransition.springify()}>
              <Tap onPress={() => Soundbox.openNotificationAccess()} style={{marginTop: 12, padding: 14, borderRadius: 20, backgroundColor: c.warningSoft, flexDirection: 'row', alignItems: 'center', gap: 12}}>
                <Icon name="bell-alert" size={24} color={c.warning} />
                <View style={{flex: 1}}>
                  <T v="body" style={{fontWeight: '700'}}>Notification access is off</T>
                  <T v="small" dim>UPI app alerts can’t be detected. Tap to allow.</T>
                </View>
                <Icon name="chevron-right" color={c.warning} />
              </Tap>
            </Animated.View>
          )}
          {Platform.OS === 'ios' && (
            <Card alt style={{marginTop: 12}}>
              <T v="small" dim>iPhone mode: add transactions manually or import statements. Automatic alert reading is Android-only.</T>
            </Card>
          )}
          {review > 0 && (
            <Animated.View entering={FadeInDown.springify()} layout={LinearTransition.springify()}>
              <Tap onPress={() => nav.navigate('Unknown')} style={{marginTop: 12, borderRadius: 20, overflow: 'hidden'}}>
                <Gradient colors={['#F59E0B', '#F97316']} angle={0} style={{padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12}}>
                  <View style={{width: 36, height: 36, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center'}}>
                    <Icon name="eye-check-outline" size={20} color="#fff" />
                  </View>
                  <View style={{flex: 1}}>
                    <T v="body" color="#fff" style={{fontWeight: '800'}}>{review} to review</T>
                    <T v="small" color="rgba(255,255,255,0.88)">Unverified senders or unmatched accounts</T>
                  </View>
                  <Icon name="chevron-right" color="#fff" />
                </Gradient>
              </Tap>
            </Animated.View>
          )}

          {/* ---------- Quick actions ---------- */}
          <Animated.View layout={LinearTransition.springify()} style={{flexDirection: 'row', gap: 8, marginTop: 18}}>
            {quick.map((q, i) => (
              <Animated.View key={q.label} entering={FadeInDown.delay(180 + i * 50).springify().damping(16)}>
                <Tap onPress={q.onPress} style={{width: quickW, alignItems: 'center', paddingVertical: 14, borderRadius: 20, backgroundColor: c.card, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border}}>
                  <View style={{width: 44, height: 44, borderRadius: 15, backgroundColor: q.tint + '22', alignItems: 'center', justifyContent: 'center'}}>
                    <Icon name={q.icon} size={22} color={q.tint} />
                  </View>
                  <T v="tiny" dim style={{marginTop: 8, letterSpacing: 0.2}} numberOfLines={1}>{q.label}</T>
                </Tap>
              </Animated.View>
            ))}
          </Animated.View>

          {/* ---------- Activity ---------- */}
          <SectionTitle title="Activity" right={<T v="small" mute>{range.label}</T>} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginHorizontal: -16}} contentContainerStyle={{gap: 8, paddingHorizontal: 16}}>
            {DASH_PERIODS.map(p => (
              <Chip key={p.id} label={p.label} active={period === p.id} onPress={() => setPeriod(p.id)} />
            ))}
          </ScrollView>
          <Card style={{marginTop: 12, borderRadius: 24}}>
            <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14}}>
              <View>
                <T v="tiny" mute style={{letterSpacing: 0.6}}>{business ? (singleDay ? 'HOURLY COLLECTIONS' : 'DAILY COLLECTIONS') : singleDay ? 'MONEY IN BY HOUR' : 'MONEY IN BY DAY'}</T>
                <T v="h2" style={{marginTop: 4, fontVariant: ['tabular-nums']}}>{hidden(money(received))}</T>
              </View>
              <View style={{alignItems: 'flex-end'}}>
                <T v="tiny" mute style={{letterSpacing: 0.6}}>PAYMENTS</T>
                <T v="h3" style={{marginTop: 4}}>{s.creditCount}</T>
              </View>
            </View>
            <Bars values={chart.values} labels={chart.labels} highlightIndex={chart.hi} height={120} showMax={false} />
          </Card>

          {/* ---------- Insight tiles (exact 2-column grid) ---------- */}
          <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 12}}>
            {tiles.map((x, i) => (
              <Animated.View key={x.label} entering={FadeInDown.delay(80 + i * 60).springify().damping(18)}>
                <Card style={{width: tileW, padding: 16, borderRadius: 22}}>
                  <View style={{width: 36, height: 36, borderRadius: 12, backgroundColor: x.color + '22', alignItems: 'center', justifyContent: 'center'}}>
                    <Icon name={x.icon} size={19} color={x.color} />
                  </View>
                  <T v="h3" style={{marginTop: 14, fontSize: 19, fontVariant: ['tabular-nums']}} numberOfLines={1} adjustsFontSizeToFit>{x.value}</T>
                  <T v="small" mute style={{marginTop: 2}}>{x.label}</T>
                </Card>
              </Animated.View>
            ))}
          </View>

          {/* ---------- Bank-wise ---------- */}
          {banks.length > 0 && (
            <>
              <SectionTitle title="Bank-wise" />
              <Card style={{borderRadius: 24}}>
                {banks.map((b, i) => {
                  const max = banks[0].received + banks[0].sent || 1;
                  const color = ACCOUNT_PALETTE[i % ACCOUNT_PALETTE.length];
                  return (
                    <View key={b.key} style={{marginBottom: i < banks.length - 1 ? 16 : 0}}>
                      <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 8}}>
                        <View style={{width: 30, height: 30, borderRadius: 10, backgroundColor: color + '22', alignItems: 'center', justifyContent: 'center', marginRight: 10}}>
                          <Icon name="bank-outline" size={16} color={color} />
                        </View>
                        <View style={{flex: 1}}>
                          <T v="body" style={{fontWeight: '700'}} numberOfLines={1}>{b.label}</T>
                          <T v="tiny" mute>{b.count} txns{b.sent ? ` · sent ₹${groupIN(b.sent, 0)}` : ''}</T>
                        </View>
                        <T v="body" style={{fontWeight: '800', fontVariant: ['tabular-nums']}}>{hidden(`₹${groupIN(b.received, 0)}`)}</T>
                      </View>
                      <Meter ratio={(b.received + b.sent) / max} color={color} />
                    </View>
                  );
                })}
              </Card>
            </>
          )}

          {/* ---------- Top customers ---------- */}
          {topSenders.length > 0 && (
            <>
              <SectionTitle title={mode === 'business' ? 'Top customers' : 'Top senders'} />
              <Card padded={false} style={{borderRadius: 24, paddingVertical: 6}}>
                {topSenders.map((p, i) => (
                  <View key={p.key} style={{flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 16, gap: 12}}>
                    <Gradient colors={[ACCOUNT_PALETTE[i % ACCOUNT_PALETTE.length], ACCOUNT_PALETTE[(i + 3) % ACCOUNT_PALETTE.length]]} style={{width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center'}}>
                      <T v="small" color="#fff" style={{fontWeight: '800'}}>{initials(p.label)}</T>
                    </Gradient>
                    <View style={{flex: 1}}>
                      <T v="body" style={{fontWeight: '700'}} numberOfLines={1}>{p.label}</T>
                      <T v="tiny" mute>{p.count} payment{p.count > 1 ? 's' : ''}</T>
                    </View>
                    <T v="body" color={c.success} style={{fontWeight: '800'}}>{hidden(money(p.received))}</T>
                  </View>
                ))}
              </Card>
            </>
          )}

          {/* ---------- Recent ---------- */}
          <SectionTitle title="Recent" right={list.length > 0 ? <T v="small" color={c.primary} style={{fontWeight: '700'}}>{list.length} in {range.label.toLowerCase()}</T> : undefined} />
          {list.length === 0 ? (
            <Card style={{alignItems: 'center', paddingVertical: 28, borderRadius: 24}}>
              <Gradient colors={[c.primary, scheme.secondary]} style={{width: 64, height: 64, borderRadius: 22, alignItems: 'center', justifyContent: 'center'}}>
                <Icon name="speaker-wireless" size={30} color="#fff" />
              </Gradient>
              <T v="h3" style={{marginTop: 16}}>Ready for payments</T>
              <T v="small" dim style={{textAlign: 'center', marginTop: 6, marginHorizontal: 18, lineHeight: 19}}>
                Bank SMS and UPI alerts will be announced and listed here.
              </T>
              <Button small title="Try a demo payment" icon="play-circle-outline" onPress={() => nav.navigate('Simulator')} style={{marginTop: 18}} />
            </Card>
          ) : (
            <Card padded={false} style={{borderRadius: 24, paddingHorizontal: 16, paddingVertical: 4}}>
              {list.slice(0, 8).map((t, i) => (
                <Animated.View key={t.id} entering={FadeInDown.delay(i * 40)} layout={LinearTransition.springify()}>
                  <TxRow t={t} onPress={() => nav.navigate('TxDetail', {id: t.id})} />
                </Animated.View>
              ))}
            </Card>
          )}
          <T v="tiny" mute style={{textAlign: 'center', marginTop: 20, lineHeight: 16}}>
            Totals are from payment alerts on this phone{status?.lastEventAt ? ` · last alert ${fmtTime(status.lastEventAt)}` : ''}.{'\n'}Not your bank balance.
          </T>
        </View>
      </Animated.ScrollView>

      {/* ---------- Compact sticky header ---------- */}
      <Animated.View pointerEvents="none" style={[{position: 'absolute', top: 0, left: 0, right: 0, paddingTop: insets.top + 8, paddingBottom: 12, paddingHorizontal: 20, backgroundColor: c.bg, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border, flexDirection: 'row', alignItems: 'center'}, compact]}>
        <AppIcon size={34} style={{marginRight: 12}} />
        <View style={{flex: 1}}>
          <T v="tiny" mute style={{letterSpacing: 0.6}}>{heroLabel.toUpperCase()}</T>
          <T v="h3" style={{fontSize: 20, fontVariant: ['tabular-nums']}}>{hidden(money(heroValue))}</T>
        </View>
        <View style={{flexDirection: 'row', alignItems: 'center', paddingRight: 12, height: 32, borderRadius: 16, backgroundColor: c.cardAlt}}>
          <Pulse color={state === 'live' ? c.success : c.warning} size={7} active={state === 'live'} />
          <T v="small" style={{fontWeight: '800'}}>{stateLabel}</T>
        </View>
      </Animated.View>
    </View>
  );
}
