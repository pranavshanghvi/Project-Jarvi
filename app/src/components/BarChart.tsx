import { StyleSheet, Text, View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';

interface Props {
  label: string;
  values: number[]; // one per day, oldest first
  dateLabels: string[]; // e.g. "07-11"
}

const CHART_WIDTH = 320;
const CHART_HEIGHT = 120;
const BAR_GAP = 4;

export default function BarChart({ label, values, dateLabels }: Props) {
  const max = Math.max(...values, 1);
  const barWidth = (CHART_WIDTH - BAR_GAP * (values.length - 1)) / values.length;

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <Svg width={CHART_WIDTH} height={CHART_HEIGHT}>
        {values.map((value, index) => {
          const barHeight = (value / max) * (CHART_HEIGHT - 4);
          const x = index * (barWidth + BAR_GAP);
          const y = CHART_HEIGHT - barHeight;
          return <Rect key={index} x={x} y={y} width={barWidth} height={barHeight} rx={2} fill="#378ADD" />;
        })}
      </Svg>
      <View style={styles.axisRow}>
        <Text style={styles.axisLabel}>{dateLabels[0]}</Text>
        <Text style={styles.axisLabel}>{dateLabels[dateLabels.length - 1]}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 20 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 4 },
  axisRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
  axisLabel: { fontSize: 11, color: '#888' },
});
