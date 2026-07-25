import React, { useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation';
import { api } from '../api';
import { useLanguage } from '../LanguageContext';
import type { Chart, LocationResult, Profile } from '../types';
import { Button, Card, Field, ScreenTitle, Segmented } from '../components/UI';
import { colors } from '../theme';
import { isCompleteProfile } from '../domain';

const defaultProfile = (): Profile => ({ name: '', birthDate: '', birthTime: '', place: '', latitude: 0, longitude: 0, timezone: 0, timezoneId: null, houseSystem: 'PLACIDUS', zodiac: 'TROPICAL', notes: '', isPrimary: false });

export function CreateChartScreen({ navigation, route }: NativeStackScreenProps<RootStackParamList, 'CreateChart'>) {
  const [profile, setProfile] = useState<Profile>(route.params?.profile || defaultProfile);
  const [locationText, setLocationText] = useState(profile.place);
  const [locations, setLocations] = useState<LocationResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const selectedLocation = useRef(!!profile.timezoneId);
  const { t } = useLanguage();

  useEffect(() => {
    if (selectedLocation.current || locationText.trim().length < 3) { setLocations([]); return; }
    const timeout = setTimeout(async () => {
      try { setLocations((await api<{ results: LocationResult[] }>(`/locations/search?q=${encodeURIComponent(locationText.trim())}`)).results); }
      catch { setLocations([]); }
    }, 350);
    return () => clearTimeout(timeout);
  }, [locationText]);

  useEffect(() => {
    if (!profile.timezoneId || !/^\d{4}-\d{2}-\d{2}$/.test(profile.birthDate) || !/^\d{2}:\d{2}$/.test(profile.birthTime)) return;
    let active = true;
    api<{ offset: number }>('/locations/offset', {
      method: 'POST',
      body: JSON.stringify({ date: profile.birthDate, time: profile.birthTime, timezoneId: profile.timezoneId }),
    }).then(({ offset }) => {
      if (active) setProfile(current => ({ ...current, timezone: offset }));
    }).catch(() => undefined);
    return () => { active = false; };
  }, [profile.birthDate, profile.birthTime, profile.timezoneId]);

  const coordinates = useMemo(() => profile.timezoneId ? `${profile.latitude.toFixed(4)}, ${profile.longitude.toFixed(4)} · ${profile.timezoneId} · UTC${profile.timezone >= 0 ? '+' : ''}${profile.timezone}` : t('coordinates'), [profile, t]);

  const selectLocation = (location: LocationResult) => {
    selectedLocation.current = true; setLocationText(location.label); setLocations([]);
    setProfile(current => ({ ...current, place: location.label, latitude: location.latitude, longitude: location.longitude, timezone: 0, timezoneId: location.timezone }));
  };

  const calculate = async () => {
    if (!isCompleteProfile(profile)) return setError(t('invalidForm'));
    setBusy(true); setError('');
    try {
      const result = await api<{ chart: Chart }>('/charts/preview', { method: 'POST', body: JSON.stringify({ profile: { ...profile, isPrimary: Boolean(profile.isPrimary) }, mode: 'NATAL' }) });
      navigation.navigate('ChartResult', { chart: result.chart, profile });
    } catch (cause) { setError(cause instanceof Error ? cause.message : t('error')); }
    finally { setBusy(false); }
  };

  return <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <ScreenTitle eyebrow={t('guest')} title={t('createChart')} body={t('coordinates')} />
      <Field label={t('name')} value={profile.name} onChangeText={name => setProfile(current => ({ ...current, name }))} />
      <View style={styles.row}>
        <View style={styles.flex}><Field label={`${t('date')} · YYYY-MM-DD`} value={profile.birthDate} onChangeText={birthDate => setProfile(current => ({ ...current, birthDate }))} keyboardType="numbers-and-punctuation" maxLength={10} /></View>
        <View style={styles.time}><Field label={`${t('time')} · HH:MM`} value={profile.birthTime} onChangeText={birthTime => setProfile(current => ({ ...current, birthTime }))} keyboardType="numbers-and-punctuation" maxLength={5} /></View>
      </View>
      <Field label={t('location')} placeholder={t('locationHint')} value={locationText} onChangeText={value => { selectedLocation.current = false; setLocationText(value); setProfile(current => ({ ...current, place: '', timezoneId: null })); }} />
      {!!locations.length && <Card style={styles.results}>{locations.map(location => <Pressable key={location.id} onPress={() => selectLocation(location)} style={styles.result}><Text style={styles.resultTitle}>{location.label}</Text><Text style={styles.resultMeta}>{location.latitude.toFixed(3)}, {location.longitude.toFixed(3)}</Text></Pressable>)}</Card>}
      <Text style={styles.coordinates}>{coordinates}</Text>
      <Text style={styles.label}>Zodiac</Text>
      <Segmented value={profile.zodiac} onChange={zodiac => setProfile(current => ({ ...current, zodiac }))} options={[{ value: 'TROPICAL', label: t('tropical') }, { value: 'SIDEREAL', label: t('sidereal') }]} />
      <Text style={styles.label}>House system</Text>
      <Segmented value={profile.houseSystem} onChange={houseSystem => setProfile(current => ({ ...current, houseSystem }))} options={[{ value: 'PLACIDUS', label: t('placidus') }, { value: 'WHOLE_SIGN', label: t('wholeSign') }, { value: 'EQUAL', label: t('equal') }]} />
      {!!error && <Text style={styles.error}>{error}</Text>}
      <Button title={busy ? t('calculating') : t('calculate')} onPress={calculate} loading={busy} />
    </ScrollView>
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.cream }, page: { padding: 18, paddingBottom: 40 }, row: { flexDirection: 'row', gap: 10 }, flex: { flex: 1 }, time: { width: 130 },
  results: { marginTop: -8, padding: 5 }, result: { padding: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border }, resultTitle: { color: colors.ink, fontWeight: '700' }, resultMeta: { color: colors.muted, fontSize: 11, marginTop: 3 },
  coordinates: { color: colors.green, fontSize: 12, marginTop: -4, marginBottom: 17 }, label: { color: colors.ink, fontSize: 12, fontWeight: '700', marginBottom: 7 }, error: { color: colors.red, marginBottom: 8 },
});
