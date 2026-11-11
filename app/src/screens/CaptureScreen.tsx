import { useState } from 'react';
import { ActivityIndicator, Alert, Button, Image, Platform, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
// Expo SDK 57 replaced the old FileSystem API (documentDirectory/copyAsync) with the
// File/Directory/Paths classes on the default export. The legacy submodule preserves
// the old surface we use here. This module isn't available on web, so persistPhoto
// skips it there — the browser already hands back a stable blob/data URI.
import * as FileSystem from 'expo-file-system/legacy';

interface Props {
  // Resolves once the photo has been read (or has failed); the screen shows a wait message until then.
  onPhotoCaptured: (uri: string) => void | Promise<void>;
  // Shown only where the phone's photo library can be read for glasses photos (iPhone).
  onImportFromGlasses?: () => void;
}

export async function persistPhoto(cacheUri: string): Promise<string> {
  if (Platform.OS === 'web') {
    return cacheUri;
  }
  const filename = `${Date.now()}.jpg`;
  const destUri = `${FileSystem.documentDirectory}${filename}`;
  await FileSystem.copyAsync({ from: cacheUri, to: destUri });
  return destUri;
}

export default function CaptureScreen({ onPhotoCaptured, onImportFromGlasses }: Props) {
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [reading, setReading] = useState(false);

  // Reading a photo takes 15-25 seconds on the free AI. Without a visible wait the screen looks
  // frozen, and a second tap would send the same photo twice.
  async function readPhoto(uri: string) {
    setPreviewUri(uri);
    setReading(true);
    try {
      await onPhotoCaptured(uri);
    } finally {
      setReading(false);
    }
  }

  async function takePhoto() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Camera Permission Required', 'Please enable camera access in your device settings to use this feature.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (!result.canceled) {
      const persistentUri = await persistPhoto(result.assets[0].uri);
      await readPhoto(persistentUri);
    }
  }

  async function pickFromLibrary() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Photo Library Permission Required', 'Please enable photo library access in your device settings to use this feature.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.7 });
    if (!result.canceled) {
      const persistentUri = await persistPhoto(result.assets[0].uri);
      await readPhoto(persistentUri);
    }
  }

  return (
    <View style={styles.container}>
      {previewUri && <Image source={{ uri: previewUri }} style={styles.preview} />}
      {reading && (
        <View style={styles.reading}>
          <ActivityIndicator />
          <Text style={styles.readingText}>Reading your photo… this takes about 20 seconds.</Text>
        </View>
      )}
      <Button title="Take photo" onPress={takePhoto} disabled={reading} />
      <Button title="Choose from library" onPress={pickFromLibrary} disabled={reading} />
      {onImportFromGlasses && <Button title="From smart glasses" onPress={onImportFromGlasses} disabled={reading} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, padding: 16 },
  preview: { width: 240, height: 240, borderRadius: 12, marginBottom: 12 },
  reading: { alignItems: 'center', gap: 8, marginBottom: 8 },
  readingText: { fontSize: 14, color: '#666', textAlign: 'center' },
});
