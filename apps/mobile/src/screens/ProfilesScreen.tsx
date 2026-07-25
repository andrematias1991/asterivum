import React, { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MainTabsParamList, RootStackParamList } from '../navigation';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { useLanguage } from '../LanguageContext';
import type { Chart, Profile } from '../types';
import { Button, Card, ScreenTitle } from '../components/UI';
import { colors } from '../theme';

type Navigation = CompositeNavigationProp<BottomTabNavigationProp<MainTabsParamList, 'Profiles'>, NativeStackNavigationProp<RootStackParamList>>;

export function ProfilesScreen({ navigation }: { navigation: Navigation }) {
  const { user, logout } = useAuth();
  const { language, t } = useLanguage();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true); setError('');
    try { setProfiles((await api<{ profiles: Profile[] }>('/profiles', { authenticated: true, language })).profiles); }
    catch (cause) { setError(cause instanceof Error ? cause.message : t('error')); }
    finally { setLoading(false); }
  }, [language, t, user]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const open = async (profile: Profile) => {
    setLoading(true); setError('');
    try {
      const result = await api<{ chart: Chart }>(`/charts/${profile.id}?mode=NATAL`, { authenticated: true, language });
      navigation.navigate('ChartResult', { chart: result.chart, profile });
    } catch (cause) { setError(cause instanceof Error ? cause.message : t('error')); }
    finally { setLoading(false); }
  };

  if (!user) return <ScrollView contentContainerStyle={styles.page}><ScreenTitle eyebrow={t('guest')} title={t('profiles')} body={t('locked')} /><Button title={t('signIn')} onPress={() => navigation.navigate('Auth', { mode: 'login' })} /><Button title={t('signUp')} variant="secondary" onPress={() => navigation.navigate('Auth', { mode: 'register' })} /></ScrollView>;
  return <ScrollView contentContainerStyle={styles.page}>
    <ScreenTitle eyebrow={user.email} title={t('profiles')} body={t('accountBenefit')} />
    {loading && <ActivityIndicator color={colors.gold} />}{!!error && <Text style={styles.error}>{error}</Text>}
    {!loading && !profiles.length && <Card><Text style={styles.empty}>{t('noProfiles')}</Text></Card>}
    {profiles.map(profile => <Card key={profile.id}>
      <View style={styles.profileHead}><View style={styles.badge}><Text style={styles.badgeText}>ASC</Text></View><View style={styles.flex}><Text style={styles.name}>{profile.name}</Text><Text style={styles.meta}>{profile.birthDate} · {profile.birthTime}</Text><Text style={styles.meta}>{profile.place}</Text></View></View>
      <Button title={t('chart')} variant="ghost" onPress={() => open(profile)} />
    </Card>)}
    <Button title={t('createChart')} variant="secondary" onPress={() => navigation.navigate('CreateChart')} />
    <Button title={t('signOut')} variant="ghost" onPress={logout} />
  </ScrollView>;
}

const styles = StyleSheet.create({
  page: { backgroundColor: colors.cream, flexGrow: 1, padding: 16, paddingBottom: 38 }, error: { color: colors.red, marginBottom: 10 }, empty: { color: colors.muted }, profileHead: { flexDirection: 'row', gap: 13, alignItems: 'center' }, badge: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.goldSoft }, badgeText: { color: colors.ink, fontSize: 10, fontWeight: '800' }, flex: { flex: 1 }, name: { color: colors.ink, fontSize: 18, fontFamily: 'serif', fontWeight: '700' }, meta: { color: colors.muted, fontSize: 11, marginTop: 3 },
});
