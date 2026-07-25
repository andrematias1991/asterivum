import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from './src/AuthContext';
import { LanguageProvider, useLanguage } from './src/LanguageContext';
import type { MainTabsParamList, RootStackParamList } from './src/navigation';
import { HomeScreen } from './src/screens/HomeScreen';
import { EphemerisScreen } from './src/screens/EphemerisScreen';
import { ProfilesScreen } from './src/screens/ProfilesScreen';
import { CreateChartScreen } from './src/screens/CreateChartScreen';
import { ChartResultScreen } from './src/screens/ChartResultScreen';
import { AuthScreen } from './src/screens/AuthScreen';
import { colors } from './src/theme';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tabs = createBottomTabNavigator<MainTabsParamList>();

const tabSymbols: Record<keyof MainTabsParamList, string> = { Home: '☉', Ephemeris: '☽', Profiles: '♙' };

function LanguageButton() {
  const { toggle, t } = useLanguage();
  return <Pressable accessibilityLabel={t('languageLabel')} onPress={toggle} style={styles.language}><Text style={styles.languageText}>{t('language')}</Text></Pressable>;
}

function MainTabs() {
  const { t } = useLanguage();
  return <Tabs.Navigator screenOptions={({ route }) => ({
    headerStyle: { backgroundColor: colors.cream }, headerShadowVisible: false, headerTitle: 'ASTERIVUM', headerTitleStyle: { color: colors.ink, fontSize: 13, letterSpacing: 2, fontWeight: '800' }, headerRight: LanguageButton,
    tabBarStyle: { backgroundColor: colors.paper, borderTopColor: colors.border, height: 66, paddingTop: 6 }, tabBarActiveTintColor: colors.violet, tabBarInactiveTintColor: colors.muted,
    tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>{tabSymbols[route.name]}</Text>,
  })}>
    <Tabs.Screen name="Home" component={HomeScreen as never} options={{ title: t('home') }} />
    <Tabs.Screen name="Ephemeris" component={EphemerisScreen} options={{ title: t('ephemeris') }} />
    <Tabs.Screen name="Profiles" component={ProfilesScreen as never} options={{ title: t('profiles') }} />
  </Tabs.Navigator>;
}

function Navigator() {
  const { restoring } = useAuth();
  const { t } = useLanguage();
  if (restoring) return <View style={styles.loading}><ActivityIndicator size="large" color={colors.gold} /></View>;
  return <NavigationContainer theme={{ ...DefaultTheme, colors: { ...DefaultTheme.colors, background: colors.cream, card: colors.cream, primary: colors.violet, text: colors.ink, border: colors.border } }}>
    <Stack.Navigator screenOptions={{ headerStyle: { backgroundColor: colors.cream }, headerShadowVisible: false, headerTintColor: colors.ink, headerRight: LanguageButton }}>
      <Stack.Screen name="Main" component={MainTabs} options={{ headerShown: false }} />
      <Stack.Screen name="CreateChart" component={CreateChartScreen} options={{ title: t('createChart') }} />
      <Stack.Screen name="ChartResult" component={ChartResultScreen} options={{ title: t('chart') }} />
      <Stack.Screen name="Auth" component={AuthScreen} options={{ title: t('signIn'), presentation: 'modal' }} />
    </Stack.Navigator>
  </NavigationContainer>;
}

export default function App() {
  return <SafeAreaProvider><LanguageProvider><AuthProvider><StatusBar style="dark" /><Navigator /></AuthProvider></LanguageProvider></SafeAreaProvider>;
}

const styles = StyleSheet.create({
  loading: { flex: 1, backgroundColor: colors.cream, alignItems: 'center', justifyContent: 'center' }, language: { marginRight: 15, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 }, languageText: { color: colors.ink, fontWeight: '800', fontSize: 11 },
});
