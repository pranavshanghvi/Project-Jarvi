import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { AnalyzePhotoResponse } from '../types/nutrition';

const QUEUE_KEY = 'jarvi.pendingAnalysis';
const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:3000';

export async function analyzePhoto(photoUri: string): Promise<AnalyzePhotoResponse> {
  const imageBase64 = await FileSystem.readAsStringAsync(photoUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const response = await fetch(`${API_BASE_URL}/api/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageBase64, mimeType: 'image/jpeg' }),
  });
  if (!response.ok) {
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
