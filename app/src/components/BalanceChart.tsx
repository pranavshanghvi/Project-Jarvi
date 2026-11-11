import { StyleSheet, Text, View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { DayBalance } from '../nutrition/energyBalance';

interface Props {
  rows: DayBalance[]; // oldest first
}

const WIDTH = 320;
const HEIGHT = 130;
export const EATEN_COLOR = '#D85A30';
export const BURNED_COLOR = '#1D9E75';

// Two bars per day, side by side: what was eaten and what was burned.
export default function BalanceChart({ rows }: Props) {
  const max = Math.max(1, ...rows.map((r) => Math.max(r.eaten, r.burned)));
  const slot = WIDTH / rows.length;
  const gap = rows.length > 10 ? 1 : 3;
  const barWidth = Math.max(1, (slot - gap * 3) / 2);

  return (
    <View style={styles.container}>
      <Svg width={WIDTH} height={HEIGHT}>
        {rows.map((row, index) => {
          const x = index * slot + gap;
          const eatenHeight = (row.eaten / max) * (HEIGHT - 4);
          const burnedHeight = (row.burned / max) * (HEIGHT - 4);
          return [
            <Rect key={`e${row.date}`} x={x} y={HEIGHT - eatenHeight} width={barWidth} height={eatenHeight} rx={1} fill={EATEN_COLOR} />,
            <Rect key={`b${row.date}`} x={x + barWidth + gap} y={HEIGHT - burnedHeight} width={barWidth} height={burnedHeight} rx={1} fill={BURNED_COLOR} />,
          ];
        })}
      </Svg>
      <View style={styles.axisRow}>
        <Text style={styles.axisLabel}>{rows[0]?.date.slice(5)}</Text>
        <Text style={styles.axisLabel}>{rows[rows.length - 1]?.date.slice(5)}</Text>
      </View>
      <View style={styles.legendRow}>
        <View style={[styles.swatch, { backgroundColor: EATEN_COLOR }]} />
        <Text style={styles.legend}>Eaten</Text>
        <View style={[styles.swatch, { backgroundColor: BURNED_COLOR }]} />
        <Text style={styles.legend}>Burned</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 8, marginBottom: 16 },
  axisRow: { flexDirection: 'row', justifyContent: 'space-between', width: WIDTH, marginTop: 2 },
  axisLabel: { fontSize: 11, color: '#888' },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  swatch: { width: 10, height: 10, borderRadius: 2 },
  legend: { fontSize: 12, color: '#444', marginRight: 10 },
});
