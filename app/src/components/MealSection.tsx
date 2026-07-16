import { Image, StyleSheet, Text, View } from 'react-native';
import { StoredEntry } from '../db/entriesRepository';
import { MealType } from '../types/nutrition';

interface Props {
  mealType: MealType;
  entries: StoredEntry[];
}

const MEAL_LABELS: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
};

export default function MealSection({ mealType, entries }: Props) {
  if (entries.length === 0) return null;
  return (
    <View style={styles.section}>
      <Text style={styles.heading}>{MEAL_LABELS[mealType]}</Text>
      {entries.map((entry) => (
        <View key={entry.id} style={styles.entryRow}>
          <Image source={{ uri: entry.photoPath }} style={styles.thumbnail} />
          <View style={styles.entryDetails}>
            <Text>{entry.items.map((i) => i.name).join(', ')}</Text>
            <Text style={styles.muted}>
              {Math.round(entry.items.reduce((sum, i) => sum + i.nutrients.calories, 0))} cal
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: 16 },
  heading: { fontSize: 16, fontWeight: '600', marginBottom: 6 },
  entryRow: { flexDirection: 'row', gap: 10, marginBottom: 8, alignItems: 'center' },
  thumbnail: { width: 48, height: 48, borderRadius: 8, backgroundColor: '#eee' },
  entryDetails: { flex: 1 },
  muted: { color: '#666', fontSize: 12 },
});
