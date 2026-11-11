import { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Alert, Button, Platform, View } from 'react-native';
import BalanceScreen from '../screens/BalanceScreen';
import CaptureScreen, { persistPhoto } from '../screens/CaptureScreen';
import ConfirmScreen from '../screens/ConfirmScreen';
import DailyViewScreen from '../screens/DailyViewScreen';
import DashboardScreen from '../screens/DashboardScreen';
import GlassesImportScreen from '../screens/GlassesImportScreen';
import { getPhotoFileUri, GlassesPhoto, markPhotoUsed } from '../glasses/glassesPhotos';
import {
  analyzePhoto,
  queuePhotoForRetry,
  getQueuedPhotos,
  clearQueuedPhoto,
  subscribeToReconnect,
} from '../api/analyzePhoto';
import { DetectedFoodItem } from '../types/nutrition';

type RootStackParamList = {
  Home: undefined;
  Capture: undefined;
  Confirm: { photoUri: string; items: DetectedFoodItem[]; takenAt?: number; glassesPhotoId?: string };
  GlassesImport: undefined;
  DailyView: undefined;
  Dashboard: undefined;
  Balance: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

function HomeScreen({ navigation }: any) {
  useEffect(() => {
    // Retries queued photos as soon as connectivity returns. If more than one
    // photo is queued, only the first is surfaced for confirmation per
    // reconnect event — the rest stay queued and get picked up next time.
    const unsubscribe = subscribeToReconnect(async () => {
      const queued = await getQueuedPhotos();
      if (queued.length === 0) return;
      const [photoUri] = queued;
      try {
        const { items } = await analyzePhoto(photoUri);
        await clearQueuedPhoto(photoUri);
        navigation.navigate('Confirm', { photoUri, items });
      } catch {
        // Still failing (e.g. flaky reconnect) — leave it queued for the next event.
      }
    });
    return unsubscribe;
  }, [navigation]);

  return (
    <View style={{ flex: 1, justifyContent: 'center', gap: 12, padding: 16 }}>
      <Button title="Log food" onPress={() => navigation.navigate('Capture')} />
      <Button title="Today's log" onPress={() => navigation.navigate('DailyView')} />
      <Button title="Calories in vs out" onPress={() => navigation.navigate('Balance')} />
      <Button title="Dashboard" onPress={() => navigation.navigate('Dashboard')} />
    </View>
  );
}

function CaptureScreenWrapper({ navigation }: any) {
  async function handlePhotoCaptured(photoUri: string) {
    try {
      const { items } = await analyzePhoto(photoUri);
      navigation.navigate('Confirm', { photoUri, items });
    } catch {
      // Say so. This used to drop back to Home with no message, which looked like nothing happened.
      await queuePhotoForRetry(photoUri);
      Alert.alert('Photo saved for later', 'The food reader could not read this photo right now. Jarvi will try it again when it is back.');
    }
  }
  return (
    <CaptureScreen
      onPhotoCaptured={handlePhotoCaptured}
      onImportFromGlasses={Platform.OS === 'ios' ? () => navigation.navigate('GlassesImport') : undefined}
    />
  );
}

function GlassesImportScreenWrapper({ navigation }: any) {
  const [busyPhotoId, setBusyPhotoId] = useState<string | null>(null);

  async function handlePhotoChosen(photo: GlassesPhoto) {
    setBusyPhotoId(photo.id);
    let photoUri: string;
    try {
      // Copy out of the photo library so the saved meal keeps its picture.
      photoUri = await persistPhoto(await getPhotoFileUri(photo.id));
    } catch {
      setBusyPhotoId(null);
      Alert.alert('Could not open that photo', 'Please try another one.');
      return;
    }
    try {
      const { items } = await analyzePhoto(photoUri);
      navigation.navigate('Confirm', { photoUri, items, takenAt: photo.takenAt, glassesPhotoId: photo.id });
    } catch {
      await queuePhotoForRetry(photoUri);
      Alert.alert('Photo saved for later', 'The food reader is unavailable right now. Jarvi will try this photo again when it is back.');
    } finally {
      setBusyPhotoId(null);
    }
  }

  return <GlassesImportScreen onPhotoChosen={handlePhotoChosen} busyPhotoId={busyPhotoId} />;
}

function ConfirmScreenWrapper({ route, navigation }: any) {
  const { photoUri, items, takenAt, glassesPhotoId } = route.params;
  return (
    <ConfirmScreen
      items={items}
      photoUri={photoUri}
      takenAt={takenAt}
      onSaved={() => {
        // A glasses photo that has been logged is not offered again.
        if (glassesPhotoId) markPhotoUsed(glassesPhotoId);
        // Reset (not navigate) so Confirm/Capture/Home are cleared from the
        // stack entirely. Otherwise DailyView's header back button would
        // return to Confirm with the same items still loaded and Save still
        // enabled, letting the user create a duplicate entry with one tap.
        navigation.reset({ index: 0, routes: [{ name: 'DailyView' }] });
      }}
    />
  );
}

export default function RootNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="Capture" component={CaptureScreenWrapper} options={{ title: 'Log food' }} />
        <Stack.Screen name="Confirm" component={ConfirmScreenWrapper} options={{ title: 'Confirm' }} />
        <Stack.Screen name="GlassesImport" component={GlassesImportScreenWrapper} options={{ title: 'From smart glasses' }} />
        <Stack.Screen name="Balance" component={BalanceScreen} options={{ title: 'Calories in vs out' }} />
        <Stack.Screen
          name="DailyView"
          component={DailyViewScreen}
          options={({ navigation }) => ({
            title: 'Today',
            headerBackVisible: false,
            headerLeft: () => (
              <Button
                title="Home"
                onPress={() => navigation.reset({ index: 0, routes: [{ name: 'Home' }] })}
              />
            ),
            headerRight: () => (
              <Button title="Dashboard" onPress={() => navigation.navigate('Dashboard')} />
            ),
          })}
        />
        <Stack.Screen name="Dashboard" component={DashboardScreen} options={{ title: 'Dashboard' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
