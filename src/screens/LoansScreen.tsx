import React, { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Button, Cover, Empty, Loading, colors, s } from '../components/ui';
import { friendlyError, listOpenLoans, markReturned } from '../lib/db';
import { dueLabel, formatDate, todayIso } from '../lib/dates';
import type { LoanFull } from '../lib/types';

export default function LoansScreen() {
  const navigation = useNavigation();
  const [loans, setLoans] = useState<LoanFull[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

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
