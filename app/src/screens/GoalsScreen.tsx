import { useEffect, useState } from 'react';
import { TextInput, View } from 'react-native';
import { addDays, loadAllWeights, loadDay, startOfDay } from '../data/dayData';
import { getEntriesInRange } from '../db/entriesRepository';
import { dailyNetTarget, dayOnTarget, estimateRestingCalories, Goal, goalProgress, intakeTarget, isLossGoal, MIN_DAILY_INTAKE, Pace, PACE_LB_PER_WEEK, projectedDate } from '../goals/goals';
import { getGoal, saveGoal } from '../goals/goalStore';
import { getEnergySplitByDay } from '../health/healthKit';
import { toDateKey } from '../nutrition/aggregation';
import { buildDailyBalance, caloriesEatenByDate, DayBalance } from '../nutrition/energyBalance';
import { getProfile } from '../profile/profileStore';
import { getWeightUnit } from '../settings/settingsStore';
import { Body, Glass, Header, Heading, Icon, Muted, Num, OutlineButton, PrimaryButton, Row, Screen, Segmented } from '../ui/kit';
import { colors, formatCalories } from '../ui/theme';
import { formatWeight, fromDisplayWeight, toDisplayWeight, WeightUnit } from '../units';
import { latestWeight, logWeight, WeightEntry } from '../weight/weightStore';

const PACES: { value: Pace; label: string }[] = [
  { value: 'gentle', label: 'Gentle' },
  { value: 'steady', label: 'Steady' },
  { value: 'faster', label: 'Faster' },
];

export default function GoalsScreen({ navigation }: any) {
  const [goal, setGoal] = useState<Goal | null>(null);
  const [weights, setWeights] = useState<WeightEntry[]>([]);
  const [unit, setUnit] = useState<WeightUnit>('lb');
  const [burnedToday, setBurnedToday] = useState(0);
  const [week, setWeek] = useState<DayBalance[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [targetText, setTargetText] = useState('');
  const [currentText, setCurrentText] = useState('');
  const [pace, setPace] = useState<Pace>('steady');

  async function reload() {
    const today = startOfDay(new Date());
    const start = addDays(today, -6);
    const [g, w, u, day, entries, split, profile] = await Promise.all([
      getGoal(), loadAllWeights(), getWeightUnit(), loadDay(today),
      getEntriesInRange(toDateKey(start), toDateKey(today)), getEnergySplitByDay(start, today), getProfile(),
    ]);
    const burned: Record<string, number> = {};
    for (const [key, e] of Object.entries(split)) burned[key] = e.active + e.resting;
    setGoal(g);
    setWeights(w);
    setUnit(u);
    setWeek(buildDailyBalance(caloriesEatenByDate(entries), burned, 7, today));
    // Early in the day the Watch has only counted a few hours. For the "eat about" figure use a
    // whole day's worth: the 7-day average if there is one, else an estimate from the profile.
    const fullDays = Object.entries(burned).filter(([key, v]) => key !== toDateKey(today) && v > 0).map(([, v]) => v);
    const latest = latestWeight(w);
    const typical = fullDays.length
      ? fullDays.reduce((a, b) => a + b, 0) / fullDays.length
      : profile && latest
        ? estimateRestingCalories(profile, latest.kg, today) * 1.3
        : 0;
    // With neither a full day from the Watch nor a profile there is nothing honest to base an
    // "eat about" figure on, so it is left blank rather than computed from a few hours of burn.
    setBurnedToday(typical > 0 ? Math.max(day.burned, typical) : 0);
    if (g) setPace(g.pace);
    if (!g) setEditing(true);
    setLoaded(true);
  }
  // Re-read whenever this screen comes back into view, so a change made on another screen shows here.
  useEffect(() => {
    reload();
    return navigation.addListener('focus', reload);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation]);

  const latest = latestWeight(weights);
  const currentKg = latest?.kg ?? (currentText ? fromDisplayWeight(Number(currentText.replace(',', '.')), unit) : undefined);
  const targetNumber = Number(targetText.replace(',', '.'));
  const canSave = Number.isFinite(targetNumber) && targetNumber > 20 && targetNumber < 1000 && currentKg !== undefined && Number.isFinite(currentKg) && currentKg > 10;

  async function save() {
    if (!canSave || currentKg === undefined) return;
    const next: Goal = {
      // Keep the original starting point when only the target or pace changes.
      startWeightKg: goal ? goal.startWeightKg : currentKg,
      targetWeightKg: fromDisplayWeight(targetNumber, unit),
      pace,
      startedOn: goal ? goal.startedOn : toDateKey(new Date()),
    };
    await saveGoal(next);
    // A weight typed here is also the first weigh-in, so the progress bar has a "now" to show.
    if (!latest) await logWeight(currentKg);
    setTargetText('');
    setEditing(false);
    await reload();
  }

  async function changePace(next: Pace) {
    setPace(next);
    if (goal && !editing) {
      const updated = { ...goal, pace: next };
      await saveGoal(updated);
      setGoal(updated);
    }
  }

  if (!loaded) return <Screen><Header title="Your goal" onBack={() => navigation.goBack()} /></Screen>;

  if (editing || !goal) {
    return (
      <Screen>
        <Header title="Your goal" onBack={() => (goal ? setEditing(false) : navigation.goBack())} />
        <Muted style={{ fontSize: 15 }}>Pick the weight you want to reach and how fast. The app turns that into a daily calorie target.</Muted>
        {!latest && (
          <Glass>
            <Muted style={{ marginBottom: 8 }}>Your weight now ({unit})</Muted>
            <TextInput value={currentText} onChangeText={setCurrentText} keyboardType="decimal-pad" placeholder={unit === 'lb' ? '182.4' : '82.7'} placeholderTextColor={colors.placeholder} accessibilityLabel="Current weight" style={inputStyle} />
          </Glass>
        )}
        <Glass>
          <Muted style={{ marginBottom: 8 }}>
            Weight you want to reach ({unit}){latest ? ` · you are at ${formatWeight(latest.kg, unit)}` : ''}
          </Muted>
          <TextInput value={targetText} onChangeText={setTargetText} keyboardType="decimal-pad" placeholder={goal ? toDisplayWeight(goal.targetWeightKg, unit).toFixed(1) : unit === 'lb' ? '175' : '79'} placeholderTextColor={colors.placeholder} accessibilityLabel="Target weight" style={inputStyle} />
        </Glass>
        <Heading>Your pace</Heading>
        <Segmented options={PACES} value={pace} onChange={changePace} />
        <Muted>About {PACE_LB_PER_WEEK[pace]} lb a week. Steady is the usual choice; faster is harder to keep up.</Muted>
        <PrimaryButton title="Save goal" onPress={save} disabled={!canSave} />
        <Muted style={{ fontSize: 12, textAlign: 'center' }}>Targets are estimates from your profile, not medical advice.</Muted>
      </Screen>
    );
  }

  const progress = latest ? goalProgress(goal, latest.kg) : null;
  const eta = projectedDate(goal, weights, new Date());
  const target = dailyNetTarget(goal);
  const intake = intakeTarget(burnedToday, goal);
  const marks = week.map((row) => (row.logged ? dayOnTarget(row.net, goal) : null));
  const hits = marks.filter((m) => m === true).length;
  const loggedCount = marks.filter((m) => m !== null).length;

  return (
    <Screen>
      <Header title="Your goal" onBack={() => navigation.goBack()} />

      <Glass>
        <Muted>Reach</Muted>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
          <Num style={{ fontSize: 44 }}>{toDisplayWeight(goal.targetWeightKg, unit).toFixed(0)}</Num>
          <Muted style={{ fontSize: 16 }}>{unit}</Muted>
        </View>
        <View style={{ height: 10, borderRadius: 5, backgroundColor: colors.track, marginTop: 14, marginBottom: 8 }}>
          <View style={{ height: 10, borderRadius: 5, backgroundColor: colors.text, width: `${Math.round((progress?.fraction ?? 0) * 100)}%` }} />
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Muted style={{ fontSize: 12 }}>Started {toDisplayWeight(goal.startWeightKg, unit).toFixed(1)}</Muted>
          <Muted style={{ fontSize: 12, color: colors.text }}>{latest ? `Now ${toDisplayWeight(latest.kg, unit).toFixed(1)}` : 'No weight logged'}</Muted>
          <Muted style={{ fontSize: 12 }}>Goal {toDisplayWeight(goal.targetWeightKg, unit).toFixed(1)}</Muted>
        </View>
        {progress && (
          <View style={{ flexDirection: 'row', marginTop: 14 }}>
            <View style={{ flex: 1 }}>
              <Num style={{ fontSize: 20 }}>{formatWeight(progress.doneKg, unit)}</Num>
              <Muted style={{ fontSize: 12 }}>{isLossGoal(goal) ? 'lost so far' : 'gained so far'}</Muted>
            </View>
            <View style={{ flex: 1 }}>
              <Num style={{ fontSize: 20 }}>{formatWeight(progress.remainingKg, unit)}</Num>
              <Muted style={{ fontSize: 12 }}>still to go</Muted>
            </View>
          </View>
        )}
        <Muted style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.hairline }}>
          {eta ? `At this rate you get there around ${eta.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}.` : progress && progress.remainingKg === 0 ? 'You have reached your goal.' : 'Log your weight to see when you will get there.'}
        </Muted>
      </Glass>

      <Heading>Your pace</Heading>
      <Segmented options={PACES} value={pace} onChange={changePace} />

      <Glass padding={0} style={{ paddingHorizontal: 14 }}>
        <Row first title={target <= 0 ? 'Daily deficit to aim for' : 'Daily surplus to aim for'} detail={`About ${PACE_LB_PER_WEEK[goal.pace]} lb a week`} value={formatCalories(Math.abs(target))} />
        <Row
          title="So eat about"
          detail={burnedToday === 0 ? 'Shows after a full day of Apple Health data, or once your profile is filled in' : intake === MIN_DAILY_INTAKE ? 'Never set below 1,200' : 'Moves with what you burn each day'}
          value={burnedToday === 0 ? '—' : formatCalories(intake)}
          valueColor={colors.eaten}
        />
      </Glass>

      <Glass>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
          <Muted>Last 7 days</Muted>
          <Muted>{loggedCount ? `${hits} of ${loggedCount} logged days on target` : 'No food logged yet'}</Muted>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          {week.map((row, i) => (
            <View key={row.date} style={{ alignItems: 'center', gap: 6 }}>
              <View
                style={[
                  { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
                  marks[i] === true ? { backgroundColor: colors.burned } : { borderWidth: 2, borderColor: marks[i] === false ? colors.eaten : colors.outline },
                ]}
              >
                {marks[i] === true && <Icon name="check" size={16} color="#0B0F14" strokeWidth={3} />}
              </View>
              <Muted style={{ fontSize: 11 }}>{new Date(`${row.date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short' })}</Muted>
            </View>
          ))}
        </View>
        <Muted style={{ fontSize: 12, marginTop: 10 }}>Teal tick: on target. Orange ring: logged, but over. Grey ring: nothing logged.</Muted>
      </Glass>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <OutlineButton title="Change target" onPress={() => { setTargetText(''); setEditing(true); }} style={{ flex: 1 }} />
        <OutlineButton title="Weight graph" onPress={() => navigation.navigate('Weight')} style={{ flex: 1 }} />
      </View>
      <OutlineButton title="Edit profile" onPress={() => navigation.navigate('Profile')} />
      <Muted style={{ fontSize: 12, textAlign: 'center' }}>Targets are estimates from your profile, not medical advice.</Muted>
    </Screen>
  );
}

const inputStyle = { minWidth: 0, height: 52, borderRadius: 16, borderWidth: 1, borderColor: colors.outline, color: colors.text, fontSize: 20, paddingHorizontal: 16 } as const;
