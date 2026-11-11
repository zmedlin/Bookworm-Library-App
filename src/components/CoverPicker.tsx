import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Modal, Pressable, Text, View } from 'react-native';
import { Button, colors, s } from './ui';
import { findCovers } from '../lib/lookup';

/** Full-screen list of covers found online; tap one to use it. */
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

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    setBroken(new Set());
    findCovers({ isbn13, title, author })
      .then(setUrls)
      .finally(() => setLoading(false));
  }, [visible, isbn13, title, author]);

  const shown = urls.filter((u) => !broken.has(u));

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[s.screen, { paddingTop: 16 }]}>
        <Text style={[s.h1, { paddingHorizontal: 16 }]}>Choose a cover</Text>
        <Text style={[s.muted, { paddingHorizontal: 16, marginBottom: 8 }]} numberOfLines={2}>
          Covers found online for “{title}”{author ? ` by ${author}` : ''}
        </Text>
        {loading ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
        ) : (
          <FlatList
            data={shown}
            keyExtractor={(u) => u}
            numColumns={3}
            contentContainerStyle={{ padding: 8 }}
            ListEmptyComponent={
              <Text style={s.empty}>No covers found. Try taking a photo of the cover instead.</Text>
            }
            renderItem={({ item }) => (
              <Pressable onPress={() => onPick(item)} style={{ flex: 1 / 3, padding: 6 }}>
                <Image
                  source={{ uri: item }}
                  style={{ width: '100%', aspectRatio: 2 / 3, borderRadius: 6, backgroundColor: colors.line }}
                  resizeMode="cover"
                  onError={() => setBroken((b) => new Set(b).add(item))}
                  onLoad={(e) => {
                    // Some sources return a 1×1 placeholder when there's no image.
                    const { width } = e.nativeEvent.source;
                    if (width && width < 10) setBroken((b) => new Set(b).add(item));
                  }}
                />
              </Pressable>
            )}
          />
        )}
        <View style={s.pad}>
          <Button title="Cancel" variant="secondary" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}
