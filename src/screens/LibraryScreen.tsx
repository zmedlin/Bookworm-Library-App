import React, { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Chip, Cover, Empty, Loading, StatusBadge, colors, s } from '../components/ui';
import { friendlyError, listBooks, statusOf } from '../lib/db';
import type { BookStatus, BookWithStatus } from '../lib/types';

type Filter = 'all' | BookStatus;
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'on_shelf', label: 'On shelf' },
  { key: 'on_loan', label: 'On loan' },
  { key: 'overdue', label: 'Overdue' },
];

export default function LibraryScreen() {
  const navigation = useNavigation();
  const [books, setBooks] = useState<BookWithStatus[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable onPress={() => navigation.navigate('ConfirmBook', {})} hitSlop={12} style={{ marginRight: 16 }}>
          <Ionicons name="add" size={28} color={colors.primary} />
        </Pressable>
      ),
    });
  }, [navigation]);

  const load = useCallback(async () => {
    try {
      setBooks(await listBooks());
      setError(null);
    } catch (e) {
      setError(friendlyError(e));
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (books ?? []).filter((b) => {
      if (filter !== 'all' && statusOf(b) !== filter) return false;
      if (!q) return true;
      return (
        b.title.toLowerCase().includes(q) ||
        b.authors.some((a) => a.toLowerCase().includes(q)) ||
        (b.isbn13 ?? '').includes(q)
      );
    });
  }, [books, query, filter]);

  if (!books && !error) return <Loading />;

  return (
    <View style={s.screen}>
      <View style={{ padding: 12, paddingBottom: 4 }}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search title, author or ISBN"
          placeholderTextColor={colors.muted}
          style={s.input}
          clearButtonMode="while-editing"
        />
        <View style={[s.row, { flexWrap: 'wrap', marginTop: 10 }]}>
          {FILTERS.map((f) => (
            <Chip key={f.key} label={f.label} selected={filter === f.key} onPress={() => setFilter(f.key)} />
          ))}
        </View>
        <Text style={s.muted}>
          {shown.length} of {books?.length ?? 0} books
        </Text>
      </View>
      {error && <Text style={[s.empty, { color: colors.danger }]}>{error}</Text>}
      <FlatList
        data={shown}
        keyExtractor={(b) => b.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />
        }
        ListEmptyComponent={
          books?.length ? <Empty text="No books match." /> : <Empty text="Your library is empty. Scan a book to add it." />
        }
        renderItem={({ item }) => (
          <Pressable onPress={() => navigation.navigate('BookDetail', { bookId: item.id })} style={s.listRow}>
            <Cover uri={item.cover_url} size={40} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={[s.body, { fontWeight: '600' }]} numberOfLines={2}>{item.title}</Text>
              <Text style={s.muted} numberOfLines={1}>{item.authors.join(', ')}</Text>
              {item.borrower_name && <Text style={s.muted} numberOfLines={1}>→ {item.borrower_name}</Text>}
            </View>
            <StatusBadge status={statusOf(item)} />
          </Pressable>
        )}
      />
    </View>
  );
}
