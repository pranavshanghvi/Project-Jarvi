import Slider from '@react-native-community/slider';
import { StyleSheet, Text, View } from 'react-native';

interface Props {
  label: string;
  value: number; // 0.5 to 2.0
  onChange: (value: number) => void;
}

export default function PortionSlider({ label, value, onChange }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}: {Math.round(value * 100)}%</Text>
      <Slider minimumValue={0.5} maximumValue={2.0} step={0.05} value={value} onValueChange={onChange} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 8 },
  label: { fontSize: 13, marginBottom: 2 },
});
