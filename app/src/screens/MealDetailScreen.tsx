import { useEffect, useState } from 'react';
import { Alert, Image, Pressable, TextInput, View } from 'react-native';
import Slider from '@react-native-community/slider';
import { MEAL_LABELS, resolvePhotoUri } from '../data/dayData';
import { createEntry, deleteEntry, getEntry, updateEntry } from '../db/entriesRepository';
import { markPhotoUsed } from '../glasses/glassesPhotos';
import { inferMealType } from '../nutrition/mealTagging';
import { scaleNutrients } from '../nutrition/portionScaling';
import { completeNutrients, ConfidenceLevel, MealType, NutrientProfile, NUTRIENT_KEYS } from '../types/nutrition';
import { Body, Glass, Header, Icon, IconButton, Muted, Num, OutlineButton, PrimaryButton, Screen, Title } from '../ui/kit';
import { Learn, LearnLabel } from '../ui/learn';
import { colors, formatCalories, formatTime } from '../ui/theme';

// One food on the plate. `base` is the nutrients at a 1× portion; the slider only changes `portion`.
interface Line {
  id?: number; // set when it is already saved
  name: string;
  detail?: string;
  confidence: ConfidenceLevel;
  base: NutrientProfile;
  portion: number;
}

const MEAL_ORDER: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

// Every number that can be corrected by hand, in the order shown.
const FIELDS: { key: keyof NutrientProfile; label: string; unit: string }[] = [
  { key: 'calories', label: 'Calories', unit: '' },
  { key: 'proteinG', label: 'Protein', unit: 'g' },
  { key: 'carbsG', label: 'Carbs', unit: 'g' },
  { key: 'fatG', label: 'Fat', unit: 'g' },
  { key: 'saturatedFatG', label: 'Saturated fat', unit: 'g' },
  { key: 'fiberG', label: 'Fiber', unit: 'g' },
  { key: 'sugarG', label: 'Sugar', unit: 'g' },
  { key: 'addedSugarG', label: 'Added sugar', unit: 'g' },
  { key: 'sodiumMg', label: 'Sodium', unit: 'mg' },
  { key: 'cholesterolMg', label: 'Cholesterol', unit: 'mg' },
];

// A number box that can be emptied and retyped. It keeps its own text so that clearing it to
// type a new figure does not snap straight back to 0.
// `max` is a ceiling far above any real single food: a slipped finger (250300 for 300) should not
// be able to put a quarter of a million calories into the log.
function NumberField({ label, unit, value, max, onChange }: { label: string; unit: string; value: number; max: number; onChange: (value: number) => void }) {
  const shown = String(Math.round(value * 10) / 10);
  const [text, setText] = useState(shown);
  const [focused, setFocused] = useState(false);
  // When the slider (not the keyboard) changes the amount, show the new figure.
  useEffect(() => {
    if (!focused) setText(shown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown]);
  return (
    <View style={{ width: '33.33%', paddingRight: 8, marginBottom: 10 }}>
      <Muted style={{ fontSize: 12 }}>{unit ? `${label} (${unit})` : label}</Muted>
      <TextInput
        value={text}
        keyboardType="decimal-pad"
        selectTextOnFocus
        accessibilityLabel={label}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChangeText={(next) => {
          setText(next);
          const parsed = Number(next.replace(',', '.'));
          onChange(next !== '' && Number.isFinite(parsed) && parsed >= 0 ? Math.min(parsed, max) : 0);
        }}
        style={{ height: 40, borderRadius: 10, borderWidth: 1, borderColor: colors.outline, color: colors.text, fontSize: 16, paddingHorizontal: 10, marginTop: 4 }}
      />
    </View>
  );
}

export default function MealDetailScreen({ route, navigation }: any) {
  const { entryId, draft } = route.params ?? {};
  const isNew = !entryId;
  const [lines, setLines] = useState<Line[]>([]);
  const [removedIds, setRemovedIds] = useState<number[]>([]);
  const [when, setWhen] = useState<Date>(draft?.takenAt ? new Date(draft.takenAt) : new Date());
  const [mealType, setMealType] = useState<MealType>(inferMealType(draft?.takenAt ? new Date(draft.takenAt) : new Date()));
  const [photo, setPhoto] = useState<string>(draft?.photoUri ?? '');
  const [editingTime, setEditingTime] = useState(false);
  // Which food's correction boxes are open, if any.
  const [editing, setEditing] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (draft) {
      setLines(draft.items.map((item: any) => ({ name: item.name, detail: item.portionDescription, confidence: item.confidence, base: completeNutrients(item.nutrients), portion: 1 })));
      return;
    }
    getEntry(entryId).then((entry) => {
      if (!entry) return navigation.goBack();
      setWhen(new Date(entry.timestamp));
      setMealType(entry.mealType);
      setPhoto(entry.photoPath);
      setLines(
        entry.items.map((item) => ({
          id: item.id,
          name: item.name,
          confidence: item.confidence,
          // Saved nutrients already include the portion, so divide it back out to get the 1× amounts.
          base: scaleNutrients(completeNutrients(item.nutrients), 1 / (item.portionMultiplier || 1)),
          portion: item.portionMultiplier || 1,
        }))
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryId]);

  const totals = {} as NutrientProfile;
  for (const key of NUTRIENT_KEYS) totals[key] = lines.reduce((sum, l) => sum + l.base[key] * l.portion, 0);

  function setPortion(index: number, portion: number) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, portion } : l)));
  }
  function removeLine(index: number) {
    const line = lines[index];
    if (line.id) setRemovedIds((prev) => [...prev, line.id!]);
    setLines((prev) => prev.filter((_, i) => i !== index));
    setEditing(null);
  }
  function renameLine(index: number, name: string) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, name } : l)));
  }
  // The number typed is what was actually eaten, so store it as the 1x amount for this portion.
  function setAmount(index: number, key: keyof NutrientProfile, amount: number) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, base: { ...l.base, [key]: amount / (l.portion || 1) } } : l)));
  }
  // For a food the photo reader missed, or a meal typed in with no photo at all.
  function addLine() {
    setLines((prev) => [...prev, { name: '', confidence: 'normal', base: completeNutrients({}), portion: 1 }]);
    setEditing(lines.length);
  }
  // What gets saved for one food: a name is never blank, and added sugar never exceeds sugar.
  function finished(line: Line) {
    const nutrients = scaleNutrients(line.base, line.portion);
    nutrients.addedSugarG = Math.min(nutrients.addedSugarG, nutrients.sugarG);
    return { name: line.name.trim() || 'Food', nutrients };
  }
  function shiftTime(minutes: number) {
    const next = new Date(when.getTime() + minutes * 60000);
    if (next.getTime() <= Date.now()) setWhen(next);
  }

  async function save() {
    setSaving(true);
    try {
      if (isNew) {
        await createEntry(
          draft.photoUri,
          mealType,
          lines.map((l) => ({
            item: { ...finished(l), confidence: l.confidence, portionDescription: l.detail ?? '' },
            portionMultiplier: l.portion,
          })),
          when
        );
        // A glasses photo that has been logged is not offered again.
        if (draft.glassesPhotoId) markPhotoUsed(draft.glassesPhotoId);
      } else {
        await updateEntry(entryId, {
          timestamp: when.toISOString(),
          mealType,
          items: lines.filter((l) => l.id).map((l) => ({ id: l.id!, portionMultiplier: l.portion, ...finished(l) })),
          removedItemIds: removedIds,
          addedItems: lines.filter((l) => !l.id).map((l) => ({ item: { ...finished(l), confidence: l.confidence, portionDescription: '' }, portionMultiplier: l.portion })),
        });
      }
      navigation.popTo('Tabs');
    } catch {
      setSaving(false);
      Alert.alert('Could not save', 'This meal was not saved. Try again.');
    }
  }

  function confirmDelete() {
    if (isNew) return navigation.popTo('Tabs');
    Alert.alert('Delete this meal?', 'It will be removed from your log and your totals.', [
      { text: 'Keep it', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteEntry(entryId).then(() => navigation.popTo('Tabs')) },
    ]);
  }

  const names = lines.map((l) => l.name.trim() || 'Food');
  const title = lines.length === 0 ? (photo ? 'No food found' : 'New meal') : lines.length <= 2 ? names.join(', ') : `${names[0]} +${lines.length - 1}`;

  return (
    <Screen>
      {photo ? (
        <View style={{ height: 220, borderRadius: 22, overflow: 'hidden', backgroundColor: colors.track }}>
          <Image source={{ uri: resolvePhotoUri(photo) }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
          <View style={{ position: 'absolute', left: 10, top: 10 }}>
            <IconButton icon="back" label="Back" onPress={() => navigation.goBack()} />
          </View>
        </View>
      ) : (
        <Header title={isNew ? 'Type in a meal' : 'Meal'} onBack={() => navigation.goBack()} />
      )}

      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Title style={{ fontSize: 24 }}>{title}</Title>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            <OutlineButton title={formatTime(when)} onPress={() => setEditingTime(!editingTime)} style={{ minHeight: 36, paddingHorizontal: 14 }} />
            <OutlineButton title={MEAL_LABELS[mealType]} onPress={() => setMealType(MEAL_ORDER[(MEAL_ORDER.indexOf(mealType) + 1) % MEAL_ORDER.length])} style={{ minHeight: 36, paddingHorizontal: 14 }} />
          </View>
        </View>
        <Learn topic="calories" amount={totals.calories} amountLabel="This meal" style={{ alignItems: 'flex-end' }}>
          <Num style={{ fontSize: 34, color: colors.eaten }}>{formatCalories(totals.calories)}</Num>
          <LearnLabel>calories</LearnLabel>
        </Learn>
      </View>

      {editingTime && (
        <Glass>
          <Muted style={{ marginBottom: 8 }}>
            Eaten at {formatTime(when)} on {when.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
          </Muted>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {[
              { label: '−1 hr', minutes: -60 },
              { label: '−15 min', minutes: -15 },
              { label: '+15 min', minutes: 15 },
              { label: '+1 hr', minutes: 60 },
            ].map((step) => (
              <OutlineButton key={step.label} title={step.label} onPress={() => shiftTime(step.minutes)} style={{ flex: 1, minHeight: 40, paddingHorizontal: 4 }} />
            ))}
          </View>
        </Glass>
      )}

      {lines.length === 0 ? (
        <Glass>
          <Body>{photo ? 'No food found in this photo.' : 'Nothing added yet.'}</Body>
          <Muted>{photo ? 'Add the food yourself below, or go back and try a clearer shot.' : 'Add each food below with its calories.'}</Muted>
        </Glass>
      ) : (
        <Glass padding={0} style={{ paddingHorizontal: 14 }}>
          {lines.map((line, index) => (
            <View key={line.id ?? `new-${index}`} style={[{ paddingVertical: 10 }, index > 0 && { borderTopWidth: 1, borderTopColor: colors.hairline }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Pressable style={{ flex: 1 }} onPress={() => setEditing(editing === index ? null : index)} accessibilityRole="button" accessibilityLabel={`Edit ${line.name || 'this food'}`}>
                  <Body>{line.name.trim() || 'New food'}</Body>
                  <Muted style={{ fontSize: 12 }}>
                    {[line.detail, `${Math.round(line.portion * 100)}% portion`, line.confidence === 'low' ? 'not sure about this one' : null].filter(Boolean).join(' · ')}
                  </Muted>
                </Pressable>
                <Num style={{ fontSize: 16 }}>{formatCalories(line.base.calories * line.portion)}</Num>
                <OutlineButton title={editing === index ? 'Done' : 'Edit'} onPress={() => setEditing(editing === index ? null : index)} style={{ minHeight: 32, paddingHorizontal: 12, borderRadius: 16 }} />
                <Pressable onPress={() => removeLine(index)} accessibilityRole="button" accessibilityLabel={`Remove ${line.name || 'this food'}`} hitSlop={10} style={{ padding: 6 }}>
                  <Icon name="close" size={16} color={colors.muted} />
                </Pressable>
              </View>
              <Slider
                minimumValue={0.25}
                maximumValue={3}
                step={0.05}
                value={line.portion}
                onValueChange={(value) => setPortion(index, value)}
                minimumTrackTintColor={colors.eaten}
                maximumTrackTintColor={colors.outline}
                thumbTintColor={colors.text}
              />
              {editing === index && (
                <View style={{ marginTop: 6 }}>
                  <Muted style={{ fontSize: 12 }}>Name</Muted>
                  <TextInput
                    value={line.name}
                    onChangeText={(name) => renameLine(index, name)}
                    placeholder="What was it?"
                    placeholderTextColor={colors.placeholder}
                    autoFocus={line.name === ''}
                    accessibilityLabel="Food name"
                    style={{ height: 44, borderRadius: 10, borderWidth: 1, borderColor: colors.outline, color: colors.text, fontSize: 16, paddingHorizontal: 10, marginTop: 4, marginBottom: 10 }}
                  />
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                    {FIELDS.map((field) => (
                      <NumberField key={field.key} label={field.label} unit={field.unit} max={field.unit === 'mg' ? 20000 : field.unit === 'g' ? 1000 : 5000} value={line.base[field.key] * line.portion} onChange={(amount) => setAmount(index, field.key, amount)} />
                    ))}
                  </View>
                  <Muted style={{ fontSize: 12 }}>Type what you actually ate. Added sugar is the part of the sugar that was put in, not what is naturally in fruit or milk.</Muted>
                </View>
              )}
            </View>
          ))}
        </Glass>
      )}
      <OutlineButton title={lines.length === 0 ? 'Add a food' : 'Add a food the photo missed'} onPress={addLine} />
      {lines.length > 0 && <Muted style={{ fontSize: 12 }}>Drag a slider to change a portion, or tap Edit to correct the name or any number. Tap any nutrient below to learn what it is.</Muted>}

      <Glass>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 12 }}>
          {(
            [
              { key: 'proteinG', label: 'Protein', unit: 'g' },
              { key: 'carbsG', label: 'Carbs', unit: 'g' },
              { key: 'fatG', label: 'Fat', unit: 'g' },
              { key: 'fiberG', label: 'Fiber', unit: 'g' },
              { key: 'sugarG', label: 'Sugar', unit: 'g' },
              { key: 'addedSugarG', label: 'Added sugar', unit: 'g' },
              { key: 'sodiumMg', label: 'Sodium', unit: 'mg' },
              { key: 'saturatedFatG', label: 'Saturated fat', unit: 'g' },
              { key: 'cholesterolMg', label: 'Cholesterol', unit: 'mg' },
            ] as const
          ).map((n) => (
            <Learn key={n.key} topic={n.key} amount={totals[n.key]} amountLabel="This meal" style={{ width: '33.33%' }}>
              <LearnLabel>{n.label}</LearnLabel>
              <Num style={{ fontSize: 17 }}>{`${formatCalories(totals[n.key])} ${n.unit}`}</Num>
            </Learn>
          ))}
        </View>
      </Glass>

      <View style={{ flexDirection: 'row', gap: 12, marginTop: 4 }}>
        <OutlineButton title={isNew ? 'Discard' : 'Delete'} danger onPress={confirmDelete} style={{ minHeight: 52, borderRadius: 26 }} />
        <PrimaryButton title={isNew ? 'Save meal' : 'Save changes'} onPress={save} disabled={saving || lines.length === 0} style={{ flex: 1 }} />
      </View>
    </Screen>
  );
}
