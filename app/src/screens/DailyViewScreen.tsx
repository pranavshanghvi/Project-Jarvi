import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import MealSection from '../components/MealSection';
import { getEntriesForDate, StoredEntry, updateMealType } from '../db/entriesRepository';
import { getCaloriesBurnedByDay, requestHealthPermissions } from '../health/healthKit';
import { aggregateDailyTotals } from '../nutrition/aggregation';
import { describeNet } from '../nutrition/energyBalance';
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
  const [burned, setBurned] = useState<number | null>(null);

  const refetch = useCallback(() => {
    getEntriesForDate(todayKey()).then(setEntries);
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  useEffect(() => {
    // Calories burned so far today, from Apple Health (Apple Watch). Stays hidden when there is
    // no data: not on iPhone, access refused, or nothing recorded yet.
    (async () => {
      await requestHealthPermissions();
      const today = new Date();
      const byDay = await getCaloriesBurnedByDay(today, today);
      const total = byDay[todayKey()];
      setBurned(typeof total === 'number' ? total : null);
    })();
  }, []);

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
      {burned !== null && (
        <Text style={styles.balanceLine}>
          {Math.round(totals.calories)} cal in · {Math.round(burned)} cal out · {describeNet(totals.calories - burned)}
        </Text>
      )}
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
  totalsLine: { color: '#444', marginBottom: 4 },
  balanceLine: { color: '#1D6E56', fontWeight: '600', marginBottom: 12 },
});
