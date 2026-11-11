import { useEffect, useState } from 'react';
import { Alert, Image, Pressable, View } from 'react-native';
import Slider from '@react-native-community/slider';
import { MEAL_LABELS, resolvePhotoUri } from '../data/dayData';
import { createEntry, deleteEntry, getEntry, updateEntry } from '../db/entriesRepository';
import { markPhotoUsed } from '../glasses/glassesPhotos';
import { inferMealType } from '../nutrition/mealTagging';
import { scaleNutrients } from '../nutrition/portionScaling';
import { ConfidenceLevel, MealType, NutrientProfile, NUTRIENT_KEYS } from '../types/nutrition';
import { Body, Glass, Icon, IconButton, Muted, Num, OutlineButton, PrimaryButton, Screen, Title } from '../ui/kit';
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

export default function MealDetailScreen({ route, navigation }: any) {
  const { entryId, draft } = route.params ?? {};
  const isNew = !entryId;
  const [lines, setLines] = useState<Line[]>([]);
  const [removedIds, setRemovedIds] = useState<number[]>([]);
  const [when, setWhen] = useState<Date>(draft?.takenAt ? new Date(draft.takenAt) : new Date());
  const [mealType, setMealType] = useState<MealType>(inferMealType(draft?.takenAt ? new Date(draft.takenAt) : new Date()));
  const [photo, setPhoto] = useState<string>(draft?.photoUri ?? '');
  const [editingTime, setEditingTime] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (draft) {
      setLines(draft.items.map((item: any) => ({ name: item.name, detail: item.portionDescription, confidence: item.confidence, base: item.nutrients, portion: 1 })));
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
          base: scaleNutrients(item.nutrients, 1 / (item.portionMultiplier || 1)),
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
            item: { name: l.name, confidence: l.confidence, portionDescription: l.detail ?? '', nutrients: scaleNutrients(l.base, l.portion) },
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
          items: lines.filter((l) => l.id).map((l) => ({ id: l.id!, portionMultiplier: l.portion, nutrients: scaleNutrients(l.base, l.portion) })),
          removedItemIds: removedIds,
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

  const title = lines.length === 0 ? 'No food found' : lines.length <= 2 ? lines.map((l) => l.name).join(', ') : `${lines[0].name} +${lines.length - 1}`;

  return (
    <Screen>
      <View style={{ height: 220, borderRadius: 22, overflow: 'hidden', backgroundColor: colors.track }}>
        {photo ? <Image source={{ uri: resolvePhotoUri(photo) }} style={{ width: '100%', height: '100%' }} resizeMode="cover" /> : null}
        <View style={{ position: 'absolute', left: 10, top: 10 }}>
          <IconButton icon="back" label="Back" onPress={() => navigation.goBack()} />
        </View>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Title style={{ fontSize: 24 }}>{title}</Title>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            <OutlineButton title={formatTime(when)} onPress={() => setEditingTime(!editingTime)} style={{ minHeight: 36, paddingHorizontal: 14 }} />
            <OutlineButton title={MEAL_LABELS[mealType]} onPress={() => setMealType(MEAL_ORDER[(MEAL_ORDER.indexOf(mealType) + 1) % MEAL_ORDER.length])} style={{ minHeight: 36, paddingHorizontal: 14 }} />
          </View>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Num style={{ fontSize: 34, color: colors.eaten }}>{formatCalories(totals.calories)}</Num>
          <Muted style={{ fontSize: 12 }}>calories</Muted>
        </View>
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
          <Body>No food found in this photo.</Body>
          <Muted>Go back and try a clearer or closer shot.</Muted>
        </Glass>
      ) : (
        <Glass padding={0} style={{ paddingHorizontal: 14 }}>
          {lines.map((line, index) => (
            <View key={`${line.name}-${index}`} style={[{ paddingVertical: 10 }, index > 0 && { borderTopWidth: 1, borderTopColor: colors.hairline }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Body>{line.name}</Body>
                  <Muted style={{ fontSize: 12 }}>
                    {[line.detail, `${Math.round(line.portion * 100)}% portion`, line.confidence === 'low' ? 'not sure about this one' : null].filter(Boolean).join(' · ')}
                  </Muted>
                </View>
                <Num style={{ fontSize: 16 }}>{formatCalories(line.base.calories * line.portion)}</Num>
                <Pressable onPress={() => removeLine(index)} accessibilityRole="button" accessibilityLabel={`Remove ${line.name}`} hitSlop={10} style={{ padding: 6 }}>
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
            </View>
          ))}
        </Glass>
      )}
      {lines.length > 0 && <Muted style={{ fontSize: 12 }}>Drag a slider if a portion looks wrong. The total updates as you go.</Muted>}

      <Glass>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 12 }}>
          {[
            { label: 'Protein', value: `${Math.round(totals.proteinG)} g` },
            { label: 'Carbs', value: `${Math.round(totals.carbsG)} g` },
            { label: 'Fat', value: `${Math.round(totals.fatG)} g` },
            { label: 'Fiber', value: `${Math.round(totals.fiberG)} g` },
            { label: 'Sugar', value: `${Math.round(totals.sugarG)} g` },
            { label: 'Sodium', value: `${formatCalories(totals.sodiumMg)} mg` },
            { label: 'Saturated fat', value: `${Math.round(totals.saturatedFatG)} g` },
            { label: 'Cholesterol', value: `${Math.round(totals.cholesterolMg)} mg` },
          ].map((n) => (
            <View key={n.label} style={{ width: '33.33%' }}>
              <Muted style={{ fontSize: 12 }}>{n.label}</Muted>
              <Num style={{ fontSize: 17 }}>{n.value}</Num>
            </View>
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
