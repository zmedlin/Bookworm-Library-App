import React, { useCallback, useLayoutEffect, useState } from 'react';
import { ActivityIndicator } from 'react-native';
import { Alert, FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Button, Cover, Empty, Loading, colors, s } from '../components/ui';
import { friendlyError, listOpenLoans, markReturned, remindAll } from '../lib/db';
import { dueLabel, formatDate, todayIso } from '../lib/dates';
import type { LoanFull } from '../lib/types';

export default function LoansScreen() {
  const navigation = useNavigation();
  const [loans, setLoans] = useState<LoanFull[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [sending, setSending] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () =>
        sending ? (
          <ActivityIndicator color={colors.primary} style={{ marginRight: 16 }} />
        ) : (
          <Pressable onPress={chooseRemindAll} hitSlop={10} style={{ marginRight: 16 }}>
            <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 15 }}>✉ Remind…</Text>
          </Pressable>
        ),
    });
  });

  function chooseRemindAll() {
    Alert.alert('Send reminders', 'Each person gets one email listing all of their books. Who should get one?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Everyone with a book', onPress: () => previewRemindAll('all') },
      { text: 'Overdue only', onPress: () => previewRemindAll('overdue') },
    ]);
  }

  async function previewRemindAll(scope: 'overdue' | 'all') {
    setSending(true);
    try {
      const p = await remindAll(scope, true);
      setSending(false);
      if (!p.people) {
        Alert.alert('Nobody to remind', scope === 'overdue' ? 'No books are overdue.' : 'No books are lent out.');
        return;
      }
      Alert.alert(
        'Send now?',
        `This will email ${p.people} ${p.people === 1 ? 'person' : 'people'} about ${p.books} ${p.books === 1 ? 'book' : 'books'}.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Send', onPress: () => sendRemindAll(scope) },
        ],
      );
    } catch (e) {
      setSending(false);
      Alert.alert('Couldn’t check', e instanceof Error ? e.message : String(e));
    }
  }

  async function sendRemindAll(scope: 'overdue' | 'all') {
    setSending(true);
    try {
      const r = await remindAll(scope, false);
      const failed = r.failed ?? [];
      Alert.alert(
        failed.length ? 'Some reminders failed' : 'Reminders sent',
        `Sent to ${r.sent ?? 0} of ${r.people}.` + (failed.length ? `\n\nFailed: ${failed.map((f) => f.to).join(', ')}\n${failed[0].error}` : ''),
      );
      await load();
    } catch (e) {
      Alert.alert('Couldn’t send', e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  }

  const load = useCallback(async () => {
    try {
      setLoans(await listOpenLoans()); // sorted by due date, so overdue loans come first
      setError(null);
    } catch (e) {
      setError(friendlyError(e));
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  function confirmReturn(l: LoanFull) {
    Alert.alert('Mark as returned?', `${l.borrower.name} returned “${l.book.title}”.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Returned',
        onPress: async () => {
          try {
            await markReturned(l.id);
            await load();
          } catch (e) {
            Alert.alert('Couldn’t update', friendlyError(e));
          }
        },
      },
    ]);
  }

  if (!loans && !error) return <Loading />;
  const today = todayIso();
  const overdueCount = (loans ?? []).filter((l) => l.due_date < today).length;

  return (
    <View style={s.screen}>
      {!!loans?.length && (
        <Text style={[s.muted, { padding: 12 }]}>
          {loans.length} book{loans.length > 1 ? 's' : ''} lent out
          {overdueCount > 0 && <Text style={{ color: colors.overdue, fontWeight: '700' }}> · {overdueCount} overdue</Text>}
        </Text>
      )}
      {error && <Text style={[s.empty, { color: colors.danger }]}>{error}</Text>}
      <FlatList
        data={loans ?? []}
        keyExtractor={(l) => l.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />
        }
        ListEmptyComponent={<Empty text="No books are lent out right now." />}
        renderItem={({ item }) => {
          const overdue = item.due_date < today;
          return (
            <Pressable onPress={() => navigation.navigate('BookDetail', { bookId: item.book.id })} style={s.listRow}>
              <Cover uri={item.book.cover_url} size={40} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[s.body, { fontWeight: '600' }]} numberOfLines={1}>{item.book.title}</Text>
                <Text style={s.muted} numberOfLines={1}>{item.borrower.name}</Text>
                <Text style={[s.muted, overdue && { color: colors.overdue, fontWeight: '700' }]}>
                  Due {formatDate(item.due_date)} · {dueLabel(item.due_date)}
                </Text>
              </View>
              <Button title="Returned" variant="secondary" onPress={() => confirmReturn(item)} style={{ paddingVertical: 8, paddingHorizontal: 10 }} />
            </Pressable>
          );
        }}
      />
    </View>
  );
}
