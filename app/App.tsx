import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { createEntry, getEntriesForDate } from './src/db/entriesRepository';
import { DetectedFoodItem } from './src/types/nutrition';

const sampleItem: DetectedFoodItem = {
  name: 'Test apple',
  confidence: 'normal',
  portionDescription: '1 medium',
  nutrients: {
    calories: 95,
    proteinG: 0.5,
    carbsG: 25,
    fatG: 0.3,
    saturatedFatG: 0,
    fiberG: 4,
    sugarG: 19,
    sodiumMg: 2,
    cholesterolMg: 0,
  },
};

export default function App() {
  const [log, setLog] = useState('loading...');

  useEffect(() => {
    (async () => {
      await createEntry('file:///fake/path.jpg', 'snack', [{ item: sampleItem, portionMultiplier: 1 }]);
      const today = new Date().toISOString().slice(0, 10);
      const entries = await getEntriesForDate(today);
      setLog(JSON.stringify(entries, null, 2));
    })();
  }, []);

  return (
    <View style={{ flex: 1, paddingTop: 60, paddingHorizontal: 16 }}>
      <Text>{log}</Text>
    </View>
  );
}
