import React, { useMemo, useState } from 'react';
import { Modal, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation';
import { useAuth } from '../AuthContext';
import { useLanguage } from '../LanguageContext';
import { api } from '../api';
import { ChartWheel } from '../components/ChartWheel';
import { Button, Card, ScreenTitle } from '../components/UI';
import { colors } from '../theme';

export function ChartResultScreen({ navigation, route }: NativeStackScreenProps<RootStackParamList, 'ChartResult'>) {
  const { chart, profile } = route.params;
  const { user } = useAuth();
  const { language, t } = useLanguage();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [showChiron, setShowChiron] = useState(true);
  const [showLilith, setShowLilith] = useState(true);
  const [objectAspects, setObjectAspects] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [chartScale, setChartScale] = useState(1);
  const { width } = useWindowDimensions();
  const detailedChartSize = 560 * chartScale;
  const fitScale = Math.max(0.55, Math.min(1, (width - 24) / 560));
  const displayChart = useMemo(() => {
    const hidden = new Set<string>();
    if (!showChiron) hidden.add('Chiron');
    if (!showLilith) hidden.add('Lilith');
    const visibleAspect = (aspect: { from: string; to: string }) =>
      !hidden.has(aspect.from) && !hidden.has(aspect.to)
      && (objectAspects || ![aspect.from, aspect.to].some(name => name === 'Chiron' || name === 'Lilith'));
    return {
      ...chart,
      planets: chart.planets.filter(planet => !hidden.has(planet.name)),
      natal: chart.natal.filter(planet => !hidden.has(planet.name)),
      aspects: chart.aspects.filter(visibleAspect),
      natalAspects: chart.natalAspects.filter(visibleAspect),
    };
  }, [chart, objectAspects, showChiron, showLilith]);

  const save = async () => {
    if (!user) return navigation.navigate('Auth', { mode: 'register' });
    setSaving(true); setMessage('');
    try {
      await api('/profiles', { method: 'POST', authenticated: true, language, body: JSON.stringify({ ...profile, id: undefined, isPrimary: Boolean(profile.isPrimary) }) });
      setMessage(t('saved'));
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : t('error')); }
    finally { setSaving(false); }
  };

  const aspects = displayChart.natalAspects;
  return <ScrollView contentContainerStyle={styles.page}>
    <ScreenTitle eyebrow={`${profile.place} · ${profile.birthDate}`} title={profile.name} body={`${chart.settings.zodiac} · ${chart.settings.houseSystem}`} />
    <View style={styles.wheel}><ChartWheel chart={displayChart} /></View>
    <Pressable accessibilityRole="button" onPress={() => { setChartScale(1); setExpanded(true); }} style={styles.expandButton}>
      <Text style={styles.expandText}>{t('expandChart')}</Text>
    </Pressable>
    <View style={styles.objectControls}>
      <Pressable onPress={() => setShowChiron(value => !value)} style={[styles.objectButton, showChiron && styles.objectActive]}><Text style={styles.objectText}>⚷ {t('chiron')}</Text></Pressable>
      <Pressable onPress={() => setShowLilith(value => !value)} style={[styles.objectButton, showLilith && styles.objectActive]}><Text style={styles.objectText}>⚸ {t('lilith')}</Text></Pressable>
      <Pressable onPress={() => setObjectAspects(value => !value)} style={[styles.objectButton, objectAspects && styles.objectActive]}><Text style={styles.objectText}>{t('objectAspects')}</Text></Pressable>
    </View>
    <Button title={user ? t('saveProfile') : `${t('saveProfile')} · ${t('signUp')}`} onPress={save} loading={saving} variant="secondary" />
    {!!message && <Text style={styles.message}>{message}</Text>}

    <Card>
      <Text style={styles.section}>{t('planets')}</Text>
      {displayChart.natal.map(planet => <View key={planet.name} style={styles.dataRow}>
        <Text style={styles.glyph}>{planet.glyph}</Text><Text style={styles.itemName}>{planet.name}</Text>
        <Text style={styles.itemValue}>{planet.degree}°{String(planet.minute).padStart(2, '0')}′ {planet.sign}{planet.retrograde ? ' ℞' : ''}</Text>
      </View>)}
    </Card>
    <Card>
      <Text style={styles.section}>{t('aspects')}</Text>
      {aspects.slice(0, 24).map((aspect, index) => <View key={`${aspect.from}-${aspect.to}-${index}`} style={styles.aspectRow}>
        <Text style={[styles.aspectGlyph, { color: ['Square', 'Opposition'].includes(aspect.type) ? colors.red : colors.blue }]}>{aspect.glyph}</Text>
        <Text style={styles.aspectText}>{aspect.from} · {aspect.type} · {aspect.to}</Text><Text style={styles.orb}>{aspect.orb.toFixed(1)}°</Text>
      </View>)}
    </Card>
    <Card>
      <Text style={styles.section}>{t('advanced')}</Text><Text style={styles.locked}>{t('locked')}</Text>
      {!user && <Button title={t('signUp')} onPress={() => navigation.navigate('Auth', { mode: 'register' })} />}
    </Card>
    <Modal visible={expanded} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => setExpanded(false)}>
      <SafeAreaView style={styles.modalPage}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>{profile.name}</Text>
          <View style={styles.zoomControls}>
            <Pressable accessibilityRole="button" accessibilityLabel={t('zoomOut')} onPress={() => setChartScale(value => Math.max(fitScale, value - 0.25))} style={styles.zoomButton}><Text style={styles.zoomText}>−</Text></Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={t('fitChart')} onPress={() => setChartScale(fitScale)} style={styles.fitButton}><Text style={styles.fitText}>{t('fitChart')}</Text></Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={t('zoomIn')} onPress={() => setChartScale(value => Math.min(2.5, value + 0.25))} style={styles.zoomButton}><Text style={styles.zoomText}>+</Text></Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={t('closeChart')} onPress={() => setExpanded(false)} style={styles.closeButton}><Text style={styles.closeText}>×</Text></Pressable>
          </View>
        </View>
        <ScrollView contentContainerStyle={styles.verticalChartScroll}>
          <ScrollView horizontal contentContainerStyle={styles.horizontalChartScroll}>
            <View style={{ width:detailedChartSize, height:detailedChartSize }}>
              <ChartWheel chart={displayChart} />
            </View>
          </ScrollView>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  </ScrollView>;
}

const styles = StyleSheet.create({
  page: { backgroundColor: colors.cream, padding: 14, paddingBottom: 40 }, wheel: { width: '100%', aspectRatio: 1, marginBottom: 7 }, message: { textAlign: 'center', color: colors.green, marginVertical: 8 },
  expandButton: { alignSelf: 'center', borderWidth: 1, borderColor: colors.gold, backgroundColor: colors.paper, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 9, marginBottom: 10 },
  expandText: { color: colors.ink, fontSize: 12, fontWeight: '700' },
  section: { fontSize: 19, fontFamily: 'serif', color: colors.ink, fontWeight: '700', marginBottom: 10 }, dataRow: { flexDirection: 'row', alignItems: 'center', minHeight: 34, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  glyph: { width: 31, color: colors.ink, fontSize: 20 }, itemName: { flex: 1, color: colors.ink, fontWeight: '600' }, itemValue: { color: colors.muted, fontSize: 12 },
  aspectRow: { flexDirection: 'row', alignItems: 'center', minHeight: 34 }, aspectGlyph: { width: 27, fontSize: 18 }, aspectText: { flex: 1, color: colors.ink, fontSize: 12 }, orb: { color: colors.muted, fontSize: 11 }, locked: { color: colors.muted, lineHeight: 21 },
  objectControls: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }, objectButton: { borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: colors.paper, opacity: 0.55 }, objectActive: { borderColor: colors.gold, backgroundColor: colors.goldSoft, opacity: 1 }, objectText: { color: colors.ink, fontSize: 10, fontWeight: '700' },
  modalPage: { flex: 1, backgroundColor: colors.cream },
  modalHeader: { minHeight: 58, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.paper },
  modalTitle: { flex: 1, color: colors.ink, fontSize: 16, fontWeight: '700' },
  zoomControls: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  zoomButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.paper },
  zoomText: { color: colors.ink, fontSize: 22, lineHeight: 24 },
  fitButton: { minHeight: 36, justifyContent: 'center', borderRadius: 8, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 9, backgroundColor: colors.paper },
  fitText: { color: colors.ink, fontSize: 10, fontWeight: '700' },
  closeButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: colors.ink },
  closeText: { color: colors.paper, fontSize: 24, lineHeight: 26 },
  verticalChartScroll: { flexGrow: 1, justifyContent: 'center' },
  horizontalChartScroll: { minWidth: '100%', minHeight: '100%', alignItems: 'center', justifyContent: 'center' },
});
