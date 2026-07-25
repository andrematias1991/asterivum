import type { Chart, Profile } from './types';

export type RootStackParamList = {
  Main: undefined;
  CreateChart: { profile?: Profile } | undefined;
  ChartResult: { chart: Chart; profile: Profile };
  Auth: { mode?: 'login' | 'register' } | undefined;
};

export type MainTabsParamList = { Home: undefined; Ephemeris: undefined; Profiles: undefined };

