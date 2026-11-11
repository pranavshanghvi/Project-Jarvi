import { useEffect, useState } from 'react';
import { Image, View } from 'react-native';
import { addDays, dateFromKey, entryCalories, entryNutrients, isSameDay, MEAL_LABELS, mealTitle, resolvePhotoUri } from '../data/dayData';
import { getEntriesInRange, StoredEntry } from '../db/entriesRepository';
import { toDateKey } from '../nutrition/aggregation';
import { AppNav } from '../navigation/types';
import { Body, Glass, Header, IconButton, Muted, Num, OutlineButton, Row, Screen } from '../ui/kit';
import { NutrientProfile } from '../types/nutrition';
import { Learn, LearnLabel } from '../ui/learn';
import { colors, formatCalories, formatTime } from '../ui/theme';

function dayLabel(date: Date): string {
  const today = new Date();
  if (isSameDay(date, today)) return 'Today';
  if (isSameDay(date, addDays(today, -1))) return 'Yesterday';
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

function NutrientBar({ topic, label, grams, share }: { topic: keyof NutrientProfile; label: string; grams: number; share: number }) {
  return (
    <Learn topic={topic} amount={grams} amountLabel="That day" style={{ flex: 1 }}>
      <Num style={{ fontSize: 16 }}>{Math.round(grams)} g</Num>
      <View style={{ height: 4, borderRadius: 2, backgroundColor: colors.track, marginVertical: 6 }}>
        <View style={{ height: 4, borderRadius: 2, backgroundColor: colors.eaten, width: `${Math.round(Math.min(1, share) * 100)}%` }} />
      </View>
      <LearnLabel>{label}</LearnLabel>
    </Learn>
  );
}

export default function FoodLogScreen({ refreshKey, nav }: { refreshKey: number; nav: AppNav }) {
  const [days, setDays] = useState(14);
  const [entries, setEntries] = useState<StoredEntry[]>([]);

  useEffect(() => {
    const today = new Date();
    getEntriesInRange(toDateKey(addDays(today, -(days - 1))), toDateKey(today)).then(setEntries);
  }, [days, refreshKey]);

  // Newest day first; within a day, in the order eaten.
  const byDay = new Map<string, StoredEntry[]>();
  for (const entry of entries) {
    const key = toDateKey(new Date(entry.timestamp));
    byDay.set(key, [...(byDay.get(key) ?? []), entry]);
  }
  const dayKeys = [...byDay.keys()].sort().reverse();

  return (
    <Screen tabBarSpace>
      <Header eyebrow="Everything you ate, with the time" title="Food log" right={<IconButton icon="history" label="History" onPress={() => nav.goTab('history')} />} />

      {dayKeys.length === 0 && (
        <Glass>
          <Body>No meals logged in the last {days} days.</Body>
          <Muted>Tap the round + button and take a photo of what you are eating.</Muted>
        </Glass>
      )}

      {dayKeys.map((key, dayIndex) => {
        const dayEntries = byDay.get(key)!;
        const total = dayEntries.reduce((sum, e) => sum + entryCalories(e), 0);
        const nutrients = entryNutrients(dayEntries);
        // Share of the day's calories each one supplies (protein and carbs 4 cal per gram, fat 9).
        const fromMacros = Math.max(1, nutrients.proteinG * 4 + nutrients.carbsG * 4 + nutrients.fatG * 9);
        return (
          <View key={key} style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 4 }}>
              <Body style={{ fontWeight: '600' }}>{dayLabel(dateFromKey(key))}</Body>
              <Num style={{ fontSize: 14, color: colors.eaten, fontWeight: '400' }}>{formatCalories(total)} cal</Num>
            </View>
            <Glass padding={0} style={{ paddingHorizontal: 12 }}>
              {dayEntries.map((entry, index) => (
                <Row
                  key={entry.id}
                  first={index === 0}
                  left={entry.photoPath ? <Image source={{ uri: resolvePhotoUri(entry.photoPath) }} style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: colors.track }} /> : <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: colors.track }} />}
                  title={mealTitle(entry)}
                  detail={`${formatTime(new Date(entry.timestamp))} · ${MEAL_LABELS[entry.mealType]}`}
                  value={formatCalories(entryCalories(entry))}
                  valueColor={colors.eaten}
                  onPress={() => nav.openMeal(entry.id)}
                />
              ))}
            </Glass>
            {dayIndex === 0 && (
              <Glass>
                <Muted style={{ marginBottom: 10 }}>Nutrients that day</Muted>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <NutrientBar topic="proteinG" label="Protein" grams={nutrients.proteinG} share={(nutrients.proteinG * 4) / fromMacros} />
                  <NutrientBar topic="carbsG" label="Carbs" grams={nutrients.carbsG} share={(nutrients.carbsG * 4) / fromMacros} />
                  <NutrientBar topic="fatG" label="Fat" grams={nutrients.fatG} share={(nutrients.fatG * 9) / fromMacros} />
                  <NutrientBar topic="fiberG" label="Fiber" grams={nutrients.fiberG} share={nutrients.fiberG / 30} />
                </View>
                <View style={{ flexDirection: 'row', gap: 18, marginTop: 12 }}>
                  <Learn topic="sugarG" amount={nutrients.sugarG} amountLabel="That day">
                    <LearnLabel>{`Sugar ${Math.round(nutrients.sugarG)} g`}</LearnLabel>
                  </Learn>
                  <Learn topic="addedSugarG" amount={nutrients.addedSugarG} amountLabel="That day">
                    <LearnLabel>{`of which added ${Math.round(nutrients.addedSugarG)} g`}</LearnLabel>
                  </Learn>
                  <Learn topic="sodiumMg" amount={nutrients.sodiumMg} amountLabel="That day">
                    <LearnLabel>{`Sodium ${Math.round(nutrients.sodiumMg)} mg`}</LearnLabel>
                  </Learn>
                </View>
              </Glass>
            )}
          </View>
        );
      })}

      <OutlineButton title={`Show earlier than ${days} days ago`} onPress={() => setDays(days + 30)} />
    </Screen>
  );
}
