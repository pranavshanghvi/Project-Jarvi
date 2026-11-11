jest.mock('expo-media-library/legacy', () => ({}));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

import { getUsedPhotoIds, markPhotoUsed, pickGlassesAlbum } from './glassesPhotos';

describe('pickGlassesAlbum', () => {
  it('finds the Meta album under either of its names', () => {
    expect(pickGlassesAlbum([{ title: 'Recents' }, { title: 'Meta AI' }])?.title).toBe('Meta AI');
    expect(pickGlassesAlbum([{ title: 'Meta View' }, { title: 'WhatsApp' }])?.title).toBe('Meta View');
  });

  it('prefers the fuller album when there are two', () => {
    const picked = pickGlassesAlbum([
      { title: 'Meta View', assetCount: 3 },
      { title: 'Meta AI', assetCount: 40 },
    ]);
    expect(picked?.title).toBe('Meta AI');
  });

  it('returns null when there is no glasses album', () => {
    expect(pickGlassesAlbum([{ title: 'Recents' }, { title: 'Favourites' }])).toBeNull();
  });
});

describe('used photo tracking', () => {
  it('remembers a photo once and does not duplicate it', async () => {
    await markPhotoUsed('asset-1');
    await markPhotoUsed('asset-1');
    await markPhotoUsed('asset-2');
    expect(await getUsedPhotoIds()).toEqual(['asset-1', 'asset-2']);
  });
});
