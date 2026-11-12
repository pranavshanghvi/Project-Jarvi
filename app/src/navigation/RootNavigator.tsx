import { useEffect, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import { notify } from '../ui/notify';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DarkTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { analyzePhoto, clearQueuedPhoto, getQueuedPhotos, queuePhotoForRetry, subscribeToReconnect } from '../api/analyzePhoto';
import { persistPhoto, startOfDay } from '../data/dayData';
import { getPhotoFileUri, GlassesPhoto } from '../glasses/glassesPhotos';
import { requestHealthPermissions } from '../health/healthKit';
import { parseBurnLink, saveImportedBurn } from '../health/importedBurn';
import { toDateKey } from '../nutrition/aggregation';
import { Glass, Muted } from '../ui/kit';
import { formatCalories } from '../ui/theme';
import { getProfile } from '../profile/profileStore';
import AddMealSheet from '../screens/AddMealSheet';
import BurnedScreen from '../screens/BurnedScreen';
import FoodLogScreen from '../screens/FoodLogScreen';
import GlassesImportScreen from '../screens/GlassesImportScreen';
import GoalsScreen from '../screens/GoalsScreen';
import HistoryScreen from '../screens/HistoryScreen';
import MealDetailScreen from '../screens/MealDetailScreen';
import ProfileScreen from '../screens/ProfileScreen';
import TodayScreen from '../screens/TodayScreen';
import TutorialScreen from '../screens/TutorialScreen';
import WeightScreen from '../screens/WeightScreen';
import WelcomeScreen from '../screens/WelcomeScreen';
import { TabBar, TabName } from '../ui/kit';
import { colors } from '../ui/theme';
import { AppNav, RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();
const ONBOARDING_SEEN = 'jarvi.onboardingSeen';
// 'welcomeSeen' rather than the earlier 'tutorialSeen', so anyone who opened the version that had
// the tour but no landing page still sees the landing page once.
const TUTORIAL_SEEN = 'jarvi.welcomeSeen';

// The four tabs live inside one screen so the floating tab bar stays put while the content swaps.
function TabsScreen({ navigation }: any) {
  const [tab, setTab] = useState<TabName>('today');
  const [date, setDate] = useState<Date>(startOfDay(new Date()));
  const [refreshKey, setRefreshKey] = useState(0);
  const [adding, setAdding] = useState(false);

  const [notice, setNotice] = useState('');
  const healthAsked = useRef(false);

  // Web version only: an Apple Shortcut on the person's iPhone opens BiteLog with the day's
  // calories burned after a "#" in the address. Save them, then tidy the address so reloading or
  // bookmarking the page does not carry old numbers around.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const days = parseBurnLink(window.location.hash, new Date());
    if (Object.keys(days).length === 0) return;
    saveImportedBurn(days).then(() => {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
      const today = days[toDateKey(new Date())];
      setNotice(today ? `Updated from your iPhone: ${formatCalories(today.active + today.resting)} burned so far today` : 'Updated from your iPhone');
      setRefreshKey((k) => k + 1);
      setTimeout(() => setNotice(''), 5000);
    });
  }, []);

  // iOS shows its Health sheet the first time (and again when new kinds of data are added);
  // afterwards this returns at once. Refresh when it is answered so the burn appears.
  async function askForHealth() {
    if (healthAsked.current) return;
    healthAsked.current = true;
    await requestHealthPermissions();
    setRefreshKey((k) => k + 1);
  }

  // Coming back from a meal, the weight screen or the goal screen: re-read everything, so the
  // totals on the tab you return to are never stale.
  useEffect(
    () =>
      navigation.addListener('focus', () => {
        setRefreshKey((k) => k + 1);
        if (onboardingChecked.current) askForHealth();
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [navigation]
  );

  const onboardingChecked = useRef(false);
  useEffect(() => {
    (async () => {
      // First launch only: ask the profile questions once. "Not now" is respected.
      const [profile, seen, tutorialSeen] = await Promise.all([getProfile(), AsyncStorage.getItem(ONBOARDING_SEEN), AsyncStorage.getItem(TUTORIAL_SEEN)]);
      onboardingChecked.current = true;
      // The very first thing a new person sees is the landing page, which offers the short tour,
      // so someone who was only sent a link knows what this is. It then hands on to the profile
      // questions if those are still due.
      if (!tutorialSeen) {
        const thenOnboard = !profile && !seen;
        await AsyncStorage.setItem(TUTORIAL_SEEN, '1');
        if (thenOnboard) await AsyncStorage.setItem(ONBOARDING_SEEN, '1');
        navigation.navigate('Welcome', { thenOnboard });
        return;
      }
      if (!profile && !seen) {
        await AsyncStorage.setItem(ONBOARDING_SEEN, '1');
        // Apple's Health sheet is held back until these questions are answered or skipped: two
        // things sliding up at once on a first launch left a blank sheet on screen in testing.
        navigation.navigate('Profile', { onboarding: true });
        return;
      }
      askForHealth();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation]);

  useEffect(() => {
    // A photo that could not be read earlier is tried again when the connection returns.
    return subscribeToReconnect(async () => {
      const [photoUri] = await getQueuedPhotos();
      if (!photoUri) return;
      try {
        const { items } = await analyzePhoto(photoUri);
        await clearQueuedPhoto(photoUri);
        navigation.navigate('MealDetail', { draft: { photoUri, items } });
      } catch {
        // Still failing: it stays queued for the next reconnect.
      }
    });
  }, [navigation]);

  const nav: AppNav = {
    goTab: setTab,
    openDay: (day) => {
      setDate(startOfDay(day));
      setTab('today');
    },
    openMeal: (entryId) => navigation.navigate('MealDetail', { entryId }),
    openProfile: () => navigation.navigate('Profile'),
    openGoals: () => navigation.navigate('Goals'),
    openWeight: () => navigation.navigate('Weight'),
    openTutorial: () => navigation.navigate('Welcome'),
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.page }}>
      {tab === 'today' && <TodayScreen date={date} onDateChange={setDate} refreshKey={refreshKey} nav={nav} />}
      {tab === 'food' && <FoodLogScreen refreshKey={refreshKey} nav={nav} />}
      {tab === 'burned' && <BurnedScreen refreshKey={refreshKey} />}
      {tab === 'history' && <HistoryScreen refreshKey={refreshKey} nav={nav} />}
      {notice ? (
        <View style={{ position: 'absolute', top: 12, left: 16, right: 16 }} pointerEvents="none">
          <Glass strong radius={16} padding={12}>
            <Muted style={{ color: colors.text, textAlign: 'center' }}>{notice}</Muted>
          </Glass>
        </View>
      ) : null}
      <TabBar current={tab} onChange={setTab} onAdd={() => setAdding(true)} />
      <AddMealSheet
        visible={adding}
        onClose={() => setAdding(false)}
        onDraft={(draft) => {
          setAdding(false);
          navigation.navigate('MealDetail', { draft });
        }}
        onGlasses={() => {
          setAdding(false);
          navigation.navigate('GlassesImport');
        }}
      />
    </View>
  );
}

function GlassesImportWrapper({ navigation }: any) {
  const [busyPhotoId, setBusyPhotoId] = useState<string | null>(null);

  async function handlePhotoChosen(photo: GlassesPhoto) {
    setBusyPhotoId(photo.id);
    let photoUri: string;
    try {
      // Copy out of the photo library so the saved meal keeps its picture.
      photoUri = await persistPhoto(await getPhotoFileUri(photo.id));
    } catch {
      setBusyPhotoId(null);
      notify('Could not open that photo', 'Try another one.');
      return;
    }
    try {
      const { items } = await analyzePhoto(photoUri);
      navigation.replace('MealDetail', { draft: { photoUri, items, takenAt: photo.takenAt, glassesPhotoId: photo.id } });
    } catch {
      await queuePhotoForRetry(photoUri);
      notify('Photo saved for later', 'The food reader could not read this photo right now. It will be tried again when the reader is back.');
    } finally {
      setBusyPhotoId(null);
    }
  }

  return <GlassesImportScreen onPhotoChosen={handlePhotoChosen} busyPhotoId={busyPhotoId} onBack={() => navigation.goBack()} />;
}

const theme = { ...DarkTheme, colors: { ...DarkTheme.colors, background: colors.page, card: colors.page } };

export default function RootNavigator() {
  return (
    <NavigationContainer theme={theme}>
      <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.page } }}>
        <Stack.Screen name="Tabs" component={TabsScreen} />
        <Stack.Screen name="Welcome" component={WelcomeScreen} />
        <Stack.Screen name="Tutorial" component={TutorialScreen} />
        <Stack.Screen name="MealDetail" component={MealDetailScreen} />
        <Stack.Screen name="GlassesImport" component={GlassesImportWrapper} />
        <Stack.Screen name="Profile" component={ProfileScreen} />
        <Stack.Screen name="Goals" component={GoalsScreen} />
        <Stack.Screen name="Weight" component={WeightScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
