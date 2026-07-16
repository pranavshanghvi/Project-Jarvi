import { useEffect, useState } from 'react';
import { Button, ScrollView, StyleSheet } from 'react-native';
import BarChart from '../components/BarChart';
import { getEntriesInRange } from '../db/entriesRepository';
import { buildTrend } from '../nutrition/aggregation';
import { NutrientProfile } from '../types/nutrition';

function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default function DashboardScreen() {
  const [rangeDays, setRangeDays] = useState<7 | 30>(7);
  const [entriesByDate, setEntriesByDate] = useState<Record<string, NutrientProfile[]>>({});

  useEffect(() => {
    const today = new Date();
    const start = new Date(today);
    start.setDate(start.getDate() - (rangeDays - 1));
    getEntriesInRange(dateKey(start), dateKey(today)).then((entries) => {
      const grouped: Record<string, NutrientProfile[]> = {};
      for (const entry of entries) {
        const key = entry.timestamp.slice(0, 10);
        grouped[key] = grouped[key] ?? [];
        grouped[key].push(...entry.items.map((i) => i.nutrients));
      }
      setEntriesByDate(grouped);
    });
  }, [rangeDays]);

  const trend = buildTrend(entriesByDate, rangeDays, new Date());
  const dateLabels = trend.map((p) => p.date.slice(5));

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Button title="7 days" onPress={() => setRangeDays(7)} />
      <Button title="30 days" onPress={() => setRangeDays(30)} />
      <BarChart label="Calories" values={trend.map((p) => p.totals.calories)} dateLabels={dateLabels} />
      <BarChart label="Protein (g)" values={trend.map((p) => p.totals.proteinG)} dateLabels={dateLabels} />
      <BarChart label="Carbs (g)" values={trend.map((p) => p.totals.carbsG)} dateLabels={dateLabels} />
      <BarChart label="Sodium (mg)" values={trend.map((p) => p.totals.sodiumMg)} dateLabels={dateLabels} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
});
