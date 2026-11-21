import type {NativeStackScreenProps} from '@react-navigation/native-stack';

export type RootStack = {
  Onboarding: undefined;
  Main: undefined;
  TxDetail: {id: string};
  VoiceStudio: undefined;
  Translate: undefined;
  Accounts: undefined;
  AccountEdit: {id?: string};
  Sources: undefined;
  Unknown: undefined;
  ManualEntry: undefined;
  Import: undefined;
  Diagnostics: undefined;
  Appearance: undefined;
  Announcements: undefined;
  Privacy: undefined;
  DailyClosing: undefined;
  Simulator: undefined;
  About: undefined;
  Reminders: undefined;
};

export type ScreenProps<K extends keyof RootStack> = NativeStackScreenProps<RootStack, K>;

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStack {}
  }
}
