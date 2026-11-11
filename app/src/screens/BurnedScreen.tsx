import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { addDays, DayData, loadDay, startOfDay } from '../data/dayData';
import { getEnergySplitByDay, isHealthSupported, requestHealthPermissions } from '../health/healthKit';
import { toDateKey } from '../nutrition/aggregation';
import { BarsChart, ChartCard, LineChart, PieChart } from '../ui/charts';
import { Body, Glass, Header, Heading, Muted, Num, PrimaryButton, Row, Screen } from '../ui/kit';
import { colors, formatCalories, formatTime } from '../ui/theme';
import WebBurnCard from './WebBurnCard';

function miles(meters?: number): string {
  return meters && meters > 0 ? ` · ${(meters / 1609.344).toFixed(1)} mi` : '';
}

export default function BurnedScreen({ refreshKey }: { refreshKey: number }) {
  const [day, setDay] = useState<DayData | null>(null);
  const [week, setWeek] = useState<{ label: string; active: number; resting: number }[]>([]);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const today = startOfDay(new Date());
    const start = addDays(today, -6);
    Promise.all([loadDay(today), getEnergySplitByDay(start, today)]).then(([d, split]) => {
      setDay(d);
      setWeek(
        Array.from({ length: 7 }, (_, i) => {
          const date = addDays(start, i);
          const e = split[toDateKey(date)] ?? { active: 0, resting: 0 };
          return { label: date.toLocaleDateString('en-US', { weekday: 'short' }), ...e };
        })
      );
    });
  }, [refreshKey, reload]);

  const burned = day?.burned ?? 0;
  const activeShare = burned > 0 ? (day!.active / burned) * 100 : 0;
  const totals = week.map((d) => d.active + d.resting);
  const withData = totals.filter((t) => t > 0);
  const average = withData.length ? withData.reduce((a, b) => a + b, 0) / withData.length : 0;
  const labels = week.map((d) => d.label);

  return (
    <Screen tabBarSpace>
      <Header eyebrow={isHealthSupported() ? 'From your Apple Watch, through Apple Health' : 'Typed in, or sent from your iPhone'} title="Burned" />

      <Glass>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
          <Num style={{ fontSize: 40, color: colors.burned }}>{formatCalories(burned)}</Num>
          <Muted style={{ fontSize: 14 }}>calories so far today</Muted>
        </View>
        <View style={{ flexDirection: 'row', gap: 3, height: 10, marginTop: 14, marginBottom: 6 }}>
          <View style={{ width: `${Math.max(2, activeShare)}%`, borderRadius: 5, backgroundColor: colors.burned }} />
          <View style={{ flex: 1, borderRadius: 5, backgroundColor: colors.burnedDeep }} />
        </View>
        <Row first title="Active" detail="Workouts and moving around" value={formatCalories(day?.active ?? 0)} left={<View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.burned }} />} />
        <Row title="Resting" detail="What your body uses just staying alive" value={formatCalories(day?.resting ?? 0)} left={<View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.burnedDeep }} />} />
      </Glass>

      {isHealthSupported() && burned === 0 && (
        <Glass>
          <Body>No calories from Apple Health yet.</Body>
          <Muted style={{ marginBottom: 12 }}>Allow access to active energy, resting energy and workouts, and your Watch data fills this in by itself.</Muted>
          <PrimaryButton title="Connect Apple Health" onPress={() => requestHealthPermissions().then(() => setReload(reload + 1))} />
        </Glass>
      )}
      {!isHealthSupported() && <WebBurnCard active={day?.active ?? 0} resting={day?.resting ?? 0} onSaved={() => setReload(reload + 1)} />}

      <Heading>Workouts today</Heading>
      <Glass padding={0} style={{ paddingHorizontal: 14 }}>
        {(day?.workouts.length ?? 0) === 0 ? (
          <View style={{ paddingVertical: 14 }}>
            <Muted>No workouts recorded today.</Muted>
          </View>
        ) : (
          day!.workouts.map((w, index) => (
            <Row
              key={w.id}
              first={index === 0}
              title={w.name}
              detail={`${formatTime(new Date(w.start))} · ${w.minutes} min${miles(w.distanceMeters)}`}
              value={formatCalories(w.calories)}
              valueColor={colors.burned}
            />
          ))
        )}
      </Glass>

      <Heading>Last 7 days</Heading>
      <ChartCard
        cardId="burned"
        styles={['bars', 'line', 'pie']}
        title={`Average ${formatCalories(average)} a day`}
        render={(style) =>
          style === 'pie' ? (
            <PieChart
              slices={[
                { label: 'Resting', value: week.reduce((s, d) => s + d.resting, 0), color: colors.burnedDeep },
                { label: 'Active', value: week.reduce((s, d) => s + d.active, 0), color: colors.burned },
              ]}
              centerValue={formatCalories(average)}
              centerLabel="cal a day"
            />
          ) : style === 'line' ? (
            <LineChart labels={labels} series={[{ label: 'Burned', color: colors.burned, values: totals.map((t) => (t > 0 ? t : null)) }]} />
          ) : (
            <BarsChart labels={labels} series={[{ label: 'Burned', color: colors.burned, values: totals }]} />
          )
        }
      />
    </Screen>
  );
}
