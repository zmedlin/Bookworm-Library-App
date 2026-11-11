import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Empty, Loading, colors, s } from '../components/ui';
import { BorrowerWithCount, friendlyError, listBorrowers } from '../lib/db';

export default function BorrowersScreen() {
  const navigation = useNavigation();
  const [list, setList] = useState<BorrowerWithCount[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    try {
      setList(await listBorrowers());
      setError(null);
    } catch (e) {
      setError(friendlyError(e));
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (list ?? []).filter((b) => !q || b.name.toLowerCase().includes(q) || b.email.includes(q));
  }, [list, query]);

  if (!list && !error) return <Loading />;

  return (
    <View style={s.screen}>
      <View style={{ padding: 12 }}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search borrowers"
          placeholderTextColor={colors.muted}
          style={s.input}
        />
      </View>
      {error && <Text style={[s.empty, { color: colors.danger }]}>{error}</Text>}
      <FlatList
        data={shown}
        keyExtractor={(b) => b.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />
        }
        ListEmptyComponent={<Empty text="No borrowers yet. They’re added when you lend a book." />}
        renderItem={({ item }) => (
          <Pressable onPress={() => navigation.navigate('BorrowerDetail', { borrowerId: item.id })} style={s.listRow}>
            <View style={{ flex: 1 }}>
              <Text style={[s.body, { fontWeight: '600' }]}>{item.name}</Text>
              <Text style={s.muted}>
                {item.email} · {item.kind === 'student' ? 'Student' : 'Friend'}
              </Text>
            </View>
            {item.open_loans > 0 && (
              <Text style={{ color: colors.loan, fontWeight: '700' }}>{item.open_loans} out</Text>
            )}
          </Pressable>
        )}
      />
    </View>
  );
}
