import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import MealSection from '../components/MealSection';
import { getEntriesForDate, StoredEntry, updateMealType } from '../db/entriesRepository';
import { aggregateDailyTotals } from '../nutrition/aggregation';
import { MealType, NutrientProfile } from '../types/nutrition';

const MEAL_ORDER: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

function todayKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function DailyViewScreen() {
  const [entries, setEntries] = useState<StoredEntry[]>([]);

  const refetch = useCallback(() => {
    getEntriesForDate(todayKey()).then(setEntries);
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  async function handleMealTypeChange(entryId: number, nextMealType: MealType) {
    await updateMealType(entryId, nextMealType);
    refetch();
  }

  const allItemNutrients: NutrientProfile[] = entries.flatMap((e) => e.items.map((i) => i.nutrients));
  const totals = aggregateDailyTotals(allItemNutrients);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.totalsHeading}>Today's totals</Text>
      <Text style={styles.totalsLine}>{Math.round(totals.calories)} cal · {Math.round(totals.proteinG)}g protein · {Math.round(totals.carbsG)}g carbs · {Math.round(totals.fatG)}g fat</Text>
      {MEAL_ORDER.map((mealType) => (
        <MealSection
          key={mealType}
          mealType={mealType}
          entries={entries.filter((e) => e.mealType === mealType)}
          onMealTypeChange={handleMealTypeChange}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  totalsHeading: { fontSize: 18, fontWeight: '700', marginBottom: 4 },
  totalsLine: { color: '#444', marginBottom: 16 },
});
