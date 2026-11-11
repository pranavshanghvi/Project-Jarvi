import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { AnalyzePhotoResponse, completeNutrients } from '../types/nutrition';

const QUEUE_KEY = 'jarvi.pendingAnalysis';
const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:3000';
const PROXY_SECRET = process.env.EXPO_PUBLIC_PROXY_SECRET;

// Longest-edge-ish cap for what gets uploaded. The AI reads a meal fine at this size.
const UPLOAD_WIDTH = 1024;

// A photo straight off an iPhone cannot be sent as it is, for two separate reasons found on a
// real phone on 2026-11-11: it is usually HEIC, which the free vision model rejects outright
// ("unrecognized image format"), and at several megabytes it is over the server's 4.5 MB request
// limit, so it never arrives at all. Re-encoding to a 1024px-wide JPEG fixes both and keeps the
// upload around 200 KB. The saved photo on the phone is untouched; only the copy sent is shrunk.
export async function prepareForUpload(photoUri: string): Promise<string> {
  const context = ImageManipulator.manipulate(photoUri);
  context.resize({ width: UPLOAD_WIDTH });
  const rendered = await context.renderAsync();
  const result = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.8, base64: true });
  if (!result.base64) throw new Error('Could not prepare the photo for upload');
  return result.base64;
}

export async function analyzePhoto(photoUri: string): Promise<AnalyzePhotoResponse> {
  const imageBase64 = await prepareForUpload(photoUri);
  const response = await fetch(`${API_BASE_URL}/api/analyze`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(PROXY_SECRET ? { 'x-proxy-secret': PROXY_SECRET } : {}),
    },
    body: JSON.stringify({ imageBase64, mimeType: 'image/jpeg' }),
  });
  if (!response.ok) {
    // 503 means every free AI provider is out of quota right now: the caller keeps the photo
    // queued and tries again later. It never falls back to a paid model.
    throw new Error(`Analyze request failed with status ${response.status}`);
  }
  const body = (await response.json()) as AnalyzePhotoResponse;
  return { items: (body.items ?? []).map((item) => ({ ...item, nutrients: completeNutrients(item.nutrients) })) };
}

export async function queuePhotoForRetry(photoUri: string): Promise<void> {
  const queue = await getQueuedPhotos();
  queue.push(photoUri);
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export async function getQueuedPhotos(): Promise<string[]> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  return raw ? JSON.parse(raw) : [];
}

export async function clearQueuedPhoto(photoUri: string): Promise<void> {
  const queue = await getQueuedPhotos();
  const next = queue.filter((uri) => uri !== photoUri);
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(next));
}

export function subscribeToReconnect(onReconnect: () => void): () => void {
  return NetInfo.addEventListener((state) => {
    if (state.isConnected) {
      onReconnect();
    }
  });
}
