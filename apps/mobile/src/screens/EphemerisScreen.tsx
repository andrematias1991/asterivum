import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../api';
import { useLanguage } from '../LanguageContext';
import type { EphemerisRow } from '../types';
import { Button, Card, ScreenTitle } from '../components/UI';
import { colors } from '../theme';

export function EphemerisScreen() {
  const [rows, setRows] = useState<EphemerisRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { language, t } = useLanguage();

  const load = useCallback(async () => {
    setLoading(true); setError('');
    const start = new Date();
    const end = new Date(start.getTime() + 6 * 86400000);
    try {
      const result = await api<{ rows: EphemerisRow[] }>(`/ephemeris?start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}&step=1`, { language });
      setRows(result.rows);
    } catch (cause) { setError(cause instanceof Error ? cause.message : t('error')); }
    finally { setLoading(false); }
  }, [language, t]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => setRows([]), [language]);

  return <ScrollView contentContainerStyle={styles.page}>
    <ScreenTitle eyebrow={t('explore')} title={t('ephemeris')} body="Seven-day planetary positions. Tropical zodiac." />
    {loading && <ActivityIndicator color={colors.gold} size="large" />}
    {!!error && <Card><Text style={styles.error}>{error}</Text><Button title={t('retry')} onPress={load} /></Card>}
    {rows.map(row => <Card key={row.date}>
      <Text style={styles.date}>{new Intl.DateTimeFormat(language === 'pt-PT' ? 'pt-PT' : 'en-GB', { weekday: 'long', day: '2-digit', month: 'short' }).format(new Date(row.date))}</Text>
      <View style={styles.planets}>{row.planets.map(planet => <View key={planet.name} style={styles.planet}>
        <Text style={styles.glyph}>{planet.glyph}</Text><Text style={styles.position}>{planet.degree}°{String(planet.minute).padStart(2, '0')}′</Text><Text style={styles.sign}>{planet.sign}{planet.retrograde ? ' ℞' : ''}</Text>
      </View>)}</View>
    </Card>)}
  </ScrollView>;
}

const styles = StyleSheet.create({
  page: { backgroundColor: colors.cream, padding: 16, paddingBottom: 36 }, error: { color: colors.red, marginBottom: 8 }, date: { color: colors.ink, fontFamily: 'serif', fontSize: 18, fontWeight: '700', textTransform: 'capitalize', marginBottom: 10 },
  planets: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, planet: { width: '23%', alignItems: 'center', backgroundColor: '#f5f0e7', borderRadius: 10, paddingVertical: 8 }, glyph: { color: colors.violet, fontSize: 19 }, position: { color: colors.ink, fontSize: 10, fontWeight: '700' }, sign: { color: colors.muted, fontSize: 9, marginTop: 2 },
});

