import React, { useEffect, useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { Button, Chip, Cover, Field, Loading, colors, s } from '../components/ui';
import { pickDate } from '../components/pickDate';
import {
  BorrowerWithCount,
  createBorrower,
  friendlyError,
  getBookStatus,
  getSettings,
  lendBook,
  listBorrowers,
  sendEmail,
} from '../lib/db';
import { addDaysIso, daysBetween, formatDate, todayIso } from '../lib/dates';
import type { BookWithStatus, BorrowerKind } from '../lib/types';
import type { StackProps } from '../navigation';

const QUICK_WEEKS = [1, 2, 3, 4];
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export default function LendScreen({ route, navigation }: StackProps<'Lend'>) {
  const { bookId, borrowerId: presetBorrower } = route.params;
  const [book, setBook] = useState<BookWithStatus | null>(null);
  const [borrowers, setBorrowers] = useState<BorrowerWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [mode, setMode] = useState<'saved' | 'new'>('saved');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(presetBorrower ?? null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [kind, setKind] = useState<BorrowerKind>('student');

  const [dueDate, setDueDate] = useState(addDaysIso(todayIso(), 14));
  const [sendConfirmation, setSendConfirmation] = useState(true);
  const [autoRemind, setAutoRemind] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [b, list, settings] = await Promise.all([getBookStatus(bookId), listBorrowers(), getSettings()]);
        setBook(b);
        setBorrowers(list);
        if (!list.length) setMode('new');
        if (settings) {
          setDueDate(addDaysIso(todayIso(), settings.default_loan_days));
          setAutoRemind(settings.auto_remind_default ?? true);
        }
      } catch (e) {
        Alert.alert('Couldn’t load', friendlyError(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [bookId]);

  // Saved borrowers: most recent borrowers first, then alphabetical.
  const sortedSaved = useMemo(() => {
    const q = search.trim().toLowerCase();
    return borrowers
      .filter((b) => !q || b.name.toLowerCase().includes(q) || b.email.toLowerCase().includes(q))
      .sort((a, b) => (b.last_lent ?? '').localeCompare(a.last_lent ?? '') || a.name.localeCompare(b.name));
  }, [borrowers, search]);

  const selected = mode === 'saved' ? borrowers.find((b) => b.id === selectedId) ?? null : null;
  const emailOk = EMAIL_RE.test(email.trim());
  const existingWithEmail =
    mode === 'new' ? borrowers.find((b) => b.email.toLowerCase() === email.trim().toLowerCase()) : undefined;
  const canSave = mode === 'saved' ? !!selected : name.trim().length > 0 && emailOk;
  const who = mode === 'saved' ? selected?.name : name.trim();

  async function save() {
    setSaving(true);
    try {
      let borrowerId = selected?.id;
      if (mode === 'new') {
        borrowerId = existingWithEmail ? existingWithEmail.id : (await createBorrower({ name, email, kind })).id;
      }
      const loanId = await lendBook(bookId, borrowerId!, dueDate, autoRemind);
      if (sendConfirmation) {
        try {
          await sendEmail('lent', loanId);
        } catch (e) {
          Alert.alert('Book lent', `But the confirmation email didn’t send: ${e instanceof Error ? e.message : e}`);
        }
      }
      navigation.goBack();
    } catch (e) {
      Alert.alert('Couldn’t lend', friendlyError(e));
      setSaving(false);
    }
  }

  if (loading) return <Loading />;
  if (!book) return <Text style={s.empty}>This book was not found.</Text>;

  const daysOut = daysBetween(todayIso(), dueDate);

  return (
    <KeyboardAvoidingView behavior="height" style={s.screen}>
      <ScrollView contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
        <View style={[s.row, { marginBottom: 8 }]}>
          <Cover uri={book.cover_url} size={44} />
          <View style={{ marginLeft: 12, flex: 1 }}>
            <Text style={[s.body, { fontWeight: '700' }]}>{book.title}</Text>
            <Text style={s.muted}>{book.authors.join(', ')}</Text>
          </View>
        </View>

        <Text style={s.h2}>Who’s borrowing it?</Text>
        <View style={s.row}>
          <Chip label={`Saved borrowers (${borrowers.length})`} selected={mode === 'saved'} onPress={() => setMode('saved')} />
          <Chip label="+ New borrower" selected={mode === 'new'} onPress={() => setMode('new')} />
        </View>

        {mode === 'saved' ? (
          borrowers.length === 0 ? (
            <Text style={s.muted}>No saved borrowers yet. Add a new one; they’ll be saved for next time.</Text>
          ) : (
            <>
              {borrowers.length > 6 && (
                <TextInput
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Search name or email"
                  placeholderTextColor={colors.muted}
                  style={[s.input, { marginBottom: 8 }]}
                />
              )}
              <View style={{ borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: colors.line }}>
                {sortedSaved.map((b) => {
                  const on = b.id === selectedId;
                  return (
                    <Pressable
                      key={b.id}
                      onPress={() => setSelectedId(on ? null : b.id)}
                      style={[s.listRow, on && { backgroundColor: '#E5EFE9' }]}
                    >
                      <Text style={{ fontSize: 18, marginRight: 10, color: on ? colors.primary : colors.line }}>
                        {on ? '●' : '○'}
                      </Text>
                      <View style={{ flex: 1 }}>
                        <Text style={[s.body, { fontWeight: '600' }]}>{b.name}</Text>
                        <Text style={s.muted} numberOfLines={1}>{b.email}</Text>
                      </View>
                      {b.open_loans > 0 && (
                        <Text style={{ color: colors.loan, fontWeight: '700', fontSize: 12 }}>{b.open_loans} out</Text>
                      )}
                    </Pressable>
                  );
                })}
                {sortedSaved.length === 0 && <Text style={[s.muted, { padding: 12 }]}>No one matches.</Text>}
              </View>
            </>
          )
        ) : (
          <>
            <Field label="Name" value={name} onChangeText={setName} autoCapitalize="words" />
            <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
            {email.length > 3 && !emailOk && (
              <Text style={{ color: colors.danger, marginTop: -8, marginBottom: 8 }}>Check the email address.</Text>
            )}
            {existingWithEmail && (
              <Text style={{ color: colors.loan, marginTop: -8, marginBottom: 8 }}>
                Already saved as {existingWithEmail.name}; that entry will be used.
              </Text>
            )}
            <View style={s.row}>
              <Chip label="Student" selected={kind === 'student'} onPress={() => setKind('student')} />
              <Chip label="Friend" selected={kind === 'friend'} onPress={() => setKind('friend')} />
            </View>
            <Text style={s.muted}>They’ll be saved, so next time just pick them from the list.</Text>
          </>
        )}

        <Text style={s.h2}>Due back</Text>
        <View style={[s.row, { flexWrap: 'wrap' }]}>
          {QUICK_WEEKS.map((w) => (
            <Chip
              key={w}
              label={`${w} week${w > 1 ? 's' : ''}`}
              selected={daysOut === w * 7}
              onPress={() => setDueDate(addDaysIso(todayIso(), w * 7))}
            />
          ))}
        </View>
        <Pressable onPress={() => pickDate(dueDate, setDueDate, todayIso())} style={[s.input, { marginTop: 4 }]}>
          <Text style={s.body}>📅  {formatDate(dueDate)}</Text>
        </Pressable>

        <Text style={s.h2}>Emails</Text>
        <View style={[s.row, { justifyContent: 'space-between' }]}>
          <Text style={[s.body, { flex: 1 }]}>
            Email {who ? who.split(' ')[0] : 'them'} a loan confirmation now
          </Text>
          <Switch value={sendConfirmation} onValueChange={setSendConfirmation} trackColor={{ true: colors.primary }} />
        </View>
        <View style={[s.row, { justifyContent: 'space-between', marginTop: 10 }]}>
          <View style={{ flex: 1 }}>
            <Text style={s.body}>Automatic reminders</Text>
            <Text style={s.muted}>Before it’s due, on the due date, and while overdue</Text>
          </View>
          <Switch value={autoRemind} onValueChange={setAutoRemind} trackColor={{ true: colors.primary }} />
        </View>

        <Button title="Lend book" onPress={save} loading={saving} disabled={!canSave} style={{ marginTop: 20 }} />
        <Button title="Cancel" variant="secondary" onPress={() => navigation.goBack()} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
