import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { addDays, dateFromKey, entryNutrients, isSameDay, startOfDay } from '../data/dayData';
import { getEntriesInRange, getFirstEntryDate, StoredEntry } from '../db/entriesRepository';
import { getEnergySplitByDay } from '../health/healthKit';
import { toDateKey } from '../nutrition/aggregation';
import { buildDailyBalance, caloriesEatenByDate, DayBalance } from '../nutrition/energyBalance';
import { Bucket, bucketize, HistoryRange, rangeDays, summarizeBuckets } from '../nutrition/historyBuckets';
import { AppNav } from '../navigation/types';
import { BarsChart, ChartCard, FlowChart, Legend, LineChart, PieChart } from '../ui/charts';
import { Glass, Header, Heading, Muted, Num, OutlineButton, Row, Screen, Segmented } from '../ui/kit';
import { Learn, LearnLabel } from '../ui/learn';
import { colors, formatCalories, formatSigned } from '../ui/theme';

const RANGES: { value: HistoryRange; label: string }[] = [
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'sixMonths', label: '6 mo' },
  { value: 'year', label: 'Year' },
  { value: 'all', label: 'All' },
];
const RANGE_TITLES: Record<HistoryRange, string> = { week: '7 days', month: '30 days', sixMonths: '6 months', year: '12 months', all: 'All time' };

interface Loaded {
  rows: DayBalance[];
  entries: StoredEntry[];
  split: Record<string, { active: number; resting: number }>;
}

export default function HistoryScreen({ refreshKey, nav }: { refreshKey: number; nav: AppNav }) {
  const [range, setRange] = useState<HistoryRange>('week');
  // The last day shown. Normally today; tapping a past week or month moves it back.
  const [anchor, setAnchor] = useState<Date>(startOfDay(new Date()));
  const [data, setData] = useState<Loaded>({ rows: [], entries: [], split: {} });
  const today = startOfDay(new Date());
  const anchored = !isSameDay(anchor, today);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const first = await getFirstEntryDate();
      const days = rangeDays(range, anchor, first);
      const start = addDays(anchor, -(days - 1));
      const [entries, split] = await Promise.all([getEntriesInRange(toDateKey(start), toDateKey(anchor)), getEnergySplitByDay(start, anchor)]);
      const burned: Record<string, number> = {};
      for (const [key, e] of Object.entries(split)) burned[key] = e.active + e.resting;
      if (!cancelled) setData({ rows: buildDailyBalance(caloriesEatenByDate(entries), burned, days, anchor), entries, split });
    })();
    return () => {
      cancelled = true;
    };
  }, [range, anchor, refreshKey]);

  const buckets = bucketize(data.rows, range);
  const summary = summarizeBuckets(buckets);
  const labels = buckets.map((b) => b.label);
  const hasData = summary.loggedDays > 0;

  // An average logged day, for the pie and the flow picture.
  const loggedKeys = new Set(data.rows.filter((r) => r.logged).map((r) => r.date));
  const loggedEntries = data.entries.filter((e) => loggedKeys.has(toDateKey(new Date(e.timestamp))));
  const n = Math.max(1, summary.loggedDays);
  const totals = entryNutrients(loggedEntries);
  const macros = [
    { label: 'Carbs', value: (totals.carbsG * 4) / n, color: colors.eaten },
    { label: 'Fat', value: (totals.fatG * 9) / n, color: colors.eatenDeep },
    { label: 'Protein', value: (totals.proteinG * 4) / n, color: colors.eatenPale },
  ];
  let active = 0;
  let resting = 0;
  for (const key of loggedKeys) {
    active += data.split[key]?.active ?? 0;
    resting += data.split[key]?.resting ?? 0;
  }
  active /= n;
  resting /= n;
  const gap = summary.burned - summary.eaten; // positive: the body covered the difference

  function openBucket(bucket: Bucket) {
    const end = dateFromKey(bucket.end) > today ? today : dateFromKey(bucket.end);
    if (bucket.start === bucket.end) nav.openDay(dateFromKey(bucket.start));
    else if (bucket.key.length === 7) {
      setAnchor(end);
      setRange('month');
    } else {
      setAnchor(end);
      setRange('week');
    }
  }

  return (
    <Screen tabBarSpace>
      <Header eyebrow="As far back as you have logged" title="History" />
      <Segmented options={RANGES} value={range} onChange={setRange} />
      {anchored && <OutlineButton title={`Showing up to ${anchor.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} · back to today`} onPress={() => setAnchor(today)} />}

      <Glass>
        <Muted>{RANGE_TITLES[range]}, on days you logged food</Muted>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
          <Num style={{ fontSize: 36 }}>{hasData ? formatSigned(summary.net) : '—'}</Num>
          <Muted>{hasData ? 'calories a day, on average' : 'no food logged in this period'}</Muted>
        </View>
      </Glass>

      <ChartCard
        cardId="balance"
        styles={['bars', 'line', 'flow']}
        render={(style) =>
          style === 'flow' ? (
            hasData ? (
              <>
                <Muted style={{ marginBottom: 8 }}>An average logged day: where energy came from, where it went</Muted>
                <FlowChart
                  left={[...macros, ...(gap > 0 ? [{ label: 'Body stores', value: gap, color: colors.text }] : [])]}
                  middle={{ label: 'Total', value: Math.max(summary.eaten, summary.burned) }}
                  right={[
                    { label: 'Resting', value: resting, color: colors.burnedDeep },
                    { label: 'Active', value: active, color: colors.burned },
                    ...(gap < 0 ? [{ label: 'Stored', value: -gap, color: colors.text }] : []),
                  ]}
                />
              </>
            ) : (
              <Muted>Log some food in this period to see the flow.</Muted>
            )
          ) : (
            <>
              {style === 'line' ? (
                <LineChart
                  labels={labels}
                  series={[
                    { label: 'Consumed', color: colors.eaten, values: buckets.map((b) => (b.loggedDays > 0 ? b.eaten : null)) },
                    { label: 'Burned', color: colors.burned, values: buckets.map((b) => (b.burned > 0 ? b.burned : null)) },
                  ]}
                />
              ) : (
                <BarsChart
                  labels={labels}
                  series={[
                    { label: 'Consumed', color: colors.eaten, values: buckets.map((b) => b.eaten) },
                    { label: 'Burned', color: colors.burned, values: buckets.map((b) => b.burned) },
                  ]}
                />
              )}
              <Legend items={[{ label: 'Consumed', color: colors.eaten }, { label: 'Burned', color: colors.burned }]} />
            </>
          )
        }
      />

      <View style={{ flexDirection: 'row', gap: 10 }}>
        {[
          { label: 'Days logged', value: String(summary.loggedDays), color: colors.text },
          { label: 'Avg consumed', value: formatCalories(summary.eaten), color: colors.eaten },
          { label: 'Avg burned', value: formatCalories(summary.burned), color: colors.burned },
        ].map((stat) => (
          <View key={stat.label} style={{ flex: 1 }}>
            <Glass radius={16} padding={12}>
              <Muted style={{ fontSize: 12 }}>{stat.label}</Muted>
              <Num style={{ fontSize: 20, color: stat.color }}>{stat.value}</Num>
            </Glass>
          </View>
        ))}
      </View>

      <Heading>Where your calories came from</Heading>
      <ChartCard
        cardId="nutrients"
        styles={['pie', 'bars', 'flow']}
        render={(style) =>
          !hasData ? (
            <Muted>Nothing logged in this period.</Muted>
          ) : style === 'pie' ? (
            <PieChart slices={macros} centerValue={formatCalories(summary.eaten)} centerLabel="cal a day" />
          ) : style === 'flow' ? (
            <FlowChart left={macros} middle={{ label: 'Consumed', value: macros.reduce((s, m) => s + m.value, 0) }} right={[]} />
          ) : (
            <>
              <BarsChart labels={macros.map((m) => m.label)} series={[{ label: 'Calories a day', color: colors.eaten, values: macros.map((m) => m.value) }]} />
              <Muted style={{ fontSize: 12, marginTop: 4 }}>Calories a day from each</Muted>
            </>
          )
        }
      />

      {hasData && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16, rowGap: 10 }}>
          <Learn topic="carbsG" amount={totals.carbsG / n} amountLabel="An average day"><LearnLabel>Carbs</LearnLabel></Learn>
          <Learn topic="fatG" amount={totals.fatG / n} amountLabel="An average day"><LearnLabel>Fat</LearnLabel></Learn>
          <Learn topic="proteinG" amount={totals.proteinG / n} amountLabel="An average day"><LearnLabel>Protein</LearnLabel></Learn>
          <Learn topic="addedSugarG" amount={totals.addedSugarG / n} amountLabel="An average day"><LearnLabel>Added sugar</LearnLabel></Learn>
          <Learn topic="sodiumMg" amount={totals.sodiumMg / n} amountLabel="An average day"><LearnLabel>Sodium</LearnLabel></Learn>
          <Learn topic="calories" amount={summary.eaten} amountLabel="An average day"><LearnLabel>Calories</LearnLabel></Learn>
        </View>
      )}

      <Heading>{range === 'week' || range === 'month' ? 'Day by day' : range === 'sixMonths' ? 'Week by week' : 'Month by month'}</Heading>
      <Glass padding={0} style={{ paddingHorizontal: 14 }}>
        {[...buckets].reverse().map((bucket, index) => (
          <Row
            key={bucket.key}
            first={index === 0}
            title={bucket.title}
            detail={bucket.totalDays === 1 ? (bucket.loggedDays ? `Consumed ${formatCalories(bucket.eaten)} · burned ${formatCalories(bucket.burned)}` : 'No food logged') : `${bucket.loggedDays} of ${bucket.totalDays} days logged`}
            value={bucket.loggedDays ? formatSigned(bucket.net) : '—'}
            onPress={() => openBucket(bucket)}
          />
        ))}
      </Glass>
    </Screen>
  );
}
