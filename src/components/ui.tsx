import React from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
  StyleProp,
} from 'react-native';
import type { BookStatus } from '../lib/types';

export const colors = {
  bg: '#F7F3EC',
  card: '#FFFFFF',
  ink: '#1E2A24',
  muted: '#6B746F',
  line: '#E3DDD2',
  primary: '#1F4D3A',
  primaryText: '#FFFFFF',
  danger: '#B3261E',
  shelf: '#2E7D4F',
  loan: '#B7791F',
  overdue: '#B3261E',
};

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
}) {
  const bg = variant === 'primary' ? colors.primary : variant === 'danger' ? colors.danger : 'transparent';
  const fg = variant === 'secondary' ? colors.primary : colors.primaryText;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        s.button,
        { backgroundColor: bg, opacity: disabled ? 0.45 : pressed ? 0.8 : 1 },
        variant === 'secondary' && { borderWidth: 1.5, borderColor: colors.primary },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : <Text style={[s.buttonText, { color: fg }]}>{title}</Text>}
    </Pressable>
  );
}

export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput placeholderTextColor={colors.muted} {...props} style={[s.input, props.multiline && { minHeight: 80, textAlignVertical: 'top' }, props.style]} />
    </View>
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={[s.chip, selected && { backgroundColor: colors.primary, borderColor: colors.primary }]}
    >
      <Text style={{ color: selected ? colors.primaryText : colors.ink, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

const statusText: Record<BookStatus, string> = { on_shelf: 'On shelf', on_loan: 'On loan', overdue: 'Overdue' };
const statusColor: Record<BookStatus, string> = { on_shelf: colors.shelf, on_loan: colors.loan, overdue: colors.overdue };

export function StatusBadge({ status }: { status: BookStatus }) {
  return (
    <View style={[s.badge, { backgroundColor: statusColor[status] + '22' }]}>
      <Text style={{ color: statusColor[status], fontWeight: '700', fontSize: 12 }}>{statusText[status]}</Text>
    </View>
  );
}

export function Cover({ uri, size = 56 }: { uri: string | null; size?: number }) {
  const h = Math.round(size * 1.5);
  if (!uri)
    return (
      <View style={[s.coverBlank, { width: size, height: h }]}>
        <Text style={{ fontSize: size * 0.4 }}>📕</Text>
      </View>
    );
  return <Image source={{ uri }} style={{ width: size, height: h, borderRadius: 4, backgroundColor: colors.line }} />;
}

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[s.card, style]}>{children}</View>;
}

export function Empty({ text }: { text: string }) {
  return <Text style={s.empty}>{text}</Text>;
}

export function Loading() {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg }}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  pad: { padding: 16 },
  h1: { fontSize: 22, fontWeight: '700', color: colors.ink },
  h2: { fontSize: 17, fontWeight: '700', color: colors.ink, marginTop: 18, marginBottom: 8 },
  body: { fontSize: 15, color: colors.ink },
  muted: { fontSize: 14, color: colors.muted },
  label: { fontSize: 13, fontWeight: '600', color: colors.muted, marginBottom: 6 },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: colors.ink,
  },
  button: { borderRadius: 10, paddingVertical: 13, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', marginVertical: 5 },
  buttonText: { fontSize: 16, fontWeight: '700' },
  chip: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6, marginRight: 8, marginBottom: 8 },
  badge: { alignSelf: 'flex-start', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  coverBlank: { borderRadius: 4, backgroundColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: colors.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.line, marginBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'center' },
  listRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.line },
  empty: { textAlign: 'center', color: colors.muted, marginTop: 40, fontSize: 15, paddingHorizontal: 24 },
});
