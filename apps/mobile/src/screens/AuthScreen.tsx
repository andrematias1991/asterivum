import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation';
import { useAuth } from '../AuthContext';
import { useLanguage } from '../LanguageContext';
import { Button, Field, ScreenTitle, Segmented } from '../components/UI';
import { colors } from '../theme';

export function AuthScreen({ navigation, route }: NativeStackScreenProps<RootStackParamList, 'Auth'>) {
  const [mode, setMode] = useState<'login' | 'register'>(route.params?.mode || 'login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { login, register } = useAuth();
  const { t } = useLanguage();

  const submit = async () => {
    if (!email.includes('@') || password.length < 12 || (mode === 'register' && name.trim().length < 2)) return setError(t('invalidAuth'));
    setBusy(true); setError('');
    try {
      if (mode === 'login') await login(email.trim(), password);
      else await register(name.trim(), email.trim(), password);
      navigation.popToTop();
    } catch (cause) { setError(cause instanceof Error ? cause.message : t('error')); }
    finally { setBusy(false); }
  };

  return <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <ScreenTitle eyebrow="ASTERIVUM" title={mode === 'login' ? t('signIn') : t('signUp')} body={t('accountBenefit')} />
      <Segmented<'login' | 'register'> value={mode} onChange={setMode} options={[{ value: 'login', label: t('signIn') }, { value: 'register', label: t('signUp') }]} />
      {mode === 'register' && <Field label={t('name')} value={name} onChangeText={setName} autoComplete="name" />}
      <Field label={t('email')} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
      <Field label={t('password')} value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
      {!!error && <Text style={styles.error}>{error}</Text>}
      <Button title={mode === 'login' ? t('signIn') : t('signUp')} onPress={submit} loading={busy} />
    </ScrollView>
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({ fill: { flex: 1, backgroundColor: colors.cream }, page: { flexGrow: 1, padding: 22, justifyContent: 'center' }, error: { color: colors.red, marginBottom: 9, lineHeight: 19 } });
