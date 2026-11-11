import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { addDays, dateFromKey, isSameDay, loadAllWeights, startOfDay } from '../data/dayData';
import { Goal, goalProgress } from '../goals/goals';
import { getGoal } from '../goals/goalStore';
import { toDateKey } from '../nutrition/aggregation';
import { getWeightUnit } from '../settings/settingsStore';
import { BarsChart, ChartCard, LineChart } from '../ui/charts';
import { Body, Glass, Header, Heading, Icon, Muted, Num, PrimaryButton, Row, Screen, Segmented } from '../ui/kit';
import LogWeightSheet from './LogWeightSheet';
import { colors, formatTime } from '../ui/theme';
import { formatWeight, toDisplayWeight, WeightUnit } from '../units';
import { deleteWeight, latestWeight, weightChange, WeightEntry } from '../weight/weightStore';

type Span = 'month' | 'quarter' | 'year' | 'all';
const SPANS: { value: Span; label: string }[] = [
  { value: 'month', label: 'Month' },
  { value: 'quarter', label: '3 months' },
  { value: 'year', label: 'Year' },
  { value: 'all', label: 'All' },
];

// One point per day for short spans, per week for a year, per month beyond that, so a long
// history stays a readable line instead of hundreds of crowded dots.
function points(entries: WeightEntry[], span: Span, unit: WeightUnit) {
  const today = startOfDay(new Date());
  const first = entries.length ? dateFromKey(entries[0].date) : today;
  const days = span === 'month' ? 30 : span === 'quarter' ? 90 : span === 'year' ? 365 : Math.max(30, Math.round((today.getTime() - first.getTime()) / 86400000) + 1);
  const step = days <= 62 ? 1 : days <= 370 ? 7 : 30;
  const count = Math.ceil(days / step);
  const start = addDays(today, -(count * step - 1));
  const byDate = new Map(entries.map((e) => [e.date, e.kg]));
  const labels: string[] = [];
  const values: (number | null)[] = [];
  for (let i = 0; i < count; i++) {
    const from = addDays(start, i * step);
    let sum = 0;
    let n = 0;
    for (let d = 0; d < step; d++) {
      const kg = byDate.get(toDateKey(addDays(from, d)));
      if (kg !== undefined) {
        sum += kg;
        n += 1;
      }
    }
    labels.push(`${from.getMonth() + 1}/${from.getDate()}`);
    values.push(n ? toDisplayWeight(sum / n, unit) : null);
  }
  return { labels, values };
}

export default function WeightScreen({ navigation }: any) {
  const [entries, setEntries] = useState<WeightEntry[]>([]);
  const [goal, setGoal] = useState<Goal | null>(null);
  const [unit, setUnit] = useState<WeightUnit>('lb');
  const [span, setSpan] = useState<Span>('quarter');
  const [logging, setLogging] = useState(false);

  async function reload() {
    const [w, g, u] = await Promise.all([loadAllWeights(), getGoal(), getWeightUnit()]);
    setEntries(w);
    setGoal(g);
    setUnit(u);
  }
  // Re-read whenever this screen comes back into view, so a change made on another screen shows here.
  useEffect(() => {
    reload();
    return navigation.addListener('focus', reload);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation]);

  const latest = latestWeight(entries);
  const today = new Date();
  const weekChange = weightChange(entries, 7, today);
  const monthChange = weightChange(entries, 30, today);
  const { labels, values } = points(entries, span, unit);
  const progress = goal && latest ? goalProgress(goal, latest.kg) : null;

  const change = (kg: number | null, label: string) =>
    kg === null ? null : (
      <Muted>
        <Num style={{ fontSize: 13 }}>{`${kg <= 0 ? '−' : '+'}${Math.abs(toDisplayWeight(kg, unit)).toFixed(1)} ${unit}`}</Num> {label}
      </Muted>
    );

  return (
    <Screen>
      <Header title="Weight" onBack={() => navigation.goBack()} />

      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <View>
          <Muted>{latest ? (isSameDay(dateFromKey(latest.date), today) ? 'Today' : `Last logged ${dateFromKey(latest.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`) : 'Nothing logged yet'}</Muted>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
            <Num style={{ fontSize: 44 }}>{latest ? toDisplayWeight(latest.kg, unit).toFixed(1) : '—'}</Num>
            <Muted style={{ fontSize: 16 }}>{unit}</Muted>
          </View>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          {change(weekChange, 'this week')}
          {change(monthChange, 'in 30 days')}
        </View>
      </View>

      <PrimaryButton title="Log today's weight" onPress={() => setLogging(true)} />
      <Muted style={{ fontSize: 12, textAlign: 'center' }}>By photo of your scale, or typed in. A scale that saves to Apple Health fills it in for you.</Muted>

      <Segmented options={SPANS} value={span} onChange={setSpan} />
      <ChartCard
        cardId="weight"
        styles={['line', 'bars']}
        render={(style) =>
          entries.length === 0 ? (
            <Muted>Log your weight a few mornings in a row and the graph appears here.</Muted>
          ) : style === 'bars' ? (
            <BarsChart labels={labels} series={[{ label: 'Weight', color: colors.text, values: values.map((v) => v ?? 0) }]} />
          ) : (
            <LineChart
              labels={labels}
              zeroBased={false}
              series={[{ label: 'Weight', color: colors.text, values }]}
              goal={goal ? { value: toDisplayWeight(goal.targetWeightKg, unit), label: `Goal ${toDisplayWeight(goal.targetWeightKg, unit).toFixed(0)}` } : undefined}
            />
          )
        }
      />

      <Glass onPress={() => navigation.navigate('Goals')} label="Your goal" padding={0}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 52, paddingHorizontal: 14 }}>
          <Body>{progress ? `${formatWeight(progress.remainingKg, unit)} to your goal` : goal ? 'Log a weight to track your goal' : 'Set a weight goal'}</Body>
          <Muted>See goal  ›</Muted>
        </View>
      </Glass>

      {entries.length > 0 && <Heading>Recent</Heading>}
      {entries.length > 0 && (
        <Glass padding={0} style={{ paddingHorizontal: 14 }}>
          {[...entries].reverse().slice(0, 10).map((entry, index) => (
            <Row
              key={entry.date}
              first={index === 0}
              title={dateFromKey(entry.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
              detail={entry.source === 'health' ? 'From Apple Health' : entry.time ? `Typed in at ${formatTime(new Date(entry.time))}` : 'Typed in'}
              value={toDisplayWeight(entry.kg, unit).toFixed(1)}
              chevron={false}
              left={
                entry.source === 'manual' ? (
                  <Pressable onPress={() => deleteWeight(entry.date).then(reload)} accessibilityRole="button" accessibilityLabel="Delete this weight" hitSlop={10}>
                    <Icon name="close" size={16} color={colors.muted} />
                  </Pressable>
                ) : undefined
              }
            />
          ))}
        </Glass>
      )}
      <LogWeightSheet visible={logging} onClose={() => setLogging(false)} onSaved={reload} unit={unit} lastKg={latest?.kg} />
    </Screen>
  );
}
