const mockSaveAsync = jest.fn().mockResolvedValue({ base64: 'fakeJpegBase64' });
const mockResize = jest.fn();
jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg' },
  ImageManipulator: {
    manipulate: jest.fn(() => ({
      resize: mockResize,
      renderAsync: jest.fn().mockResolvedValue({ saveAsync: mockSaveAsync }),
    })),
  },
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

  it('sends a shrunken JPEG copy, never the original file (iPhone photos are HEIC and too big)', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ items: [] }) });
    await analyzePhoto('file:///fake.heic');
    expect(mockResize).toHaveBeenCalledWith({ width: 1024 });
    expect(mockSaveAsync).toHaveBeenCalledWith(expect.objectContaining({ format: 'jpeg', base64: true }));
    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(body).toEqual({ imageBase64: 'fakeJpegBase64', mimeType: 'image/jpeg' });
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
