// Take or choose a photo of a book cover, shrink it, and upload it to Supabase Storage.
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { supabase } from './supabase';

const BUCKET = 'covers';
const MAX_WIDTH = 600;

/** Returns a public image URL, or null if the user cancelled. */
export async function getCoverPhoto(source: 'camera' | 'library'): Promise<string | null> {
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw new Error('Camera permission is needed to photograph a cover.');
  }
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    allowsEditing: true, // lets you crop to the cover
    aspect: [2, 3],
    quality: 1,
  };
  const result =
    source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled || !result.assets?.[0]) return null;
  const asset = result.assets[0];

  // Shrink to keep storage small and covers fast to load.
  let ctx = ImageManipulator.manipulate(asset.uri);
  if ((asset.width ?? 0) > MAX_WIDTH) ctx = ctx.resize({ width: MAX_WIDTH });
  const image = await ctx.renderAsync();
  const saved = await image.saveAsync({ compress: 0.75, format: SaveFormat.JPEG });

  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error('Not signed in.');
  const path = `${u.user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  const bytes = await (await fetch(saved.uri)).arrayBuffer();
  const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, { contentType: 'image/jpeg' });
  if (error) throw new Error(error.message);
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

const TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

/**
 * Save our own copy of a cover found online, so it keeps working even if the
 * source site changes or removes it. Returns the stored URL, or the original
 * URL if copying isn't possible.
 */
export async function saveCoverCopy(url: string): Promise<string> {
  if (url.includes('/storage/v1/object/public/covers/')) return url; // already ours
  try {
    const res = await fetch(url);
    const type = (res.headers.get('content-type') ?? '').split(';')[0].trim();
    if (!res.ok || !TYPES[type]) return url;
    const bytes = await res.arrayBuffer();
    if (bytes.byteLength < 1000 || bytes.byteLength > 5_000_000) return url;
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return url;
    const path = `${u.user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${TYPES[type]}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, { contentType: type });
    if (error) return url;
    return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  } catch {
    return url;
  }
}
