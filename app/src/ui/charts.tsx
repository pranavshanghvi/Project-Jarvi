import { ReactNode, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Polyline, Rect, Text as SvgText } from 'react-native-svg';
import { ChartStyle, getChartStyle, saveChartStyle } from '../settings/settingsStore';
import { Glass, Muted, Segmented } from './kit';
import { chartWidth, colors, formatCalories, numberFont } from './theme';

export interface Series {
  label: string;
  color: string;
  values: number[];
}
export interface Slice {
  label: string;
  value: number;
  color: string;
}

const CHART_HEIGHT = 170;

function niceMax(series: Series[], floor = 1): number {
  return Math.max(floor, ...series.flatMap((s) => s.values));
}

// Shows at most ~7 axis labels however many points there are, so a 30-day chart stays readable.
function AxisLabels({ labels, width }: { labels: string[]; width: number }) {
  const step = Math.max(1, Math.ceil(labels.length / 7));
  const slot = width / Math.max(1, labels.length);
  return (
    <View style={{ width, height: 16 }}>
      {labels.map((label, i) =>
        i % step === 0 ? (
          <Text key={i} style={{ position: 'absolute', left: i * slot + slot / 2 - 20, width: 40, textAlign: 'center', fontSize: 11, color: colors.muted }}>
            {label}
          </Text>
        ) : null
      )}
    </View>
  );
}

export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 6 }}>
      {items.map((item) => (
        <View key={item.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: item.color }} />
          <Muted style={{ fontSize: 12 }}>{item.label}</Muted>
        </View>
      ))}
    </View>
  );
}

export function BarsChart({ series, labels, width = chartWidth }: { series: Series[]; labels: string[]; width?: number }) {
  const max = niceMax(series);
  const count = Math.max(1, labels.length);
  const slot = width / count;
  const barWidth = Math.max(2, Math.min(12, (slot - 4) / series.length - 1));
  const groupWidth = barWidth * series.length + (series.length - 1);
  return (
    <View>
      <Svg width={width} height={CHART_HEIGHT}>
        <Line x1={0} y1={CHART_HEIGHT - 0.5} x2={width} y2={CHART_HEIGHT - 0.5} stroke={colors.track} />
        {series.map((s, si) =>
          s.values.map((value, i) => {
            const h = Math.max(0, (value / max) * (CHART_HEIGHT - 8));
            if (h < 0.5) return null;
            const x = i * slot + (slot - groupWidth) / 2 + si * (barWidth + 1);
            return <Rect key={`${si}-${i}`} x={x} y={CHART_HEIGHT - 1 - h} width={barWidth} height={h} rx={Math.min(3, barWidth / 2)} fill={s.color} />;
          })
        )}
      </Svg>
      <AxisLabels labels={labels} width={width} />
    </View>
  );
}

// A value of null leaves a gap, so a day with no reading does not draw as zero.
export function LineChart({ series, labels, width = chartWidth, goal, zeroBased = true }: {
  series: { label: string; color: string; values: (number | null)[] }[];
  labels: string[];
  width?: number;
  goal?: { value: number; label: string };
  zeroBased?: boolean;
}) {
  const all = series.flatMap((s) => s.values.filter((v): v is number => v !== null));
  if (goal) all.push(goal.value);
  const hi = all.length ? Math.max(...all) : 1;
  const lo = zeroBased ? 0 : all.length ? Math.min(...all) : 0;
  const pad = zeroBased ? 0 : Math.max(0.5, (hi - lo) * 0.15);
  const top = hi + pad;
  const bottom = zeroBased ? 0 : lo - pad;
  const span = Math.max(0.0001, top - bottom);
  const count = Math.max(1, labels.length);
  const slot = width / count;
  const x = (i: number) => i * slot + slot / 2;
  const y = (v: number) => 8 + (1 - (v - bottom) / span) * (CHART_HEIGHT - 16);
  return (
    <View>
      <Svg width={width} height={CHART_HEIGHT}>
        <Line x1={0} y1={CHART_HEIGHT - 0.5} x2={width} y2={CHART_HEIGHT - 0.5} stroke={colors.track} />
        {goal && (
          <>
            <Line x1={0} y1={y(goal.value)} x2={width} y2={y(goal.value)} stroke={colors.muted} strokeDasharray="4 5" />
            <SvgText x={0} y={y(goal.value) - 5} fill={colors.muted} fontSize={11}>
              {goal.label}
            </SvgText>
          </>
        )}
        {series.map((s) => {
          const points = s.values.map((v, i) => (v === null ? null : { x: x(i), y: y(v) })).filter((p): p is { x: number; y: number } => p !== null);
          if (points.length === 0) return null;
          const last = points[points.length - 1];
          return (
            <G key={s.label}>
              {points.length > 1 && (
                <Polyline points={points.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke={s.color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
              )}
              <Circle cx={last.x} cy={last.y} r={4} fill={s.color} />
            </G>
          );
        })}
      </Svg>
      <AxisLabels labels={labels} width={width} />
    </View>
  );
}

export function PieChart({ slices, centerValue, centerLabel }: { slices: Slice[]; centerValue?: string; centerLabel?: string }) {
  const total = slices.reduce((sum, s) => sum + Math.max(0, s.value), 0);
  const r = 54;
  const circumference = 2 * Math.PI * r;
  let offset = 0;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18, minHeight: CHART_HEIGHT }}>
      <Svg width={160} height={160} viewBox="0 0 160 160">
        <Circle cx={80} cy={80} r={r} fill="none" stroke={colors.track} strokeWidth={26} />
        {total > 0 &&
          slices.map((s) => {
            const length = (Math.max(0, s.value) / total) * circumference;
            const dash = `${Math.max(0, length - 2)} ${circumference}`;
            const node = (
              <Circle key={s.label} cx={80} cy={80} r={r} fill="none" stroke={s.color} strokeWidth={26} strokeDasharray={dash} strokeDashoffset={-offset} transform="rotate(-90 80 80)" />
            );
            offset += length;
            return node;
          })}
        {centerValue ? (
          <SvgText x={80} y={82} textAnchor="middle" fill={colors.text} fontSize={22} fontWeight="600" fontFamily={numberFont}>
            {centerValue}
          </SvgText>
        ) : null}
        {centerLabel ? (
          <SvgText x={80} y={99} textAnchor="middle" fill={colors.muted} fontSize={11}>
            {centerLabel}
          </SvgText>
        ) : null}
      </Svg>
      <View style={{ gap: 12, flex: 1 }}>
        {slices.map((s) => (
          <View key={s.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: s.color }} />
            <Text style={{ fontSize: 14, color: colors.text }}>
              {s.label} <Text style={{ color: colors.muted }}>{total > 0 ? Math.round((s.value / total) * 100) : 0}%</Text>
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// A Sankey-style picture: bands flow from the left column into one middle bar, then out to the
// right column. Band thickness is the amount, so the eye can follow where energy goes.
export function FlowChart({ left, middle, right, width = chartWidth }: {
  left: Slice[];
  middle: { label: string; value: number };
  right: Slice[];
  width?: number;
}) {
  // A source or destination of zero would draw a label with no band attached to it.
  left = left.filter((n) => n.value >= 0.5);
  right = right.filter((n) => n.value >= 0.5);
  const height = CHART_HEIGHT + 10;
  const node = 8;
  const gap = 6;
  const total = Math.max(1, middle.value, left.reduce((s, n) => s + n.value, 0), right.reduce((s, n) => s + n.value, 0));
  const usable = height - 8 - gap * Math.max(left.length, right.length, 1);
  const scale = usable / total;
  const midX = right.length ? width / 2 - node / 2 : width - node;
  const midTop = 4 + (usable - middle.value * scale) / 2 + (gap * Math.max(left.length, right.length, 1)) / 2;

  function column(nodes: Slice[]) {
    const used = nodes.reduce((s, n) => s + n.value * scale, 0) + gap * Math.max(0, nodes.length - 1);
    let y = 4 + (height - 8 - used) / 2;
    return nodes.map((n) => {
      const h = Math.max(1, n.value * scale);
      const box = { ...n, y, h };
      y += h + gap;
      return box;
    });
  }
  const leftBoxes = column(left);
  const rightBoxes = column(right);

  function band(x0: number, y0: number, h0: number, x1: number, y1: number, h1: number) {
    const c = (x0 + x1) / 2;
    return `M${x0},${y0} C${c},${y0} ${c},${y1} ${x1},${y1} L${x1},${y1 + h1} C${c},${y1 + h1} ${c},${y0 + h0} ${x0},${y0 + h0} Z`;
  }

  let inY = midTop + (middle.value * scale - leftBoxes.reduce((s, b) => s + b.h, 0)) / 2;
  let outY = midTop + (middle.value * scale - rightBoxes.reduce((s, b) => s + b.h, 0)) / 2;
  return (
    <Svg width={width} height={height}>
      {leftBoxes.map((b) => {
        const d = band(node, b.y, b.h, midX, inY, b.h);
        inY += b.h;
        return <Path key={`l-${b.label}`} d={d} fill={b.color} fillOpacity={0.34} />;
      })}
      {rightBoxes.map((b) => {
        const d = band(midX + node, outY, b.h, width - node, b.y, b.h);
        outY += b.h;
        return <Path key={`r-${b.label}`} d={d} fill={b.color} fillOpacity={0.34} />;
      })}
      {leftBoxes.map((b) => (
        <G key={`ln-${b.label}`}>
          <Rect x={0} y={b.y} width={node} height={b.h} rx={3} fill={b.color} />
          <SvgText x={node + 8} y={b.y + b.h / 2 + 4} fill={colors.text} fontSize={12}>
            {`${b.label} ${formatCalories(b.value)}`}
          </SvgText>
        </G>
      ))}
      <Rect x={midX} y={midTop} width={node} height={Math.max(1, middle.value * scale)} rx={3} fill={colors.text} />
      {rightBoxes.map((b) => (
        <G key={`rn-${b.label}`}>
          <Rect x={width - node} y={b.y} width={node} height={b.h} rx={3} fill={b.color} />
          <SvgText x={width - node - 8} y={b.y + b.h / 2 + 4} textAnchor="end" fill={colors.text} fontSize={12}>
            {`${b.label} ${formatCalories(b.value)}`}
          </SvgText>
        </G>
      ))}
      {right.length === 0 && (
        <SvgText x={midX - 8} y={midTop + (middle.value * scale) / 2 + 4} textAnchor="end" fill={colors.text} fontSize={12}>
          {`${middle.label} ${formatCalories(middle.value)}`}
        </SvgText>
      )}
    </Svg>
  );
}

// The two rings on Today: outer is burned, inner is eaten, both measured against the same scale
// so a longer orange arc than teal arc means you ate more than you burned.
export function BalanceRing({ eaten, burned, children }: { eaten: number; burned: number; children: ReactNode }) {
  const scale = Math.max(eaten, burned, 1) * 1.12;
  const arc = (r: number, value: number) => {
    const c = 2 * Math.PI * r;
    return `${Math.min(c, (value / scale) * c)} ${c}`;
  };
  return (
    <View style={{ width: 204, height: 204, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={204} height={204} viewBox="0 0 204 204" style={{ position: 'absolute' }}>
        <Circle cx={102} cy={102} r={88} fill="none" stroke={colors.hairline} strokeWidth={14} />
        <Circle cx={102} cy={102} r={68} fill="none" stroke={colors.hairline} strokeWidth={14} />
        {burned > 0 && <Circle cx={102} cy={102} r={88} fill="none" stroke={colors.burned} strokeWidth={14} strokeLinecap="round" strokeDasharray={arc(88, burned)} transform="rotate(-90 102 102)" />}
        {eaten > 0 && <Circle cx={102} cy={102} r={68} fill="none" stroke={colors.eaten} strokeWidth={14} strokeLinecap="round" strokeDasharray={arc(68, eaten)} transform="rotate(-90 102 102)" />}
      </Svg>
      <View style={{ alignItems: 'center', width: 116 }}>{children}</View>
    </View>
  );
}

const STYLE_LABELS: Record<ChartStyle, string> = { bars: 'Bars', line: 'Line', pie: 'Pie', flow: 'Flow' };

// A card whose chart can be redrawn in another style. Each card offers only the styles that make
// sense for its data, and remembers the last one picked (per card) between launches.
export function ChartCard({ cardId, title, styles: offered, render, footer }: {
  cardId: string;
  title?: string;
  styles: ChartStyle[];
  render: (style: ChartStyle) => ReactNode;
  footer?: ReactNode;
}) {
  const [style, setStyle] = useState<ChartStyle>(offered[0]);
  useEffect(() => {
    getChartStyle(cardId, offered[0]).then((saved) => setStyle(offered.includes(saved) ? saved : offered[0]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardId]);
  return (
    <View style={{ gap: 8 }}>
      {offered.length > 1 && (
        <Segmented
          options={offered.map((s) => ({ value: s, label: STYLE_LABELS[s] }))}
          value={style}
          onChange={(next) => {
            setStyle(next);
            saveChartStyle(cardId, next);
          }}
        />
      )}
      <Glass>
        {title ? <Muted style={{ marginBottom: 10 }}>{title}</Muted> : null}
        {render(style)}
        {footer}
      </Glass>
    </View>
  );
}
