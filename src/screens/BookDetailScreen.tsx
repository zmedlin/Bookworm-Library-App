import React, { useCallback, useLayoutEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Button, Card, Cover, Loading, StatusBadge, colors, s } from '../components/ui';
import {
  availableCopies,
  deleteBook,
  friendlyError,
  getBookStatus,
  loansForBook,
  markReturned,
  sendEmail,
  setCopies,
  statusOf,
  updateLoan,
} from '../lib/db';
import { dueLabel, formatDate, formatTimestamp, todayIso } from '../lib/dates';
import type { BookWithStatus, LoanWithBorrower } from '../lib/types';
import type { StackProps } from '../navigation';

export default function BookDetailScreen({ route, navigation }: StackProps<'BookDetail'>) {
  const { bookId } = route.params;
  const [book, setBook] = useState<BookWithStatus | null>(null);
  const [history, setHistory] = useState<LoanWithBorrower[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyLoan, setBusyLoan] = useState<string | null>(null);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable onPress={() => navigation.navigate('ConfirmBook', { bookId })} hitSlop={12} accessibilityLabel="Edit book">
          <Ionicons name="create-outline" size={24} color={colors.primary} />
        </Pressable>
      ),
    });
  }, [navigation, bookId]);

  const load = useCallback(async () => {
    try {
      const [b, h] = await Promise.all([getBookStatus(bookId), loansForBook(bookId)]);
      setBook(b);
      setHistory(h);
    } catch (e) {
      Alert.alert('Couldn’t load book', friendlyError(e));
    } finally {
      setLoading(false);
    }
  }, [bookId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) return <Loading />;
  if (!book) return <Text style={s.empty}>This book was not found.</Text>;

  const status = statusOf(book);
  const available = availableCopies(book);
  const today = todayIso();
  const openLoans = history.filter((l) => !l.returned_at).sort((a, b) => a.due_date.localeCompare(b.due_date));
  const pastLoans = history.filter((l) => l.returned_at);

  async function run(loanId: string, fn: () => Promise<void>, errTitle = 'Couldn’t update') {
    setBusyLoan(loanId);
    try {
      await fn();
      await load();
    } catch (e) {
      Alert.alert(errTitle, e instanceof Error ? e.message : friendlyError(e));
    } finally {
      setBusyLoan(null);
    }
  }

  function confirmReturn(l: LoanWithBorrower) {
    Alert.alert('Mark as returned?', `${l.borrower.name} returned “${book!.title}”.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Returned', onPress: () => run(l.id, () => markReturned(l.id)) },
    ]);
  }

  function confirmRemind(l: LoanWithBorrower) {
    Alert.alert('Send a reminder?', `Email ${l.borrower.name} (${l.borrower.email}) about “${book!.title}”.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Send',
        onPress: () =>
          run(l.id, async () => {
            await sendEmail('remind', l.id);
            Alert.alert('Reminder sent');
          }, 'Couldn’t send'),
      },
    ]);
  }

  async function changeCopies(delta: number) {
    const next = book!.copies + delta;
    if (next < 1) return;
    try {
      await setCopies(bookId, next);
      await load();
    } catch (e) {
      Alert.alert('Couldn’t change copies', friendlyError(e));
    }
  }

  function confirmDelete() {
    Alert.alert('Delete this book?', 'It and its loan history will be removed from your library.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteBook(bookId);
            navigation.goBack();
          } catch (e) {
            Alert.alert('Couldn’t delete', friendlyError(e));
          }
        },
      },
    ]);
  }

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.pad}>
      <View style={[s.row, { alignItems: 'flex-start' }]}>
        <Pressable onPress={() => navigation.navigate('ConfirmBook', { bookId })}>
          <Cover uri={book.cover_url} size={90} />
          <Text style={[s.muted, { fontSize: 11, textAlign: 'center', color: colors.primary, marginTop: 2 }]}>
            {book.cover_url ? 'Change cover' : 'Add cover'}
          </Text>
        </Pressable>
        <View style={{ flex: 1, marginLeft: 14 }}>
          <Text style={s.h1}>{book.title}</Text>
          {!!book.authors.length && <Text style={[s.body, { marginTop: 4 }]}>{book.authors.join(', ')}</Text>}
          <Text style={[s.muted, { marginTop: 4 }]}>
            {[book.publisher, book.published_year].filter(Boolean).join(' · ')}
          </Text>
          {book.isbn13 && <Text style={[s.muted, { marginTop: 2 }]}>ISBN {book.isbn13}</Text>}
          <View style={{ marginTop: 8 }}>
            <StatusBadge status={status} />
          </View>
        </View>
      </View>

      {book.notes && <Text style={[s.body, { marginTop: 14 }]}>{book.notes}</Text>}

      {/* Copies */}
      <Card style={[s.row, { marginTop: 16, justifyContent: 'space-between' }]}>
        <View>
          <Text style={[s.body, { fontWeight: '700' }]}>
            {book.copies} {book.copies === 1 ? 'copy' : 'copies'}
          </Text>
          <Text style={s.muted}>
            {available} on shelf{book.open_loans ? ` · ${book.open_loans} lent out` : ''}
          </Text>
        </View>
        <View style={s.row}>
          <Pressable
            onPress={() => changeCopies(-1)}
            disabled={book.copies <= Math.max(1, book.open_loans)}
            style={{ padding: 6, opacity: book.copies <= Math.max(1, book.open_loans) ? 0.3 : 1 }}
            accessibilityLabel="Remove a copy"
          >
            <Ionicons name="remove-circle-outline" size={30} color={colors.primary} />
          </Pressable>
          <Pressable onPress={() => changeCopies(1)} style={{ padding: 6 }} accessibilityLabel="Add a copy">
            <Ionicons name="add-circle-outline" size={30} color={colors.primary} />
          </Pressable>
        </View>
      </Card>

      {available > 0 ? (
        <Button title={book.copies > 1 ? 'Lend a copy' : 'Lend this book'} onPress={() => navigation.navigate('Lend', { bookId })} />
      ) : (
        <Text style={[s.muted, { textAlign: 'center', marginVertical: 6 }]}>
          All copies are lent out. Tap + to add a copy if you have another.
        </Text>
      )}

      {/* Current loans */}
      {openLoans.length > 0 && <Text style={s.h2}>Lent out ({openLoans.length})</Text>}
      {openLoans.map((l) => {
        const overdue = l.due_date < today;
        return (
          <Card key={l.id} style={overdue ? { borderColor: colors.overdue } : undefined}>
            <Pressable onPress={() => navigation.navigate('BorrowerDetail', { borrowerId: l.borrower.id })}>
              <Text style={[s.body, { fontWeight: '700', color: colors.primary }]}>{l.borrower.name}</Text>
            </Pressable>
            <Text style={s.muted}>{l.borrower.email}</Text>
            <Text style={[s.body, { marginTop: 6 }]}>Lent {formatDate(l.lent_at)}</Text>
            <Text style={[s.body, overdue && { color: colors.overdue, fontWeight: '700' }]}>
              Due {formatDate(l.due_date)} ({dueLabel(l.due_date)})
            </Text>
            {l.last_reminder_at && (
              <Text style={s.muted}>
                Last reminded {formatTimestamp(l.last_reminder_at)} ({l.reminder_count} so far)
              </Text>
            )}
            <View style={[s.row, { justifyContent: 'space-between', marginTop: 6 }]}>
              <Text style={s.body}>Automatic reminders</Text>
              <Switch
                value={l.auto_remind}
                onValueChange={(v) => run(l.id, () => updateLoan(l.id, { auto_remind: v }))}
                trackColor={{ true: colors.primary }}
              />
            </View>
            <View style={[s.row, { marginTop: 4 }]}>
              <Button title="Returned" onPress={() => confirmReturn(l)} loading={busyLoan === l.id} style={{ flex: 1, marginRight: 6 }} />
              <Button title="Remind" variant="secondary" onPress={() => confirmRemind(l)} style={{ flex: 1, marginRight: 6 }} />
              <Button title="Edit" variant="secondary" onPress={() => navigation.navigate('EditLoan', { loanId: l.id })} style={{ flex: 1 }} />
            </View>
          </Card>
        );
      })}

      {pastLoans.length > 0 && (
        <>
          <Text style={s.h2}>Loan history</Text>
          {pastLoans.map((l) => (
            <Pressable key={l.id} onPress={() => navigation.navigate('EditLoan', { loanId: l.id })}>
              <Card>
                <Text style={[s.body, { fontWeight: '600' }]}>{l.borrower.name}</Text>
                <Text style={s.muted}>
                  {formatDate(l.lent_at)} → returned {formatTimestamp(l.returned_at!)}
                </Text>
              </Card>
            </Pressable>
          ))}
        </>
      )}

      <View style={{ marginTop: 24 }}>
        <Button title="Edit details & cover" variant="secondary" onPress={() => navigation.navigate('ConfirmBook', { bookId })} />
        <Button title="Delete book" variant="danger" onPress={confirmDelete} />
      </View>
    </ScrollView>
  );
}
