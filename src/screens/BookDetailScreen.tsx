import React, { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Button, Card, Cover, Loading, StatusBadge, colors, s } from '../components/ui';
import { pickDate } from '../components/pickDate';
import {
  changeDueDate,
  deleteBook,
  friendlyError,
  getBookStatus,
  loansForBook,
  markReturned,
  sendEmail,
  statusOf,
} from '../lib/db';
import { dueLabel, formatDate, formatTimestamp, todayIso } from '../lib/dates';
import type { BookWithStatus, LoanWithBorrower } from '../lib/types';
import type { StackProps } from '../navigation';

export default function BookDetailScreen({ route, navigation }: StackProps<'BookDetail'>) {
  const { bookId } = route.params;
  const [book, setBook] = useState<BookWithStatus | null>(null);
  const [history, setHistory] = useState<LoanWithBorrower[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [reminding, setReminding] = useState(false);

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
  const pastLoans = history.filter((l) => l.returned_at);
  const openLoan = history.find((l) => !l.returned_at);

  function confirmReturn() {
    Alert.alert('Mark as returned?', `${book!.borrower_name} returned “${book!.title}”.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Returned',
        onPress: async () => {
          setBusy(true);
          try {
            await markReturned(book!.open_loan_id!);
            await load();
          } catch (e) {
            Alert.alert('Couldn’t update', friendlyError(e));
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  }

  function editDueDate() {
    pickDate(book!.due_date!, async (iso) => {
      try {
        await changeDueDate(book!.open_loan_id!, iso);
        await load();
      } catch (e) {
        Alert.alert('Couldn’t update', friendlyError(e));
      }
    }, book!.lent_at ?? todayIso());
  }

  function confirmRemind() {
    Alert.alert('Send a reminder?', `Email ${book!.borrower_name} (${book!.borrower_email}) about “${book!.title}”.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Send',
        onPress: async () => {
          setReminding(true);
          try {
            await sendEmail('remind', book!.open_loan_id!);
            await load();
            Alert.alert('Reminder sent');
          } catch (e) {
            Alert.alert('Couldn’t send', e instanceof Error ? e.message : String(e));
          } finally {
            setReminding(false);
          }
        },
      },
    ]);
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
          {!book.cover_url && <Text style={[s.muted, { fontSize: 11, textAlign: 'center', color: colors.primary }]}>Add cover</Text>}
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

      {status === 'on_shelf' ? (
        <Button title="Lend this book" onPress={() => navigation.navigate('Lend', { bookId })} style={{ marginTop: 18 }} />
      ) : (
        <Card style={{ marginTop: 18, borderColor: status === 'overdue' ? colors.overdue : colors.line }}>
          <Text style={s.label}>LENT TO</Text>
          <Pressable onPress={() => navigation.navigate('BorrowerDetail', { borrowerId: book.borrower_id! })}>
            <Text style={[s.body, { fontWeight: '700', color: colors.primary }]}>{book.borrower_name}</Text>
          </Pressable>
          <Text style={s.muted}>{book.borrower_email}</Text>
          <Text style={[s.body, { marginTop: 8 }]}>Lent {formatDate(book.lent_at!)}</Text>
          <Text style={[s.body, status === 'overdue' && { color: colors.overdue, fontWeight: '700' }]}>
            Due {formatDate(book.due_date!)} ({dueLabel(book.due_date!)})
          </Text>
          {openLoan?.last_reminder_at && (
            <Text style={s.muted}>
              Last reminded {formatTimestamp(openLoan.last_reminder_at)} ({openLoan.reminder_count} so far)
            </Text>
          )}
          <Button title="Mark returned" onPress={confirmReturn} loading={busy} style={{ marginTop: 10 }} />
          <Button title="Send reminder email" variant="secondary" onPress={confirmRemind} loading={reminding} />
          <Button title="Change due date" variant="secondary" onPress={editDueDate} />
        </Card>
      )}

      {pastLoans.length > 0 && (
        <>
          <Text style={s.h2}>Loan history</Text>
          {pastLoans.map((l) => (
            <Pressable key={l.id} onPress={() => navigation.navigate('BorrowerDetail', { borrowerId: l.borrower.id })}>
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
        <Button title="Edit details" variant="secondary" onPress={() => navigation.navigate('ConfirmBook', { bookId })} />
        <Button title="Delete book" variant="danger" onPress={confirmDelete} />
      </View>
    </ScrollView>
  );
}
