import { useState } from 'react';
import { Alert, Button, Image, StyleSheet, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
// Expo SDK 57 replaced the old FileSystem API (documentDirectory/copyAsync) with the
// File/Directory/Paths classes on the default export. The legacy submodule preserves
// the old surface we use here.
import * as FileSystem from 'expo-file-system/legacy';

interface Props {
  onPhotoCaptured: (uri: string) => void;
}

async function persistPhoto(cacheUri: string): Promise<string> {
  const filename = `${Date.now()}.jpg`;
  const destUri = `${FileSystem.documentDirectory}${filename}`;
  await FileSystem.copyAsync({ from: cacheUri, to: destUri });
  return destUri;
}

export default function CaptureScreen({ onPhotoCaptured }: Props) {
  const [previewUri, setPreviewUri] = useState<string | null>(null);

  async function takePhoto() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Camera Permission Required', 'Please enable camera access in your device settings to use this feature.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (!result.canceled) {
      const persistentUri = await persistPhoto(result.assets[0].uri);
      setPreviewUri(persistentUri);
      onPhotoCaptured(persistentUri);
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
      setPreviewUri(persistentUri);
      onPhotoCaptured(persistentUri);
    }
  }

  return (
    <View style={styles.container}>
      {previewUri && <Image source={{ uri: previewUri }} style={styles.preview} />}
      <Button title="Take photo" onPress={takePhoto} />
      <Button title="Choose from library" onPress={pickFromLibrary} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, padding: 16 },
  preview: { width: 240, height: 240, borderRadius: 12, marginBottom: 12 },
});
