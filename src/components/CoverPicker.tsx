import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Linking, Modal, Pressable, Text, TextInput, View } from 'react-native';
import { Button, colors, s } from './ui';
import { findCovers, mainTitle, webImageSearchUrl } from '../lib/lookup';

/** Full-screen list of covers found online; tap one to use it. Also: web search and paste a link. */
export default function CoverPicker({
  visible,
  isbn13,
  title,
  author,
  onPick,
  onClose,
}: {
  visible: boolean;
  isbn13: string | null;
  title: string;
  author: string;
  onPick: (url: string) => void;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [urls, setUrls] = useState<string[]>([]);
  const [broken, setBroken] = useState<Set<string>>(new Set());
  const [pasting, setPasting] = useState(false);
  const [link, setLink] = useState('');
  const [linkError, setLinkError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    setBroken(new Set());
    setPasting(false);
    setLink('');
    setLinkError(null);
    findCovers({ isbn13, title, author })
      .then(setUrls)
      .catch(() => setUrls([]))
      .finally(() => setLoading(false));
  }, [visible, isbn13, title, author]);

  const shown = urls.filter((u) => !broken.has(u));
  const markBroken = (u: string) => setBroken((b) => new Set(b).add(u));

  function useLink() {
    const u = link.trim();
    if (!/^https?:\/\/\S+$/i.test(u)) {
      setLinkError('Paste a full image address starting with http.');
      return;
    }
    setChecking(true);
    setLinkError(null);
    Image.getSize(
      u,
      (w) => {
        setChecking(false);
        if (w < 40) setLinkError('That image is too small to be a cover.');
        else onPick(u.replace(/^http:\/\//i, 'https://'));
      },
      () => {
        setChecking(false);
        setLinkError('Couldn’t load an image from that link. In the browser, long-press the image and choose “Copy image address”.');
      },
    );
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[s.screen, { paddingTop: 16 }]}>
        <Text style={[s.h1, { paddingHorizontal: 16 }]}>Choose a cover</Text>
        <Text style={[s.muted, { paddingHorizontal: 16, marginBottom: 8 }]} numberOfLines={2}>
          “{mainTitle(title)}”{author ? ` by ${author}` : ''}
          {!loading && shown.length > 0 ? ` · ${shown.length} found` : ''}
        </Text>
        {loading ? (
          <View style={{ alignItems: 'center', marginTop: 40 }}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[s.muted, { marginTop: 10 }]}>Searching other editions, Amazon, Apple Books and Google Books…</Text>
          </View>
        ) : (
          <FlatList
            style={{ flex: 1 }}
            data={shown}
            keyExtractor={(u) => u}
            numColumns={3}
            contentContainerStyle={{ padding: 8 }}
            ListEmptyComponent={
              <Text style={s.empty}>No covers found online. Try “Search the web” below, or take a photo.</Text>
            }
            renderItem={({ item }) => (
              <Pressable onPress={() => onPick(item)} style={{ flex: 1 / 3, padding: 6 }}>
                <Image
                  source={{ uri: item }}
                  style={{ width: '100%', aspectRatio: 2 / 3, borderRadius: 6, backgroundColor: colors.line }}
                  resizeMode="cover"
                  onError={() => markBroken(item)}
                  onLoad={(e) => {
                    // Some sources return a tiny placeholder when they have no image.
                    const { width } = e.nativeEvent.source;
                    if (width && width < 40) markBroken(item);
                  }}
                />
              </Pressable>
            )}
          />
        )}

        <View style={[s.pad, { borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.card }]}>
          {pasting ? (
            <>
              <TextInput
                value={link}
                onChangeText={setLink}
                placeholder="Paste image address (https://…)"
                placeholderTextColor={colors.muted}
                autoCapitalize="none"
                autoCorrect={false}
                style={s.input}
              />
              {linkError && <Text style={{ color: colors.danger, marginTop: 6 }}>{linkError}</Text>}
              <View style={s.row}>
                <Button title="Use this image" onPress={useLink} loading={checking} disabled={!link.trim()} style={{ flex: 1, marginRight: 6 }} />
                <Button title="Back" variant="secondary" onPress={() => setPasting(false)} style={{ flex: 1 }} />
              </View>
            </>
          ) : (
            <>
              <View style={s.row}>
                <Button
                  title="Search the web"
                  variant="secondary"
                  onPress={() => Linking.openURL(webImageSearchUrl(title, author))}
                  style={{ flex: 1, marginRight: 6 }}
                />
                <Button title="Paste image link" variant="secondary" onPress={() => setPasting(true)} style={{ flex: 1 }} />
              </View>
              <Text style={[s.muted, { fontSize: 12, marginBottom: 4 }]}>
                Found one on the web? Long-press it and copy the image address, then use “Paste image link”. Or save it and use “Choose from gallery”.
              </Text>
              <Button title="Cancel" variant="secondary" onPress={onClose} />
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}
