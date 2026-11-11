import React, { useCallback, useState } from 'react';
import { Alert, KeyboardAvoidingView, Pressable, ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Button, Card, Chip, Cover, Field, Loading, colors, s } from '../components/ui';
import { deleteBorrower, friendlyError, getBorrower, loansForBorrower, updateBorrower } from '../lib/db';
import { dueLabel, formatDate, formatTimestamp, todayIso } from '../lib/dates';
import type { Borrower, BorrowerKind, LoanWithBook } from '../lib/types';
import type { StackProps } from '../navigation';

export default function BorrowerDetailScreen({ route, navigation }: StackProps<'BorrowerDetail'>) {
  const { borrowerId } = route.params;
  const [borrower, setBorrower] = useState<Borrower | null>(null);
  const [loans, setLoans] = useState<LoanWithBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [kind, setKind] = useState<BorrowerKind>('student');
  const [notes, setNotes] = useState('');

  const load = useCallback(async () => {
    try {
      const [b, l] = await Promise.all([getBorrower(borrowerId), loansForBorrower(borrowerId)]);
      setBorrower(b);
      setLoans(l);
      if (b) {
        navigation.setOptions({ title: b.name });
        setName(b.name);
        setEmail(b.email);
        setKind(b.kind);
        setNotes(b.notes ?? '');
      }
    } catch (e) {
      Alert.alert('Couldn’t load', friendlyError(e));
    } finally {
      setLoading(false);
    }
  }, [borrowerId, navigation]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function save() {
    setSaving(true);
    try {
      await updateBorrower(borrowerId, { name, email, kind, notes: notes.trim() || null });
      setEditing(false);
      await load();
    } catch (e) {
      Alert.alert('Couldn’t save', friendlyError(e));
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete() {
    Alert.alert('Delete borrower?', 'This only works if they have no loan history.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteBorrower(borrowerId);
            navigation.goBack();
          } catch (e) {
            Alert.alert('Couldn’t delete', friendlyError(e));
          }
        },
      },
    ]);
  }

  if (loading) return <Loading />;
  if (!borrower) return <Text style={s.empty}>Borrower not found.</Text>;

  const current = loans.filter((l) => !l.returned_at);
  const past = loans.filter((l) => l.returned_at);
  const today = todayIso();

  return (
    <KeyboardAvoidingView behavior="height" style={s.screen}>
      <ScrollView contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
        {editing ? (
          <>
            <Field label="Name" value={name} onChangeText={setName} autoCapitalize="words" />
            <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
            <View style={[s.row, { marginBottom: 10 }]}>
              <Chip label="Student" selected={kind === 'student'} onPress={() => setKind('student')} />
              <Chip label="Friend" selected={kind === 'friend'} onPress={() => setKind('friend')} />
            </View>
            <Field label="Notes" value={notes} onChangeText={setNotes} multiline />
            <Button title="Save" onPress={save} loading={saving} disabled={!name.trim() || !email.trim()} />
            <Button title="Cancel" variant="secondary" onPress={() => { setEditing(false); load(); }} />
          </>
        ) : (
          <Card>
            <Text style={s.h1}>{borrower.name}</Text>
            <Text style={[s.body, { marginTop: 4 }]}>{borrower.email}</Text>
            <Text style={s.muted}>{borrower.kind === 'student' ? 'Student' : 'Friend'}</Text>
            {borrower.notes && <Text style={[s.body, { marginTop: 8 }]}>{borrower.notes}</Text>}
            <Text style={{ color: colors.primary, fontWeight: '600', marginTop: 10 }} onPress={() => setEditing(true)}>
              Edit
            </Text>
          </Card>
        )}

        <Text style={s.h2}>Has now ({current.length})</Text>
        {current.length === 0 && <Text style={s.muted}>Nothing borrowed right now.</Text>}
        {current.map((l) => (
          <Pressable key={l.id} onPress={() => navigation.navigate('BookDetail', { bookId: l.book.id })}>
            <Card style={[s.row, l.due_date < today && { borderColor: colors.overdue }]}>
              <Cover uri={l.book.cover_url} size={36} />
              <View style={{ marginLeft: 12, flex: 1 }}>
                <Text style={[s.body, { fontWeight: '600' }]}>{l.book.title}</Text>
                <Text style={[s.muted, l.due_date < today && { color: colors.overdue, fontWeight: '700' }]}>
                  Due {formatDate(l.due_date)} · {dueLabel(l.due_date)}
                </Text>
              </View>
            </Card>
          </Pressable>
        ))}

        {past.length > 0 && (
          <>
            <Text style={s.h2}>Borrowed before ({past.length})</Text>
            {past.map((l) => (
              <Pressable key={l.id} onPress={() => navigation.navigate('BookDetail', { bookId: l.book.id })}>
                <Card>
                  <Text style={[s.body, { fontWeight: '600' }]}>{l.book.title}</Text>
                  <Text style={s.muted}>
                    {formatDate(l.lent_at)} → {formatTimestamp(l.returned_at!)}
                  </Text>
                </Card>
              </Pressable>
            ))}
          </>
        )}

        {loans.length === 0 && !editing && (
          <Button title="Delete borrower" variant="danger" onPress={confirmDelete} style={{ marginTop: 24 }} />
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
