import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, ScrollView, Text, View } from 'react-native';
import CoverPicker from '../components/CoverPicker';
import { getCoverPhoto, saveCoverCopy } from '../lib/coverPhoto';
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
  const [copies, setCopies] = useState('1');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);

  function openPicker() {
    if (!title.trim()) return Alert.alert('Add a title first', 'The title is used to search for covers.');
    setPickerOpen(true);
  }

  /** A cover chosen online: show it now, then swap in our own saved copy. */
  async function pickOnline(url: string) {
    setPickerOpen(false);
    setCoverUrl(url);
    setPhotoBusy(true);
    try {
      setCoverUrl(await saveCoverCopy(url));
    } finally {
      setPhotoBusy(false);
    }
  }

  async function photo(source: 'camera' | 'library') {
    setPhotoBusy(true);
    try {
      const url = await getCoverPhoto(source);
      if (url) setCoverUrl(url);
    } catch (e) {
      Alert.alert('Couldn’t add photo', e instanceof Error ? e.message : String(e));
    } finally {
      setPhotoBusy(false);
    }
  }

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
            setCopies(String(b.copies ?? 1));
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

    const n = Number.parseInt(copies, 10);
    if (!Number.isInteger(n) || n < 1 || n > 999) return Alert.alert('Check copies', 'Enter how many copies you own (1 or more).');
    const input = {
      copies: n,
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
            <Text style={s.body}>No details found online for this ISBN. Fill in what you know, then add a cover below.</Text>
          </View>
        )}
        <View style={[s.row, { marginBottom: 16, alignItems: 'flex-start' }]}>
          <View>
            <Cover uri={coverUrl} size={100} />
            {photoBusy && (
              <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, justifyContent: 'center' }}>
                <ActivityIndicator color={colors.primary} size="large" />
              </View>
            )}
          </View>
          <View style={{ flex: 1, marginLeft: 14 }}>
            {!coverUrl && <Text style={[s.muted, { marginBottom: 4 }]}>No cover yet.</Text>}
            <Button title="Find cover online" variant="secondary" onPress={openPicker} style={{ paddingVertical: 9 }} />
            <Button title="Take a photo" variant="secondary" onPress={() => photo('camera')} style={{ paddingVertical: 9 }} />
            <Text style={[s.muted, { color: colors.primary, marginTop: 4 }]} onPress={() => photo('library')}>
              Choose from gallery
            </Text>
            {coverUrl && (
              <Text style={[s.muted, { color: colors.danger, marginTop: 8 }]} onPress={() => setCoverUrl(null)}>
                Remove cover
              </Text>
            )}
          </View>
        </View>
        <CoverPicker
          visible={pickerOpen}
          isbn13={isbn.trim() ? isbn.trim() : null}
          title={title}
          author={authors.split(',')[0]?.trim() ?? ''}
          onPick={pickOnline}
          onClose={() => setPickerOpen(false)}
        />
        <Field label="Title *" value={title} onChangeText={setTitle} />
        <Field label="Author(s), comma-separated" value={authors} onChangeText={setAuthors} />
        <Field label="Publisher" value={publisher} onChangeText={setPublisher} />
        <Field label="Year" value={year} onChangeText={setYear} keyboardType="number-pad" maxLength={4} />
        <Field label="ISBN" value={isbn} onChangeText={setIsbn} keyboardType="number-pad" editable={!scannedIsbn || editing} />
        <Field label="Copies you own" value={copies} onChangeText={setCopies} keyboardType="number-pad" maxLength={3} />
        <Field label="Notes" value={notes} onChangeText={setNotes} multiline />
        <Button title={editing ? 'Save changes' : 'Add to library'} onPress={save} loading={saving} disabled={!title.trim() || photoBusy} />
        <Button title="Cancel" variant="secondary" onPress={() => navigation.goBack()} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
