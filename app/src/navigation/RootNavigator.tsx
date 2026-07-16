import { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Button, View } from 'react-native';
import CaptureScreen from '../screens/CaptureScreen';
import ConfirmScreen from '../screens/ConfirmScreen';
import DailyViewScreen from '../screens/DailyViewScreen';
import DashboardScreen from '../screens/DashboardScreen';
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
  Confirm: { photoUri: string; items: DetectedFoodItem[] };
  DailyView: undefined;
  Dashboard: undefined;
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
      await queuePhotoForRetry(photoUri);
      navigation.navigate('Home');
    }
  }
  return <CaptureScreen onPhotoCaptured={handlePhotoCaptured} />;
}

function ConfirmScreenWrapper({ route, navigation }: any) {
  const { photoUri, items } = route.params;
  return (
    <ConfirmScreen
      items={items}
      photoUri={photoUri}
      onSaved={() => navigation.navigate('DailyView')}
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
        <Stack.Screen name="DailyView" component={DailyViewScreen} options={{ title: "Today" }} />
        <Stack.Screen name="Dashboard" component={DashboardScreen} options={{ title: 'Dashboard' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
