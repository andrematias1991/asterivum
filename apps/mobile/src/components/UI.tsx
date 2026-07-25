import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, type TextInputProps, View } from 'react-native';
import { colors } from '../theme';

export function ScreenTitle({ eyebrow, title, body }: { eyebrow?: string; title: string; body?: string }) {
  return <View style={styles.heading}>
    {eyebrow ? <Text style={styles.eyebrow}>{eyebrow.toUpperCase()}</Text> : null}
    <Text style={styles.title}>{title}</Text>
    {body ? <Text style={styles.body}>{body}</Text> : null}
  </View>;
}

export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return <View style={styles.field}>
    <Text style={styles.label}>{label}</Text>
    <TextInput placeholderTextColor="#9792a0" {...props} style={[styles.input, props.multiline && styles.multiline, props.style]} />
  </View>;
}

export function Button({ title, onPress, variant = 'primary', disabled, loading }: { title: string; onPress(): void; variant?: 'primary' | 'secondary' | 'ghost'; disabled?: boolean; loading?: boolean }) {
  return <Pressable accessibilityRole="button" onPress={onPress} disabled={disabled || loading} style={({ pressed }) => [styles.button, styles[variant], (pressed || disabled) && styles.buttonMuted]}>
    {loading ? <ActivityIndicator color={variant === 'primary' ? colors.white : colors.ink} /> : <Text style={[styles.buttonText, variant !== 'primary' && styles.buttonTextDark]}>{title}</Text>}
  </Pressable>;
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange(value: T): void }) {
  return <View style={styles.segmented}>{options.map(option => <Pressable key={option.value} onPress={() => onChange(option.value)} style={[styles.segment, value === option.value && styles.segmentActive]}>
    <Text style={[styles.segmentText, value === option.value && styles.segmentTextActive]}>{option.label}</Text>
  </Pressable>)}</View>;
}

export function Card({ children, style }: React.PropsWithChildren<{ style?: object }>) {
  return <View style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  heading: { gap: 7, marginBottom: 20 }, eyebrow: { color: colors.gold, fontWeight: '800', fontSize: 11, letterSpacing: 1.6 },
  title: { color: colors.ink, fontSize: 31, lineHeight: 36, fontFamily: 'serif', fontWeight: '700' },
  body: { color: colors.muted, fontSize: 15, lineHeight: 22 }, field: { gap: 7, marginBottom: 14 },
  label: { color: colors.ink, fontSize: 12, fontWeight: '700' }, input: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.paper, paddingHorizontal: 14, color: colors.ink, fontSize: 15 },
  multiline: { minHeight: 90, paddingTop: 13, textAlignVertical: 'top' }, button: { minHeight: 48, paddingHorizontal: 18, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginVertical: 5 },
  primary: { backgroundColor: colors.night }, secondary: { backgroundColor: colors.goldSoft, borderWidth: 1, borderColor: colors.gold }, ghost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border },
  buttonText: { color: colors.white, fontSize: 14, fontWeight: '800' }, buttonTextDark: { color: colors.ink }, buttonMuted: { opacity: 0.58 },
  segmented: { flexDirection: 'row', backgroundColor: '#eee8db', borderRadius: 11, padding: 3, marginBottom: 15 }, segment: { flex: 1, paddingVertical: 10, paddingHorizontal: 5, borderRadius: 9, alignItems: 'center' }, segmentActive: { backgroundColor: colors.paper },
  segmentText: { color: colors.muted, fontSize: 11, fontWeight: '700' }, segmentTextActive: { color: colors.ink },
  card: { backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.border, borderRadius: 18, padding: 17, marginBottom: 14 },
});

