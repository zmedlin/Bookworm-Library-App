import React, { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, ScrollView, Text, View } from 'react-native';
import { Button, Cover, Field, Loading, colors, s } from '../components/ui';
import { lookupIsbn } from '../lib/lookup';
import { createBook, friendlyError, getBookStatus, updateBook } from '../lib/db';
import { normalizeIsbn } from '../lib/isbn';
import type { StackProps } from '../navigation';

/** Add a new book (from a scan or by hand) or edit an existing one. */
export default function ConfirmBookScreen({ route, navigation }: StackProps<'ConfirmBook'>) {
  const { isbn13: scannedIsbn, bookId } = route.params ?? {};
  const editing = !!bookId;

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isbn, setIsbn] = useState(scannedIsbn ?? '');
  const [title, setTitle] = useState('');
  const [authors, setAuthors] = useState('');
  const [publisher, setPublisher] = useState('');
  const [year, setYear] = useState('');
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    navigation.setOptions({ title: editing ? 'Edit book' : 'Add book' });
    (async () => {
      try {
        if (bookId) {
          const b = await getBookStatus(bookId);
          if (b) {
            setIsbn(b.isbn13 ?? '');
            setTitle(b.title);
            setAuthors(b.authors.join(', '));
            setPublisher(b.publisher ?? '');
            setYear(b.published_year ? String(b.published_year) : '');
            setCoverUrl(b.cover_url);
            setNotes(b.notes ?? '');
          }
        } else if (scannedIsbn) {
          const info = await lookupIsbn(scannedIsbn);
          if (info) {
            setTitle(info.title);
            setAuthors(info.authors.join(', '));
            setPublisher(info.publisher ?? '');
            setYear(info.published_year ? String(info.published_year) : '');
            setCoverUrl(info.cover_url);
          } else setNotFound(true);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [bookId, scannedIsbn, editing, navigation]);

  async function save() {
    let isbn13: string | null = null;
    if (isbn.trim()) {
      const r = normalizeIsbn(isbn);
      if (!r.ok) return Alert.alert('Check the ISBN', 'That ISBN isn’t valid. Fix it or leave it blank.');
      isbn13 = r.isbn13;
    }
    const y = year.trim() ? Number(year.trim()) : null;
    if (y !== null && (!Number.isInteger(y) || y < 1000 || y > 2100))
      return Alert.alert('Check the year', 'Enter a 4-digit year or leave it blank.');

    const input = {
      isbn13,
      title: title.trim(),
      authors: authors.split(',').map((a) => a.trim()).filter(Boolean),
      publisher: publisher.trim() || null,
      published_year: y,
      cover_url: coverUrl,
      notes: notes.trim() || null,
    };
    setSaving(true);
    try {
      if (bookId) {
        await updateBook(bookId, input);
        navigation.goBack();
      } else {
        const b = await createBook(input);
        navigation.replace('BookDetail', { bookId: b.id });
      }
    } catch (e) {
      Alert.alert('Couldn’t save', friendlyError(e));
      setSaving(false);
    }
  }

  if (loading) return <Loading />;

  return (
    <KeyboardAvoidingView behavior="height" style={s.screen}>
      <ScrollView contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
        {notFound && (
          <View style={[s.card, { backgroundColor: '#FFF6E5', borderColor: '#F0D9A8' }]}>
            <Text style={s.body}>No details found online for this ISBN. Fill in what you know.</Text>
          </View>
        )}
        <View style={{ alignItems: 'center', marginBottom: 16 }}>
          <Cover uri={coverUrl} size={110} />
          {coverUrl && (
            <Text style={[s.muted, { marginTop: 6, color: colors.primary }]} onPress={() => setCoverUrl(null)}>
              Remove cover
            </Text>
          )}
        </View>
        <Field label="Title *" value={title} onChangeText={setTitle} />
        <Field label="Author(s), comma-separated" value={authors} onChangeText={setAuthors} />
        <Field label="Publisher" value={publisher} onChangeText={setPublisher} />
        <Field label="Year" value={year} onChangeText={setYear} keyboardType="number-pad" maxLength={4} />
        <Field label="ISBN" value={isbn} onChangeText={setIsbn} keyboardType="number-pad" editable={!scannedIsbn || editing} />
        <Field label="Notes" value={notes} onChangeText={setNotes} multiline />
        <Button title={editing ? 'Save changes' : 'Add to library'} onPress={save} loading={saving} disabled={!title.trim()} />
        <Button title="Cancel" variant="secondary" onPress={() => navigation.goBack()} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
