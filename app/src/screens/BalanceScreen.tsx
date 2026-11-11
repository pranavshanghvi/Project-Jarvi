import { useCallback, useEffect, useState } from 'react';
import { Button, ScrollView, StyleSheet, Text, View } from 'react-native';
import BalanceChart, { BURNED_COLOR, EATEN_COLOR } from '../components/BalanceChart';
import { getEntriesInRange } from '../db/entriesRepository';
import { getCaloriesBurnedByDay, isHealthSupported, requestHealthPermissions } from '../health/healthKit';
import { toDateKey } from '../nutrition/aggregation';
import {
  buildDailyBalance,
  caloriesEatenByDate,
  DayBalance,
  describeNet,
  Period,
  PERIOD_DAYS,
  summarizeBalance,
} from '../nutrition/energyBalance';

const PERIOD_TITLES: Record<Period, string> = { day: 'Today', week: 'Last 7 days', month: 'Last 30 days' };

export default function BalanceScreen() {
  const [period, setPeriod] = useState<Period>('day');
  const [rows, setRows] = useState<DayBalance[]>([]);
  const [healthAsked, setHealthAsked] = useState(false);

  const load = useCallback(async (selected: Period) => {
    const today = new Date();
    const days = PERIOD_DAYS[selected];
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (days - 1));
    const [entries, burned] = await Promise.all([
      getEntriesInRange(toDateKey(start), toDateKey(today)),
      getCaloriesBurnedByDay(start, today),
    ]);
    setRows(buildDailyBalance(caloriesEatenByDate(entries), burned, days, today));
  }, []);

  useEffect(() => {
    // Ask for Health access once, then load; later period changes just reload.
    (async () => {
      if (!healthAsked) {
        await requestHealthPermissions();
        setHealthAsked(true);
      }
      await load(period);
    })();
  }, [period, healthAsked, load]);

  async function connectHealth() {
    await requestHealthPermissions();
    await load(period);
  }

  const summary = summarizeBalance(rows);
  const noBurnData = rows.length > 0 && rows.every((r) => r.burned === 0);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.periodRow}>
        {(['day', 'week', 'month'] as Period[]).map((p) => (
          <Button key={p} title={p === 'day' ? 'Day' : p === 'week' ? 'Week' : 'Month'} onPress={() => setPeriod(p)} disabled={p === period} />
        ))}
      </View>

      <Text style={styles.heading}>{PERIOD_TITLES[period]}</Text>
      <View style={styles.statRow}>
        <View style={styles.stat}>
          <Text style={[styles.statValue, { color: EATEN_COLOR }]}>{Math.round(summary.eaten)}</Text>
          <Text style={styles.statLabel}>cal eaten</Text>
        </View>
        <View style={styles.stat}>
          <Text style={[styles.statValue, { color: BURNED_COLOR }]}>{Math.round(summary.burned)}</Text>
          <Text style={styles.statLabel}>cal burned</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{describeNet(summary.net)}</Text>
          <Text style={styles.statLabel}>net</Text>
        </View>
      </View>

      {period !== 'day' && (
        <Text style={styles.note}>
          Based on {summary.loggedDays} of {summary.totalDays} days with food logged
          {summary.loggedDays > 0 ? ` · average ${describeNet(summary.averageNetPerDay)} a day` : ''}
        </Text>
      )}
      {period === 'day' && summary.loggedDays === 0 && <Text style={styles.note}>No food logged yet today.</Text>}

      {!isHealthSupported() && <Text style={styles.note}>Calories burned come from Apple Health, which is only on iPhone.</Text>}
      {isHealthSupported() && noBurnData && (
        <View style={styles.connect}>
          <Text style={styles.note}>No calories-burned data from Apple Health yet.</Text>
          <Button title="Connect Apple Health" onPress={connectHealth} />
        </View>
      )}

      {period !== 'day' && rows.length > 0 && <BalanceChart rows={rows} />}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  periodRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  heading: { fontSize: 18, fontWeight: '700', marginBottom: 12 },
  statRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  stat: { flex: 1 },
  statValue: { fontSize: 20, fontWeight: '700' },
  statLabel: { fontSize: 12, color: '#666' },
  note: { fontSize: 13, color: '#666', marginBottom: 8 },
  connect: { marginBottom: 12, alignItems: 'flex-start' },
});
