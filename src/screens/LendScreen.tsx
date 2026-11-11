import React, { useEffect, useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Pressable, ScrollView, Text, View } from 'react-native';
import { Button, Card, Chip, Cover, Field, Loading, colors, s } from '../components/ui';
import { pickDate } from '../components/pickDate';
import {
  BorrowerWithCount,
  createBorrower,
  friendlyError,
  getBookStatus,
  getSettings,
  lendBook,
  listBorrowers,
} from '../lib/db';
import { addDaysIso, daysBetween, formatDate, todayIso } from '../lib/dates';
import type { BookWithStatus, BorrowerKind } from '../lib/types';
import type { StackProps } from '../navigation';

const QUICK_WEEKS = [1, 2, 3, 4];

export default function LendScreen({ route, navigation }: StackProps<'Lend'>) {
  const { bookId } = route.params;
  const [book, setBook] = useState<BookWithStatus | null>(null);
  const [borrowers, setBorrowers] = useState<BorrowerWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Borrower: either pick an existing one or enter a new one.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [kind, setKind] = useState<BorrowerKind>('student');

  const [dueDate, setDueDate] = useState(addDaysIso(todayIso(), 14));

  useEffect(() => {
    (async () => {
      try {
        const [b, list, settings] = await Promise.all([getBookStatus(bookId), listBorrowers(), getSettings()]);
        setBook(b);
        setBorrowers(list);
        if (settings) setDueDate(addDaysIso(todayIso(), settings.default_loan_days));
      } catch (e) {
        Alert.alert('Couldn’t load', friendlyError(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [bookId]);

  const selected = borrowers.find((b) => b.id === selectedId) ?? null;

  // Suggestions as you type a name or email.
  const matches = useMemo(() => {
    const q = (name || email).trim().toLowerCase();
    if (!q || selected) return [];
    return borrowers
      .filter((b) => b.name.toLowerCase().includes(q) || b.email.toLowerCase().includes(q))
      .slice(0, 5);
  }, [name, email, borrowers, selected]);

  const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());
  const canSave = !!selected || (name.trim().length > 0 && emailOk);

  async function save() {
    setSaving(true);
    try {
      let borrowerId = selected?.id;
      if (!borrowerId) {
        const existing = borrowers.find((b) => b.email.toLowerCase() === email.trim().toLowerCase());
        borrowerId = existing ? existing.id : (await createBorrower({ name, email, kind })).id;
      }
      await lendBook(bookId, borrowerId, dueDate);
      navigation.goBack();
    } catch (e) {
      Alert.alert('Couldn’t lend', friendlyError(e));
      setSaving(false);
    }
  }

  if (loading) return <Loading />;
  if (!book) return <Text style={s.empty}>This book was not found.</Text>;

  const weeksSelected = daysBetween(todayIso(), dueDate);

  return (
    <KeyboardAvoidingView behavior="height" style={s.screen}>
      <ScrollView contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
        <View style={[s.row, { marginBottom: 16 }]}>
          <Cover uri={book.cover_url} size={44} />
          <View style={{ marginLeft: 12, flex: 1 }}>
            <Text style={[s.body, { fontWeight: '700' }]}>{book.title}</Text>
            <Text style={s.muted}>{book.authors.join(', ')}</Text>
          </View>
        </View>

        <Text style={s.h2}>Who’s borrowing it?</Text>
        {selected ? (
          <Card>
            <Text style={[s.body, { fontWeight: '700' }]}>{selected.name}</Text>
            <Text style={s.muted}>{selected.email}</Text>
            {selected.open_loans > 0 && (
              <Text style={[s.muted, { color: colors.loan, marginTop: 4 }]}>
                Already has {selected.open_loans} book{selected.open_loans > 1 ? 's' : ''} out
              </Text>
            )}
            <Text style={{ color: colors.primary, marginTop: 8, fontWeight: '600' }} onPress={() => setSelectedId(null)}>
              Choose someone else
            </Text>
          </Card>
        ) : (
          <>
            <Field label="Name" value={name} onChangeText={setName} autoCapitalize="words" />
            {matches.length > 0 && (
              <View style={{ marginTop: -8, marginBottom: 12 }}>
                {matches.map((b) => (
                  <Pressable key={b.id} onPress={() => setSelectedId(b.id)} style={[s.listRow, { borderRadius: 8 }]}>
                    <View>
                      <Text style={[s.body, { fontWeight: '600' }]}>{b.name}</Text>
                      <Text style={s.muted}>{b.email}</Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            )}
            <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
            {email.length > 3 && !emailOk && <Text style={{ color: colors.danger, marginTop: -8, marginBottom: 8 }}>Check the email address.</Text>}
            <View style={[s.row, { flexWrap: 'wrap' }]}>
              <Chip label="Student" selected={kind === 'student'} onPress={() => setKind('student')} />
              <Chip label="Friend" selected={kind === 'friend'} onPress={() => setKind('friend')} />
            </View>
          </>
        )}

        <Text style={s.h2}>Due back</Text>
        <View style={[s.row, { flexWrap: 'wrap' }]}>
          {QUICK_WEEKS.map((w) => (
            <Chip
              key={w}
              label={`${w} week${w > 1 ? 's' : ''}`}
              selected={weeksSelected === w * 7}
              onPress={() => setDueDate(addDaysIso(todayIso(), w * 7))}
            />
          ))}
        </View>
        <Pressable onPress={() => pickDate(dueDate, setDueDate, todayIso())} style={[s.input, { marginTop: 4 }]}>
          <Text style={s.body}>📅  {formatDate(dueDate)}</Text>
        </Pressable>

        <Button title="Lend book" onPress={save} loading={saving} disabled={!canSave} style={{ marginTop: 24 }} />
        <Button title="Cancel" variant="secondary" onPress={() => navigation.goBack()} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
