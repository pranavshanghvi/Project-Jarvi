import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import RootNavigator from './src/navigation/RootNavigator';

export default function App() {
  return (
    <SafeAreaProvider>
      {/* The app is dark throughout, so the clock and battery icons need to be light. */}
      <StatusBar style="light" />
      <RootNavigator />
    </SafeAreaProvider>
  );
}
