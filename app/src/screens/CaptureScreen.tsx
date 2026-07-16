import { useState } from 'react';
import { Alert, Button, Image, StyleSheet, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

interface Props {
  onPhotoCaptured: (uri: string) => void;
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
      setPreviewUri(result.assets[0].uri);
      onPhotoCaptured(result.assets[0].uri);
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
      setPreviewUri(result.assets[0].uri);
      onPhotoCaptured(result.assets[0].uri);
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
