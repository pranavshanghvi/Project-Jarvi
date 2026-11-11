import { useEffect, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import Svg, { Circle, Line, Rect } from 'react-native-svg';
import { addDays, DayData, isSameDay, loadAllWeights, loadDay, MEAL_LABELS, mealTitle, entryCalories } from '../data/dayData';
import { dailyNetTarget, dayOnTarget, Goal, goalProgress } from '../goals/goals';
import { getGoal } from '../goals/goalStore';
import { getWeightUnit } from '../settings/settingsStore';
import { BalanceRing } from '../ui/charts';
import { Body, Glass, Header, IconButton, Muted, Num, Row, Screen } from '../ui/kit';
import { colors, formatCalories, formatLongDate, formatSigned, formatTime, useChartWidth } from '../ui/theme';
import { formatWeight, WeightUnit } from '../units';
import { latestWeight, WeightEntry } from '../weight/weightStore';
import { AppNav } from '../navigation/types';

interface Props {
  date: Date;
  onDateChange: (date: Date) => void;
  refreshKey: number;
  nav: AppNav;
}

// The strip that shows when in the day you ate (dots) and exercised (bars).
function DayRibbon({ day }: { day: DayData }) {
  const width = useChartWidth();
  const x = (iso: string) => {
    const d = new Date(iso);
    return ((d.getHours() * 60 + d.getMinutes()) / 1440) * width;
  };
  return (
    <View>
      <Svg width={width} height={26}>
        <Line x1={0} y1={13} x2={width} y2={13} stroke={colors.track} strokeWidth={3} strokeLinecap="round" />
        {day.workouts.map((w) => (
          <Rect key={w.id} x={x(w.start)} y={7} width={Math.max(6, (w.minutes / 1440) * width)} height={12} rx={4} fill={colors.burned} />
        ))}
        {day.entries.map((e) => (
          <Circle key={e.id} cx={x(e.timestamp)} cy={13} r={6} fill={colors.eaten} />
        ))}
      </Svg>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        {['12 AM', '6 AM', 'Noon', '6 PM', '12 AM'].map((label, i) => (
          <Muted key={i} style={{ fontSize: 11 }}>{label}</Muted>
        ))}
      </View>
    </View>
  );
}

export default function TodayScreen({ date, onDateChange, refreshKey, nav }: Props) {
  const [day, setDay] = useState<DayData | null>(null);
  const [goal, setGoal] = useState<Goal | null>(null);
  const [weights, setWeights] = useState<WeightEntry[]>([]);
  const [unit, setUnit] = useState<WeightUnit>('lb');
  const today = new Date();
  const isToday = isSameDay(date, today);

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadDay(date), getGoal(), loadAllWeights(), getWeightUnit()]).then(([d, g, w, u]) => {
      if (cancelled) return;
      setDay(d);
      setGoal(g);
      setWeights(w);
      setUnit(u);
    });
    return () => {
      cancelled = true;
    };
  }, [date, refreshKey]);

  const eaten = day?.eaten ?? 0;
  const burned = day?.burned ?? 0;
  const logged = (day?.entries.length ?? 0) > 0;
  const net = eaten - burned;
  const target = goal ? dailyNetTarget(goal) : null;
  const weight = latestWeight(weights);
  const progress = goal && weight ? goalProgress(goal, weight.kg) : null;

  // Meals and workouts in one list, in the order they happened.
  const timeline = day
    ? [
        ...day.workouts.map((w) => ({ at: w.start, kind: 'workout' as const, workout: w })),
        ...day.entries.map((e) => ({ at: e.timestamp, kind: 'meal' as const, entry: e })),
      ].sort((a, b) => a.at.localeCompare(b.at))
    : [];

  return (
    <Screen tabBarSpace>
      <Header
        eyebrow={formatLongDate(date)}
        title={isToday ? 'Today' : date.toLocaleDateString('en-US', { weekday: 'long' })}
        right={
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <IconButton icon="back" label="Previous day" onPress={() => onDateChange(addDays(date, -1))} />
            <IconButton icon="forward" label="Next day" disabled={isToday} onPress={() => onDateChange(addDays(date, 1))} />
            <IconButton icon="user" label="Your profile" onPress={nav.openProfile} />
          </View>
        }
      />

      <Pressable onPress={nav.openGoals} accessibilityRole="button" accessibilityLabel="Your goal" style={{ alignItems: 'center' }}>
        <BalanceRing eaten={eaten} burned={burned}>
          {logged ? (
            <>
              <Num style={{ fontSize: 36 }}>{formatSigned(net)}</Num>
              <Muted>{net <= 0 ? 'calorie deficit' : 'calorie surplus'}</Muted>
            </>
          ) : (
            <>
              <Num style={{ fontSize: 30 }}>{formatCalories(burned)}</Num>
              <Muted style={{ textAlign: 'center' }}>burned so far</Muted>
            </>
          )}
          {target !== null && goal ? (
            <Muted style={{ fontSize: 12, fontWeight: '600', color: logged && dayOnTarget(net, goal) ? colors.burned : colors.muted, marginTop: 4 }}>
              {`Goal ${formatSigned(target)}${logged && dayOnTarget(net, goal) ? ' met' : ''}`}
            </Muted>
          ) : (
            <Muted style={{ fontSize: 12, marginTop: 4 }}>Tap to set a goal</Muted>
          )}
        </BalanceRing>
      </Pressable>

      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Glass onPress={() => nav.goTab('food')} label="Food log">
            <Muted>Eaten</Muted>
            <Num style={{ fontSize: 26, color: colors.eaten }}>{formatCalories(eaten)}</Num>
            <Muted style={{ fontSize: 12 }}>{logged ? `${day!.entries.length} ${day!.entries.length === 1 ? 'meal' : 'meals'}` : 'Nothing logged yet'}</Muted>
          </Glass>
        </View>
        <View style={{ flex: 1 }}>
          <Glass onPress={() => nav.goTab('burned')} label="Calories burned">
            <Muted>Burned</Muted>
            <Num style={{ fontSize: 26, color: colors.burned }}>{formatCalories(burned)}</Num>
            <Muted style={{ fontSize: 12 }}>
              {burned > 0 ? `${day!.workouts.length} ${day!.workouts.length === 1 ? 'workout' : 'workouts'}` : Platform.OS === 'ios' ? 'Waiting for Apple Health' : 'Tap to add'}
            </Muted>
          </Glass>
        </View>
      </View>

      <Glass onPress={nav.openWeight} label="Weight" padding={0}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48, paddingHorizontal: 14 }}>
          <Body>
            Weight{'  '}
            <Num>{weight ? formatWeight(weight.kg, unit) : 'not logged'}</Num>
          </Body>
          <Muted>{progress && goal ? `${formatWeight(progress.remainingKg, unit)} to goal  ›` : 'Open  ›'}</Muted>
        </View>
      </Glass>

      <Glass>
        <Muted style={{ marginBottom: 8 }}>{isToday ? 'Your day' : 'That day'}</Muted>
        {day ? <DayRibbon day={day} /> : null}
      </Glass>

      <Glass padding={0} style={{ paddingHorizontal: 14 }}>
        {timeline.length === 0 ? (
          <View style={{ paddingVertical: 16 }}>
            <Body>Nothing yet {isToday ? 'today' : 'that day'}.</Body>
            <Muted>Tap the round + button to log a meal from a photo.</Muted>
          </View>
        ) : (
          timeline.map((item, index) =>
            item.kind === 'workout' ? (
              <Row
                key={`w-${item.workout.id}`}
                first={index === 0}
                title={item.workout.name}
                detail={`${formatTime(new Date(item.workout.start))} · ${item.workout.minutes} min`}
                value={formatSigned(-item.workout.calories)}
                valueColor={colors.burned}
                onPress={() => nav.goTab('burned')}
              />
            ) : (
              <Row
                key={`m-${item.entry.id}`}
                first={index === 0}
                title={mealTitle(item.entry)}
                detail={`${formatTime(new Date(item.entry.timestamp))} · ${MEAL_LABELS[item.entry.mealType]}`}
                value={formatCalories(entryCalories(item.entry))}
                valueColor={colors.eaten}
                onPress={() => nav.openMeal(item.entry.id)}
              />
            )
          )
        )}
      </Glass>
    </Screen>
  );
}
