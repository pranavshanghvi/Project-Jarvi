import { ReactNode, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { analyzePhoto, queuePhotoForRetry } from '../api/analyzePhoto';
import { persistPhoto } from '../data/dayData';
import { parsePhotoTime } from '../photos/photoTime';
import { MealDraft } from '../navigation/types';
import { Body, Muted, OutlineButton, Title } from '../ui/kit';
import { BottomSheet, SheetOption } from '../ui/sheet';
import { colors } from '../ui/theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  onDraft: (draft: MealDraft) => void;
  onGlasses: () => void;
}

const n = (calories: number, proteinG: number, carbsG: number, fatG: number) => ({ calories, proteinG, carbsG, fatG, saturatedFatG: fatG / 2, fiberG: 2, sugarG: 3, addedSugarG: 1, sodiumMg: 300, cholesterolMg: 20 });
const SAMPLE_MEAL: MealDraft['items'] = [
  { name: 'Pizza crust', confidence: 'normal', portionDescription: '1 crust, about 120 g', nutrients: n(250, 8, 48, 3) },
  { name: 'Mozzarella', confidence: 'normal', portionDescription: '8 slices, about 120 g', nutrients: n(280, 20, 3, 21) },
  { name: 'Tomato sauce', confidence: 'low', portionDescription: 'Half a cup', nutrients: n(50, 2, 10, 0) },
];

export default function AddMealSheet({ visible, onClose, onDraft, onGlasses }: Props) {
  const [reading, setReading] = useState(false);

  // Reading takes 15-25 seconds on the free AI, so the sheet stays up with a spinner; otherwise
  // the app looks frozen and a second tap would send the same photo twice.
  async function read(sourceUri: string, takenAt?: number) {
    setReading(true);
    let photoUri = sourceUri;
    try {
      photoUri = await persistPhoto(sourceUri);
      const { items } = await analyzePhoto(photoUri);
      onDraft({ photoUri, items, takenAt });
    } catch {
      await queuePhotoForRetry(photoUri);
      Alert.alert('Photo saved for later', 'The food reader could not read this photo right now. It will be tried again when the reader is back.');
      onClose();
    } finally {
      setReading(false);
    }
  }

  async function takePhoto() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return Alert.alert('Camera access is off', 'Turn on camera access for this app in Settings to photograph a meal.');
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (!result.canceled) read(result.assets[0].uri);
  }

  async function pickPhoto() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return Alert.alert('Photo access is off', 'Turn on photo access for this app in Settings to choose a meal photo.');
    const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.7, exif: true });
    if (!result.canceled) read(result.assets[0].uri, parsePhotoTime(result.assets[0].exif));
  }

  let body: ReactNode;
  if (reading) {
    body = (
      <View style={{ alignItems: 'center', gap: 12, paddingVertical: 36 }}>
        <ActivityIndicator color={colors.text} size="large" />
        <Body style={{ fontSize: 17, fontWeight: '600' }}>Reading your photo…</Body>
        <Muted>This takes about 20 seconds.</Muted>
      </View>
    );
  } else {
    body = (
      <View style={{ gap: 12 }}>
        <View>
          {/* Development builds only: press and hold the title to open a sample meal, so the meal
              screen can be checked in the simulator, which has no food photos. Never in the real app. */}
          <Title style={{ fontSize: 24 }}>
            <Text onLongPress={__DEV__ ? () => onDraft({ photoUri: '', items: SAMPLE_MEAL }) : undefined}>Log a meal</Text>
          </Title>
          <Muted style={{ fontSize: 14 }}>One photo is enough. Reading it takes about 20 seconds.</Muted>
        </View>
        <SheetOption icon="camera" accent title="Take a photo" detail="Opens the camera" onPress={takePhoto} />
        <SheetOption icon="photos" title="Choose from your photos" detail="Uses the time the photo was taken" onPress={pickPhoto} />
        {Platform.OS === 'ios' && <SheetOption icon="glasses" title="From your glasses" detail="Photos your Meta glasses saved to this phone" onPress={onGlasses} />}
        <SheetOption icon="plus" title="Type it in" detail="No photo: enter the food and calories yourself" onPress={() => onDraft({ photoUri: '', items: [] })} />
        <OutlineButton title="Cancel" onPress={onClose} style={{ borderWidth: 0 }} />
      </View>
    );
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} locked={reading}>
      {body}
    </BottomSheet>
  );
}
