import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation';
import { useAuth } from '../AuthContext';
import { useLanguage } from '../LanguageContext';
import { Button, Card, ScreenTitle } from '../components/UI';
import { colors } from '../theme';

export function HomeScreen({ navigation }: { navigation: NativeStackNavigationProp<RootStackParamList> }) {
  const { user } = useAuth();
  const { t } = useLanguage();
  return <ScrollView contentContainerStyle={styles.page}>
    <LinearGradient colors={['#fffaf0', '#eee8f7']} style={styles.hero}>
      <Text style={styles.orbit}>☉　☽　♄</Text>
      <ScreenTitle eyebrow={user ? user.name : t('guest')} title={t('welcome')} body={t('intro')} />
      <Button title={t('createChart')} onPress={() => navigation.navigate('CreateChart')} />
      {!user && <Button title={t('signIn')} variant="ghost" onPress={() => navigation.navigate('Auth', { mode: 'login' })} />}
    </LinearGradient>
    <Card>
      <Text style={styles.cardTitle}>☽ {t('explore')}</Text>
      <Text style={styles.copy}>{t('accountBenefit')}</Text>
      {!user && <Button title={t('signUp')} variant="secondary" onPress={() => navigation.navigate('Auth', { mode: 'register' })} />}
    </Card>
    <View style={styles.featureRow}>
      <Card style={styles.feature}><Text style={styles.symbol}>△</Text><Text style={styles.featureTitle}>{t('aspects')}</Text><Text style={styles.small}>Trines, squares, conjunctions, oppositions and sextiles.</Text></Card>
      <Card style={styles.feature}><Text style={styles.symbol}>ASC</Text><Text style={styles.featureTitle}>Placidus</Text><Text style={styles.small}>House 1 at nine o'clock, counter-clockwise.</Text></Card>
    </View>
  </ScrollView>;
}

const styles = StyleSheet.create({
  page: { backgroundColor: colors.cream, padding: 16, paddingBottom: 36 }, hero: { borderRadius: 24, padding: 22, marginBottom: 15, overflow: 'hidden' },
  orbit: { alignSelf: 'flex-end', color: colors.gold, fontSize: 19, marginBottom: 13 }, cardTitle: { fontFamily: 'serif', color: colors.ink, fontSize: 20, fontWeight: '700', marginBottom: 7 },
  copy: { color: colors.muted, lineHeight: 21 }, featureRow: { flexDirection: 'row', gap: 10 }, feature: { flex: 1 }, symbol: { color: colors.gold, fontWeight: '800', fontSize: 17, marginBottom: 9 },
  featureTitle: { color: colors.ink, fontWeight: '800', marginBottom: 5 }, small: { color: colors.muted, fontSize: 11, lineHeight: 16 },
});

