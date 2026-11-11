// SDK 57 moved readAsStringAsync to the legacy entry point; the default export throws on it.
import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { AnalyzePhotoResponse } from '../types/nutrition';

const QUEUE_KEY = 'jarvi.pendingAnalysis';
const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:3000';
const PROXY_SECRET = process.env.EXPO_PUBLIC_PROXY_SECRET;

export async function analyzePhoto(photoUri: string): Promise<AnalyzePhotoResponse> {
  const imageBase64 = await FileSystem.readAsStringAsync(photoUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
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
  return (await response.json()) as AnalyzePhotoResponse;
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
