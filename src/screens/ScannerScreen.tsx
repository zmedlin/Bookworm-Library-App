import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Linking, StyleSheet, Text, TextInput, View } from 'react-native';
import { BarcodeScanningResult, CameraView, useCameraPermissions } from 'expo-camera';
import { useFocusEffect, useIsFocused, useNavigation } from '@react-navigation/native';
import { Button, colors, s } from '../components/ui';
import { normalizeIsbn } from '../lib/isbn';
import { findBookByIsbn, friendlyError } from '../lib/db';

export default function ScannerScreen() {
  const navigation = useNavigation();
  const focused = useIsFocused();
  const [permission, requestPermission] = useCameraPermissions();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState('');
  const locked = useRef(false);
  const lastBad = useRef<{ code: string; at: number } | null>(null);

  // Ready to scan again whenever this screen comes back into view.
  useFocusEffect(
    useCallback(() => {
      locked.current = false;
      setBusy(false);
      setMessage(null);
    }, []),
  );

  const handleCode = useCallback(
    async (raw: string) => {
      if (locked.current) return;
      const result = normalizeIsbn(raw);
      if (!result.ok) {
        const now = Date.now();
        if (lastBad.current?.code === raw && now - lastBad.current.at < 3000) return;
        lastBad.current = { code: raw, at: now };
        setMessage(
          result.reason === 'not_a_book_code'
            ? 'That’s not an ISBN barcode. Look for the barcode starting with 978 or 979.'
            : 'That code didn’t read correctly. Try again.',
        );
        return;
      }
      locked.current = true;
      setBusy(true);
      setMessage(null);
      try {
        const existing = await findBookByIsbn(result.isbn13);
        if (existing) navigation.navigate('BookDetail', { bookId: existing.id });
        else navigation.navigate('ConfirmBook', { isbn13: result.isbn13 });
      } catch (e) {
        setMessage(friendlyError(e));
        locked.current = false;
        setBusy(false);
      }
    },
    [navigation],
  );

  const onScanned = useCallback(
    (r: BarcodeScanningResult) => {
      if (!locked.current) handleCode(r.data);
    },
    [handleCode],
  );

  function submitManual() {
    const r = normalizeIsbn(manual);
    if (!r.ok) {
      setMessage('That isn’t a valid ISBN. Check the digits (10 or 13).');
      return;
    }
    setManual('');
    locked.current = false;
    handleCode(r.isbn13);
  }

  let cameraArea: React.ReactNode;
  if (!permission) cameraArea = <ActivityIndicator color="#fff" />;
  else if (!permission.granted)
    cameraArea = (
      <View style={{ padding: 24 }}>
        <Text style={{ color: '#fff', textAlign: 'center', marginBottom: 12 }}>
          Bookworm needs the camera to scan book barcodes.
        </Text>
        <Button
          title={permission.canAskAgain ? 'Allow camera' : 'Open settings'}
          onPress={() => (permission.canAskAgain ? requestPermission() : Linking.openSettings())}
        />
      </View>
    );
  else if (focused)
    cameraArea = (
      <>
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['ean13', 'upc_a', 'ean8'] }}
          onBarcodeScanned={busy ? undefined : onScanned}
        />
        <View pointerEvents="none" style={styles.frame} />
        {busy && <ActivityIndicator size="large" color="#fff" style={{ position: 'absolute' }} />}
      </>
    );

  return (
    <KeyboardAvoidingView behavior="height" style={s.screen}>
      <View style={styles.camera}>{cameraArea}</View>
      <View style={s.pad}>
        <Text style={[s.muted, { textAlign: 'center' }]}>
          Point the camera at the barcode on the back of a book.
        </Text>
        {message && <Text style={styles.message}>{message}</Text>}
        <View style={[s.row, { marginTop: 12 }]}>
          <TextInput
            value={manual}
            onChangeText={setManual}
            placeholder="Or type an ISBN"
            placeholderTextColor={colors.muted}
            keyboardType="number-pad"
            style={[s.input, { flex: 1, marginRight: 8 }]}
            onSubmitEditing={submitManual}
            returnKeyType="search"
          />
          <Button title="Go" onPress={submitManual} disabled={!manual.trim()} style={{ paddingHorizontal: 20 }} />
        </View>
        <Button title="Add a book without a barcode" variant="secondary" onPress={() => navigation.navigate('ConfirmBook', {})} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  camera: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  frame: { width: '78%', height: 140, borderWidth: 3, borderColor: 'rgba(255,255,255,0.85)', borderRadius: 14 },
  message: { color: colors.danger, textAlign: 'center', marginTop: 8, fontWeight: '600' },
});
