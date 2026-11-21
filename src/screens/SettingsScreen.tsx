import {useNavigation} from '@react-navigation/native';
import React, {useState} from 'react';
import {Platform, ScrollView, View} from 'react-native';
import Animated, {FadeInDown} from 'react-native-reanimated';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Orbs} from '../components/motion';
import {APP_NAME, APP_VERSION, AppIcon} from '../components/Brand';
import {Field} from '../components/AccountForm';
import {Sheet} from '../components/Sheet';
import {toast} from '../components/Toast';
import {Button, Gradient, Group, Icon, Row, Segmented, T, Tap, Toggle} from '../components/ui';
import {useNativeStatus} from '../hooks/useNativeStatus';
import {TAB_BAR_HEIGHT} from '../navigation/Tabs';
import {useData} from '../store/data';
import {MODE_INFO, switchMode, useSettings} from '../store/settings';
import {SCHEMES, useTheme} from '../theme';
import {needsReview} from '../utils/stats';
import {LANGS, PERSONAS} from '../voice/presets';

export function SettingsScreen() {
  const {c, scheme} = useTheme();
  const nav = useNavigation();
  const insets = useSafeAreaInsets();
  const st = useSettings();
  const accounts = useData(s => s.accounts);
  const txns = useData(s => s.txns);
  const {status, supported} = useNativeStatus(6000);
  const review = txns.filter(t => needsReview(t, accounts.length > 0)).length;
  const enabledSources = Object.values(st.sources).filter(Boolean).length;
  const persona = PERSONAS.find(p => p.id === st.voice.personaId);
  const [nameOpen, setNameOpen] = useState(false);
  const [name, setName] = useState('');
  const openName = () => {
    setName(st.mode === 'business' ? st.businessName : st.ownerName);
    setNameOpen(true);
  };
  const saveName = () => {
    st.set(st.mode === 'business' ? {businessName: name.trim()} : {ownerName: name.trim()});
    setNameOpen(false);
  };

  const groups = [
    {
      title: 'Soundbox',
      rows: [
        <Row key="a" icon="power" iconColor={st.active ? c.success : c.danger} title="Soundbox active" subtitle={st.active ? 'Announcing supported payments' : 'Payments are recorded silently'} right={<Toggle value={st.active} onChange={active => st.set({active})} />} />,
        <Row key="k" icon="lightning-bolt-outline" iconColor={st.keepAlive ? c.success : c.warning} title="Always on" subtitle={st.keepAlive ? 'Keeps running even when swiped away · instant announcements' : 'May stop when the app is closed and announce late'} right={<Toggle value={st.keepAlive} onChange={keepAlive => st.set({keepAlive})} />} />,
        <Row key="v" icon="account-voice" title="Voice Studio" subtitle={`${LANGS.find(l => l.id === st.language)?.native} · ${persona?.name ?? 'Custom'} · pitch ${st.voice.pitch.toFixed(2)}`} onPress={() => nav.navigate('VoiceStudio')} />,
        <Row key="tr" icon="translate" title="Translate" subtitle="English ⇄ தமிழ் ⇄ हिन्दी · online & offline" onPress={() => nav.navigate('Translate')} />,
        <Row key="r" icon="bullhorn-variant-outline" title="Announcement rules" subtitle={`${[st.announce.credit && 'Credits', st.announce.debit && 'Debits', st.announce.refund && 'Refunds'].filter(Boolean).join(', ') || 'Nothing'}${st.quiet.enabled ? ` · quiet ${st.quiet.start}–${st.quiet.end}` : ''}`} onPress={() => nav.navigate('Announcements')} />,
        <Row key="s" icon="apps" title="Payment sources" subtitle={`${enabledSources} enabled${supported && status && !status.notificationAccess ? ' · access needed' : ''}`} onPress={() => nav.navigate('Sources')} right={supported && status && !status.notificationAccess ? <Icon name="alert-circle" color={c.warning} /> : undefined} />,
        <Row key="b" icon="bank" title="Bank accounts" subtitle={accounts.length ? `${accounts.length} configured` : 'None yet — add one for account matching'} onPress={() => nav.navigate('Accounts')} last />,
      ],
    },
    {
      title: 'Transactions',
      rows: [
        <Row key="u" icon="help-circle-outline" iconColor={c.warning} title="Review queue" subtitle="Unknown & unassigned transactions" onPress={() => nav.navigate('Unknown')} right={review ? <View style={{backgroundColor: c.warning, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2}}><T v="tiny" color="#fff">{review}</T></View> : undefined} />,
        <Row key="m" icon="plus-circle-outline" title="Add transaction manually" onPress={() => nav.navigate('ManualEntry')} />,
        <Row key="i" icon="file-import-outline" title="Import statement" subtitle="CSV from your bank or another export" onPress={() => nav.navigate('Import')} />,
        <Row key="d" icon="flask-outline" title="Try with sample payments" subtitle="Simulate notifications to test voice & reports" onPress={() => nav.navigate('Simulator')} last />,
      ],
    },
    {
      title: 'Personalise',
      rows: [
        <Row key="t" icon="palette-outline" title="Appearance" subtitle={`${SCHEMES.find(s => s.id === st.scheme)?.name} · ${st.theme === 'system' ? 'System theme' : st.theme === 'dark' ? 'Dark' : 'Light'}`} onPress={() => nav.navigate('Appearance')} />,
        <Row key="h" icon="vibrate" title="Haptic feedback" right={<Toggle value={st.haptics} onChange={haptics => st.set({haptics})} />} />,
        <Row key="e" icon="eye-off-outline" title="Hide amounts on screen" subtitle="For counters where customers can see the phone" right={<Toggle value={!st.showAmounts} onChange={v => st.set({showAmounts: !v})} />} last />,
      ],
    },
    {
      title: 'Privacy & support',
      rows: [
        <Row key="p" icon="shield-lock-outline" title="Privacy & security" subtitle={`${st.appLock ? 'App lock on' : 'App lock off'} · ${st.retentionDays ? `keep ${st.retentionDays} days` : 'keep forever'}`} onPress={() => nav.navigate('Privacy')} />,
        <Row key="g" icon="stethoscope" title="Diagnostics & health" subtitle={supported ? (status?.listenerConnected ? 'Listener connected' : 'Listener not connected') : 'Manual mode'} onPress={() => nav.navigate('Diagnostics')} />,
        <Row key="ab" icon="information-outline" title="About RubyAlert" onPress={() => nav.navigate('About')} last />,
      ],
    },
  ];

  return (
    <ScrollView style={{flex: 1, backgroundColor: c.bg}} contentContainerStyle={{paddingTop: insets.top + 8, paddingBottom: insets.bottom + TAB_BAR_HEIGHT + 40, paddingHorizontal: 16}}>
      <T v="h1" style={{marginHorizontal: 4, marginBottom: 16}}>Settings</T>

      <Animated.View entering={FadeInDown.springify()}>
        <Gradient colors={scheme.gradient} style={{borderRadius: 26, padding: 18, overflow: 'hidden', marginBottom: 22}}>
          <Orbs colors={['#ffffff', scheme.secondary]} />
          <View style={{flexDirection: 'row', alignItems: 'center', gap: 14}}>
            <View style={{width: 56, height: 56, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center'}}>
              <Icon name={st.mode === 'business' ? 'storefront' : 'account'} size={30} color="#fff" />
            </View>
            <Tap onPress={openName} style={{flex: 1}}>
              <View style={{flexDirection: 'row', alignItems: 'center', gap: 6}}>
                <T v="h2" color="#fff" numberOfLines={1} style={{flexShrink: 1}}>{st.mode === 'business' ? st.businessName || 'Add business name' : st.ownerName || 'Add your name'}</T>
                <Icon name="pencil-outline" size={18} color="rgba(255,255,255,0.85)" />
              </View>
              <T v="small" color="rgba(255,255,255,0.85)">
                {txns.length} transactions · {accounts.length} accounts · {Platform.OS === 'android' ? 'Android' : 'iOS'}
              </T>
            </Tap>
          </View>
          <View style={{marginTop: 16}}>
            <Segmented
              glass
              value={st.mode}
              onChange={mode => {
                switchMode(mode);
                toast(`${MODE_INFO[mode].title} mode`, 'success', MODE_INFO[mode].text);
              }}
              options={[
                {id: 'business', label: 'Business', icon: 'storefront-outline'},
                {id: 'personal', label: 'Personal', icon: 'account-outline'},
              ]}
            />
          </View>
          <Animated.View key={st.mode} entering={FadeInDown.springify()} style={{flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12}}>
            <Icon name="information-outline" size={16} color="rgba(255,255,255,0.85)" />
            <T v="small" color="rgba(255,255,255,0.9)" style={{flex: 1}}>{MODE_INFO[st.mode].text}</T>
          </Animated.View>
        </Gradient>
      </Animated.View>

      <Sheet visible={nameOpen} onClose={() => setNameOpen(false)} title={st.mode === 'business' ? 'Business name' : 'Your name'}>
        <Field label={st.mode === 'business' ? 'Shown on Home and in daily closing reports' : 'Shown on Home'} value={name} onChangeText={setName} autoFocus placeholder={st.mode === 'business' ? 'Sri Murugan Stores' : 'Karthi'} />
        <Button title="Save" icon="check" onPress={saveName} style={{marginBottom: 8}} />
      </Sheet>

      {groups.map((g, i) => (
        <Animated.View key={g.title} entering={FadeInDown.delay(80 + i * 70).springify()}>
          <Group title={g.title}>{g.rows}</Group>
        </Animated.View>
      ))}
      <View style={{alignItems: 'center', gap: 8, paddingTop: 4}}>
        <AppIcon size={40} />
        <T v="tiny" mute style={{textAlign: 'center'}}>{APP_NAME} {APP_VERSION} · works offline · data never leaves this phone</T>
      </View>
    </ScrollView>
  );
}
