import type {NativeStackNavigationOptions} from '@react-navigation/native-stack';
import type React from 'react';
import type {RootStack} from '../navigation/types';
import {AccountEditScreen, AccountsScreen} from './AccountsScreens';
import {ImportScreen, ManualEntryScreen, SourcesScreen, UnknownScreen} from './DataScreens';
import {
  AboutScreen,
  AnnouncementsScreen,
  AppearanceScreen,
  DailyClosingScreen,
  DiagnosticsScreen,
  PrivacyScreen,
  SimulatorScreen,
} from './MoreScreens';
import {TxDetailScreen} from './TxDetailScreen';
import {VoiceStudioScreen} from './VoiceStudioScreen';
import {TranslateScreen} from './TranslateScreen';
import {RemindersScreen} from './RemindersScreen';

export const screens: {name: Exclude<keyof RootStack, 'Main' | 'Onboarding'>; component: React.ComponentType<any>; options?: NativeStackNavigationOptions}[] = [
  {name: 'TxDetail', component: TxDetailScreen},
  {name: 'VoiceStudio', component: VoiceStudioScreen},
  {name: 'Translate', component: TranslateScreen},
  {name: 'Accounts', component: AccountsScreen},
  {name: 'AccountEdit', component: AccountEditScreen, options: {animation: 'slide_from_bottom'}},
  {name: 'Sources', component: SourcesScreen},
  {name: 'Unknown', component: UnknownScreen},
  {name: 'ManualEntry', component: ManualEntryScreen, options: {animation: 'slide_from_bottom'}},
  {name: 'Import', component: ImportScreen},
  {name: 'Diagnostics', component: DiagnosticsScreen},
  {name: 'Appearance', component: AppearanceScreen},
  {name: 'Announcements', component: AnnouncementsScreen},
  {name: 'Privacy', component: PrivacyScreen},
  {name: 'DailyClosing', component: DailyClosingScreen},
  {name: 'Simulator', component: SimulatorScreen},
  {name: 'About', component: AboutScreen},
  {name: 'Reminders', component: RemindersScreen, options: {animation: 'slide_from_bottom'}},
];
