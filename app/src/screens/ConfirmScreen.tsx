import { useState } from 'react';
import { Alert, Button, ScrollView, StyleSheet } from 'react-native';
import FoodItemCard from '../components/FoodItemCard';
import { DetectedFoodItem, NutrientProfile } from '../types/nutrition';
import { createEntry } from '../db/entriesRepository';
import { inferMealType } from '../nutrition/mealTagging';

interface Props {
  items: DetectedFoodItem[];
  photoUri: string;
  // When the photo was taken, if known. A glasses photo is often logged hours after the meal,
  // so the meal is filed under when it was eaten rather than when it was confirmed.
  takenAt?: number;
  onSaved: (entryId: number) => void;
}

export default function ConfirmScreen({ items, photoUri, takenAt, onSaved }: Props) {
  const [adjusted, setAdjusted] = useState(
    items.map((item) => ({ item, portionMultiplier: 1, nutrients: item.nutrients }))
  );

  function updateItem(index: number, portionMultiplier: number, nutrients: NutrientProfile) {
    setAdjusted((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], portionMultiplier, nutrients };
      return next;
    });
  }

  function removeItem(index: number) {
    setAdjusted((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleConfirm() {
    try {
      const eatenAt = takenAt ? new Date(takenAt) : new Date();
      const mealType = inferMealType(eatenAt);
      const itemsWithPortions = adjusted.map(({ item, portionMultiplier, nutrients }) => ({
        item: { ...item, nutrients },
        portionMultiplier,
      }));
      const entryId = await createEntry(photoUri, mealType, itemsWithPortions, eatenAt);
      onSaved(entryId);
    } catch {
      Alert.alert('Save failed', 'Could not save this entry. Please try again.');
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {adjusted.map((entry, index) => (
        <FoodItemCard
          key={`${entry.item.name}-${index}`}
          item={entry.item}
          onChange={(portionMultiplier, nutrients) => updateItem(index, portionMultiplier, nutrients)}
        />
      ))}
      <Button title="Remove last item" onPress={() => removeItem(adjusted.length - 1)} disabled={adjusted.length === 0} />
      <Button title="Save" onPress={handleConfirm} disabled={adjusted.length === 0} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
});
