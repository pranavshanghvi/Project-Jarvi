import AsyncStorage from '@react-native-async-storage/async-storage';
import * as MediaLibrary from 'expo-media-library/legacy';

// Ray-Ban Meta / Oakley Meta glasses hand their photos to the Meta AI app, which (with its
// "import to Photos" setting on) saves them into the iPhone photo library in an album named after
// the app. The app has been called both "Meta AI" and "Meta View", so match either.
const GLASSES_ALBUM = /meta/i;
const USED_KEY = 'jarvi.glasses.usedAssetIds';

export interface GlassesPhoto {
  id: string;
  thumbnailUri: string;
  takenAt: number;
}

export interface GlassesPhotoList {
  photos: GlassesPhoto[];
  // 'glasses' when a Meta album was found; 'recent' when it was not and these are simply the
  // newest photos on the phone.
  source: 'glasses' | 'recent';
  permissionDenied: boolean;
}

export function pickGlassesAlbum<T extends { title: string; assetCount?: number }>(albums: T[]): T | null {
  const matches = albums.filter((a) => GLASSES_ALBUM.test(a.title));
  if (matches.length === 0) return null;
  return matches.sort((a, b) => (b.assetCount ?? 0) - (a.assetCount ?? 0))[0];
}

export async function getUsedPhotoIds(): Promise<string[]> {
  const raw = await AsyncStorage.getItem(USED_KEY);
  return raw ? JSON.parse(raw) : [];
}

// Remember a photo once its meal is saved so it is not offered again.
export async function markPhotoUsed(id: string): Promise<void> {
  const used = await getUsedPhotoIds();
  if (used.includes(id)) return;
  await AsyncStorage.setItem(USED_KEY, JSON.stringify([...used, id].slice(-500)));
}

export async function listGlassesPhotos(limit = 24): Promise<GlassesPhotoList> {
  const permission = await MediaLibrary.requestPermissionsAsync(false, ['photo']);
  if (!permission.granted) return { photos: [], source: 'recent', permissionDenied: true };

  const album = pickGlassesAlbum(await MediaLibrary.getAlbumsAsync({ includeSmartAlbums: false }));
  const page = await MediaLibrary.getAssetsAsync({
    ...(album ? { album } : {}),
    mediaType: 'photo',
    sortBy: [['creationTime', false]],
    first: limit,
  });
  const used = new Set(await getUsedPhotoIds());
  return {
    photos: page.assets
      .filter((asset) => !used.has(asset.id))
      .map((asset) => ({ id: asset.id, thumbnailUri: asset.uri, takenAt: asset.creationTime })),
    source: album ? 'glasses' : 'recent',
    permissionDenied: false,
  };
}

// Photo-library items are not ordinary files; this asks iOS for a real file path that the
// analysis step can read (downloading from iCloud first if the original is not on the phone).
export async function getPhotoFileUri(id: string): Promise<string> {
  const info = await MediaLibrary.getAssetInfoAsync(id, { shouldDownloadFromNetwork: true });
  if (!info.localUri) throw new Error('Could not read that photo from the library');
  return info.localUri;
}
