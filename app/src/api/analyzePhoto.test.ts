jest.mock('expo-file-system', () => ({
  readAsStringAsync: jest.fn().mockResolvedValue('fakeBase64Data'),
  EncodingType: { Base64: 'base64' },
}));

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

import { analyzePhoto, queuePhotoForRetry, getQueuedPhotos, clearQueuedPhoto } from './analyzePhoto';

describe('analyzePhoto', () => {
  beforeEach(() => {
    (global as any).fetch = jest.fn();
  });

  it('reads the photo, posts it, and returns the parsed response', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ items: [] }),
    });
    const result = await analyzePhoto('file:///fake.jpg');
    expect(result).toEqual({ items: [] });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/analyze'),
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('throws when the response is not ok', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 502 });
    await expect(analyzePhoto('file:///fake.jpg')).rejects.toThrow('status 502');
  });
});

describe('photo retry queue', () => {
  it('queues, lists, and clears photos', async () => {
    await queuePhotoForRetry('file:///a.jpg');
    await queuePhotoForRetry('file:///b.jpg');
    expect(await getQueuedPhotos()).toEqual(['file:///a.jpg', 'file:///b.jpg']);
    await clearQueuedPhoto('file:///a.jpg');
    expect(await getQueuedPhotos()).toEqual(['file:///b.jpg']);
  });
});
