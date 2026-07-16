import { StyleSheet, Text, TouchableOpacity, Image, View } from 'react-native';
import { StoredEntry } from '../db/entriesRepository';
import { MealType } from '../types/nutrition';

interface Props {
  mealType: MealType;
  entries: StoredEntry[];
  onMealTypeChange: (entryId: number, nextMealType: MealType) => void;
}

const MEAL_LABELS: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
};

const MEAL_CYCLE: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

export default function MealSection({ mealType, entries, onMealTypeChange }: Props) {
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
          <TouchableOpacity
            onPress={() =>
              onMealTypeChange(entry.id, MEAL_CYCLE[(MEAL_CYCLE.indexOf(mealType) + 1) % MEAL_CYCLE.length])
            }
          >
            <Text style={styles.mealLabel}>{MEAL_LABELS[mealType]} ▸</Text>
          </TouchableOpacity>
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
  mealLabel: { color: '#3366cc', fontSize: 12, fontWeight: '600' },
});
