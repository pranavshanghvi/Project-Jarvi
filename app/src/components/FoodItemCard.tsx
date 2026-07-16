import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import PortionSlider from './PortionSlider';
import { scaleNutrients, applyFineTune } from '../nutrition/portionScaling';
import { DetectedFoodItem, NutrientProfile, NUTRIENT_KEYS } from '../types/nutrition';

interface Props {
  item: DetectedFoodItem;
  onChange: (portionMultiplier: number, adjustedNutrients: NutrientProfile) => void;
}

const NUTRIENT_LABELS: Record<keyof NutrientProfile, string> = {
  calories: 'Calories',
  proteinG: 'Protein (g)',
  carbsG: 'Carbs (g)',
  fatG: 'Fat (g)',
  saturatedFatG: 'Saturated fat (g)',
  fiberG: 'Fiber (g)',
  sugarG: 'Sugar (g)',
  sodiumMg: 'Sodium (mg)',
  cholesterolMg: 'Cholesterol (mg)',
};

export default function FoodItemCard({ item, onChange }: Props) {
  const [portionMultiplier, setPortionMultiplier] = useState(1);
  const [fineTune, setFineTune] = useState<Partial<Record<keyof NutrientProfile, number>>>({});

  function recompute(nextPortion: number, nextFineTune: Partial<Record<keyof NutrientProfile, number>>) {
    const scaled = scaleNutrients(item.nutrients, nextPortion);
    const adjusted = applyFineTune(scaled, nextFineTune);
    onChange(nextPortion, adjusted);
  }

  return (
    <View style={[styles.card, item.confidence === 'low' && styles.lowConfidence]}>
      <Text style={styles.name}>{item.name}</Text>
      {item.confidence === 'low' && <Text style={styles.flag}>Low confidence — double-check this one</Text>}
      <Text style={styles.portionDescription}>{item.portionDescription}</Text>
      <PortionSlider
        label="Portion"
        value={portionMultiplier}
        onChange={(value) => {
          setPortionMultiplier(value);
          recompute(value, fineTune);
        }}
      />
      {NUTRIENT_KEYS.map((key) => (
        <PortionSlider
          key={key}
          label={`Fine-tune ${NUTRIENT_LABELS[key]}`}
          value={fineTune[key] ?? 1}
          onChange={(value) => {
            const nextFineTune = { ...fineTune, [key]: value };
            setFineTune(nextFineTune);
            recompute(portionMultiplier, nextFineTune);
          }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderColor: '#ddd', borderRadius: 12, padding: 12, marginBottom: 12 },
  lowConfidence: { borderColor: '#d9a441', borderWidth: 2 },
  name: { fontSize: 16, fontWeight: '600' },
  flag: { color: '#a06a1a', fontSize: 12, marginTop: 2 },
  portionDescription: { color: '#666', fontSize: 12, marginBottom: 8 },
});
