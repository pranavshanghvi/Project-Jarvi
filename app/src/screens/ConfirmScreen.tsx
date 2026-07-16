import { useState } from 'react';
import { Button, ScrollView, StyleSheet } from 'react-native';
import FoodItemCard from '../components/FoodItemCard';
import { DetectedFoodItem, NutrientProfile } from '../types/nutrition';

interface Props {
  items: DetectedFoodItem[];
  onConfirm: (result: { item: DetectedFoodItem; portionMultiplier: number }[]) => void;
}

export default function ConfirmScreen({ items, onConfirm }: Props) {
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

  function handleConfirm() {
    onConfirm(
      adjusted.map(({ item, portionMultiplier, nutrients }) => ({
        item: { ...item, nutrients },
        portionMultiplier,
      }))
    );
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
