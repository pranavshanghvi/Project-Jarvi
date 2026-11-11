import { useEffect, useState } from 'react';
import { TextInput, View } from 'react-native';
import { loadAllWeights } from '../data/dayData';
import { getHealthProfile, isHealthSupported, requestHealthPermissions } from '../health/healthKit';
import { getProfile, saveProfile, Sex } from '../profile/profileStore';
import { getWeightUnit, saveWeightUnit } from '../settings/settingsStore';
import { Glass, Header, Icon, Muted, OutlineButton, PrimaryButton, Screen, Segmented, Title } from '../ui/kit';
import { colors } from '../ui/theme';
import { cmToFtIn, fromDisplayWeight, ftInToCm, toDisplayWeight, WeightUnit } from '../units';
import { latestWeight, logWeight } from '../weight/weightStore';

const input = { height: 52, borderRadius: 16, borderWidth: 1, borderColor: colors.outline, color: colors.text, fontSize: 18, paddingHorizontal: 16 } as const;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      <Muted>{label}</Muted>
      {children}
    </View>
  );
}

export default function ProfileScreen({ route, navigation }: any) {
  const onboarding = !!route.params?.onboarding;
  const [month, setMonth] = useState('');
  const [dayOfMonth, setDayOfMonth] = useState('');
  const [year, setYear] = useState('');
  const [sex, setSex] = useState<Sex>('male');
  const [feet, setFeet] = useState('');
  const [inches, setInches] = useState('');
  const [cm, setCm] = useState('');
  const [weight, setWeight] = useState('');
  const [unit, setUnit] = useState<WeightUnit>('lb');
  const [hadWeight, setHadWeight] = useState(false);
  const [note, setNote] = useState('');

  function applyBirth(dateOfBirth?: string) {
    if (!dateOfBirth) return;
    const [y, m, d] = dateOfBirth.split('-');
    setYear(y);
    setMonth(String(Number(m)));
    setDayOfMonth(String(Number(d)));
  }
  function applyHeight(heightCm?: number) {
    if (!heightCm) return;
    const { ft, inches: inch } = cmToFtIn(heightCm);
    setFeet(String(ft));
    setInches(String(inch));
    setCm(String(Math.round(heightCm)));
  }

  useEffect(() => {
    (async () => {
      const [profile, savedUnit, weights] = await Promise.all([getProfile(), getWeightUnit(), loadAllWeights()]);
      setUnit(savedUnit);
      if (profile) {
        applyBirth(profile.dateOfBirth);
        setSex(profile.sex);
        applyHeight(profile.heightCm);
      }
      const latest = latestWeight(weights);
      if (latest) {
        setHadWeight(true);
        setWeight(toDisplayWeight(latest.kg, savedUnit).toFixed(1));
      }
    })();
  }, []);

  async function fillFromHealth() {
    await requestHealthPermissions();
    const health = await getHealthProfile();
    applyBirth(health.dateOfBirth);
    if (health.sex) setSex(health.sex);
    applyHeight(health.heightCm);
    if (health.weightKg) setWeight(toDisplayWeight(health.weightKg, unit).toFixed(1));
    const found = [health.dateOfBirth && 'date of birth', health.sex && 'sex', health.heightCm && 'height', health.weightKg && 'weight'].filter(Boolean);
    setNote(found.length ? `Filled in from Apple Health: ${found.join(', ')}.` : 'Apple Health had none of these, or access was not allowed. Type them in instead.');
  }

  function changeUnit(next: WeightUnit) {
    const n = Number(weight.replace(',', '.'));
    if (weight && Number.isFinite(n)) setWeight(toDisplayWeight(fromDisplayWeight(n, unit), next).toFixed(1));
    setUnit(next);
  }

  const y = Number(year);
  const m = Number(month);
  const d = Number(dayOfMonth);
  const birthValid = y >= 1900 && y <= new Date().getFullYear() && m >= 1 && m <= 12 && d >= 1 && d <= 31;
  const heightCm = unit === 'lb' ? ftInToCm(Number(feet) || 0, Number(inches) || 0) : Number(cm) || 0;
  const heightValid = heightCm >= 90 && heightCm <= 250;
  const weightNumber = Number(weight.replace(',', '.'));
  const weightValid = weight === '' || (Number.isFinite(weightNumber) && weightNumber > 20 && weightNumber < 1000);
  const canSave = birthValid && heightValid && weightValid;

  async function save() {
    if (!canSave) return;
    await saveProfile({ dateOfBirth: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`, sex, heightCm });
    await saveWeightUnit(unit);
    // Only log a weight here when there was none before; daily weights belong on the Weight screen.
    if (weight !== '' && !hadWeight) await logWeight(fromDisplayWeight(weightNumber, unit));
    if (onboarding) navigation.replace('Goals');
    else navigation.goBack();
  }

  return (
    <Screen>
      {onboarding ? (
        <View style={{ gap: 6, marginTop: 8 }}>
          <Title>About you</Title>
          <Muted style={{ fontSize: 15 }}>Four answers, so your calorie targets fit your body. You can change them any time.</Muted>
        </View>
      ) : (
        <Header title="About you" onBack={() => navigation.goBack()} />
      )}

      {isHealthSupported() && (
        <Glass onPress={fillFromHealth} label="Fill in from Apple Health">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Icon name="heart" size={22} color={colors.burned} />
            <Muted style={{ flex: 1 }}>{note || 'Already in Apple Health? Tap here and these fill in by themselves.'}</Muted>
          </View>
        </Glass>
      )}

      <Field label="Date of birth (month, day, year)">
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <TextInput value={month} onChangeText={setMonth} keyboardType="number-pad" maxLength={2} placeholder="MM" placeholderTextColor={colors.placeholder} accessibilityLabel="Birth month" style={[input, { flex: 1 }]} />
          <TextInput value={dayOfMonth} onChangeText={setDayOfMonth} keyboardType="number-pad" maxLength={2} placeholder="DD" placeholderTextColor={colors.placeholder} accessibilityLabel="Birth day" style={[input, { flex: 1 }]} />
          <TextInput value={year} onChangeText={setYear} keyboardType="number-pad" maxLength={4} placeholder="YYYY" placeholderTextColor={colors.placeholder} accessibilityLabel="Birth year" style={[input, { flex: 1.4 }]} />
        </View>
      </Field>

      <Field label="Sex, for the energy estimate">
        <Segmented options={[{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }]} value={sex} onChange={setSex} />
      </Field>

      <Field label="Units">
        <Segmented options={[{ value: 'lb', label: 'Pounds, feet' }, { value: 'kg', label: 'Kilograms, cm' }]} value={unit} onChange={changeUnit} />
      </Field>

      <Field label="Height">
        {unit === 'lb' ? (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TextInput value={feet} onChangeText={setFeet} keyboardType="number-pad" maxLength={1} placeholder="ft" placeholderTextColor={colors.placeholder} accessibilityLabel="Height, feet" style={[input, { flex: 1 }]} />
            <TextInput value={inches} onChangeText={setInches} keyboardType="number-pad" maxLength={2} placeholder="in" placeholderTextColor={colors.placeholder} accessibilityLabel="Height, inches" style={[input, { flex: 1 }]} />
          </View>
        ) : (
          <TextInput value={cm} onChangeText={setCm} keyboardType="number-pad" maxLength={3} placeholder="cm" placeholderTextColor={colors.placeholder} accessibilityLabel="Height in centimetres" style={input} />
        )}
      </Field>

      <Field label={`Weight today (${unit})${hadWeight ? ' · change it on the Weight screen' : ''}`}>
        <TextInput value={weight} onChangeText={setWeight} editable={!hadWeight} keyboardType="decimal-pad" placeholder={unit === 'lb' ? '182.4' : '82.7'} placeholderTextColor={colors.placeholder} accessibilityLabel="Weight today" style={[input, hadWeight && { color: colors.muted }]} />
      </Field>

      <PrimaryButton title={onboarding ? 'Next: set a goal' : 'Save'} onPress={save} disabled={!canSave} />
      {onboarding && <OutlineButton title="Not now" onPress={() => navigation.goBack()} />}
      <Muted style={{ fontSize: 12, textAlign: 'center' }}>Stays on your phone. Never uploaded.</Muted>
    </Screen>
  );
}
