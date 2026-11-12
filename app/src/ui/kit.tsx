import { ReactNode } from 'react';
import { Pressable, ScrollView, StyleProp, StyleSheet, Text, TextStyle, useWindowDimensions, View, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { colors, numberFont } from './theme';

// ── Page ─────────────────────────────────────────────────────────────────────────────────────

// The soft teal and orange glow behind every screen. Glass needs colour behind it to blur,
// otherwise a see-through card on a black page is just a black card.
export function Glow() {
  const { width, height } = useWindowDimensions();
  const w = Math.max(320, width);
  const h = Math.max(600, height);
  const spots = [
    { id: 'a', cx: w * 0.08, cy: -20, r: 340, color: colors.burned, opacity: 0.36 },
    { id: 'b', cx: w * 1.08, cy: 110, r: 320, color: colors.eaten, opacity: 0.28 },
    { id: 'c', cx: -w * 0.1, cy: h * 0.6, r: 300, color: colors.eaten, opacity: 0.16 },
    { id: 'd', cx: w * 1.05, cy: h * 0.8, r: 340, color: colors.burned, opacity: 0.22 },
  ];
  return (
    <Svg width={w} height={h} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        {spots.map((s) => (
          <RadialGradient key={s.id} id={s.id} cx={s.cx} cy={s.cy} r={s.r} gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={s.color} stopOpacity={s.opacity} />
            <Stop offset="1" stopColor={s.color} stopOpacity={0} />
          </RadialGradient>
        ))}
      </Defs>
      {spots.map((s) => (
        <Rect key={s.id} x={0} y={0} width={w} height={h} fill={`url(#${s.id})`} />
      ))}
    </Svg>
  );
}

interface ScreenProps {
  children: ReactNode;
  scroll?: boolean;
  // Leaves room at the bottom for the floating tab bar.
  tabBarSpace?: boolean;
  footer?: ReactNode;
}

export function Screen({ children, scroll = true, tabBarSpace = false, footer }: ScreenProps) {
  const insets = useSafeAreaInsets();
  const padding = { paddingTop: insets.top + 12, paddingBottom: (tabBarSpace ? 108 : 24) + insets.bottom };
  return (
    <View style={styles.page}>
      <Glow />
      {scroll ? (
        <ScrollView contentContainerStyle={[styles.content, padding]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} automaticallyAdjustKeyboardInsets>
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.content, padding, { flex: 1 }]}>{children}</View>
      )}
      {/* Frosts the strip behind the clock and battery, so scrolled content does not run through them. */}
      {scroll && <BlurView intensity={35} tint="dark" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: insets.top }} />}
      {footer}
    </View>
  );
}

// ── Glass ────────────────────────────────────────────────────────────────────────────────────

interface GlassProps {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  radius?: number;
  padding?: number;
  strong?: boolean; // heavier blur for panels that float over content (tab bar, sheets)
  onPress?: () => void;
  label?: string;
}

export function Glass({ children, style, radius = 18, padding = 14, strong, onPress, label }: GlassProps) {
  const inner = (
    <View style={[styles.glass, { borderRadius: radius }, style]}>
      <BlurView intensity={strong ? 60 : 40} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: strong ? 'rgba(20, 24, 36, 0.62)' : colors.glassFill }]} />
      <View style={{ padding }}>{children}</View>
    </View>
  );
  if (!onPress) return inner;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => pressed && { opacity: 0.75 }}>
      {inner}
    </Pressable>
  );
}

// ── Text ─────────────────────────────────────────────────────────────────────────────────────

interface TextProps {
  children: ReactNode;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}
export const Title = ({ children, style }: TextProps) => <Text style={[styles.title, style]}>{children}</Text>;
export const Body = ({ children, style, numberOfLines }: TextProps) => (
  <Text numberOfLines={numberOfLines} style={[styles.body, style]}>
    {children}
  </Text>
);
export const Muted = ({ children, style, numberOfLines }: TextProps) => (
  <Text numberOfLines={numberOfLines} style={[styles.muted, style]}>
    {children}
  </Text>
);
export const Heading = ({ children, style }: TextProps) => <Text style={[styles.heading, style]}>{children}</Text>;
// Numbers use the rounded face so 1,620 reads as a figure, not as text.
// `fit` keeps a figure on one line and lets iOS shrink it rather than wrap it.
export const Num = ({ children, style, fit }: TextProps & { fit?: boolean }) => (
  <Text style={[styles.num, style]} numberOfLines={fit ? 1 : undefined} adjustsFontSizeToFit={fit} minimumFontScale={fit ? 0.6 : undefined}>
    {children}
  </Text>
);

export function Header({ eyebrow, title, right, onBack }: { eyebrow?: string; title: string; right?: ReactNode; onBack?: () => void }) {
  return (
    <View style={styles.header}>
      {onBack && <IconButton icon="back" label="Back" onPress={onBack} />}
      <View style={{ flex: 1 }}>
        {eyebrow ? <Muted>{eyebrow}</Muted> : null}
        <Title style={onBack ? { fontSize: 26 } : undefined}>{title}</Title>
      </View>
      {right}
    </View>
  );
}

// ── Controls ─────────────────────────────────────────────────────────────────────────────────

export function PrimaryButton({ title, onPress, disabled, style }: { title: string; onPress: () => void; disabled?: boolean; style?: StyleProp<ViewStyle> }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [styles.primary, style, (pressed || disabled) && { opacity: 0.6 }]}
    >
      <Text style={styles.primaryText}>{title}</Text>
    </Pressable>
  );
}

export function OutlineButton({ title, onPress, danger, style }: { title: string; onPress: () => void; danger?: boolean; style?: StyleProp<ViewStyle> }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [styles.outline, style, pressed && { opacity: 0.6 }]}>
      <Text style={[styles.body, danger && { color: colors.danger }]}>{title}</Text>
    </Pressable>
  );
}

export function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (value: T) => void }) {
  return (
    <Glass radius={24} padding={4}>
      <View style={{ flexDirection: 'row', gap: 4 }}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              onPress={() => onChange(option.value)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              style={[styles.segment, selected && styles.segmentSelected]}
            >
              <Text style={[styles.segmentText, selected && { color: '#FFFFFF', fontWeight: '600' }]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </Glass>
  );
}

// A tappable line inside a card: name and detail on the left, a figure on the right.
export function Row({ title, detail, value, valueColor, onPress, first, left, chevron }: {
  title: string;
  detail?: string;
  value?: string;
  valueColor?: string;
  onPress?: () => void;
  first?: boolean;
  left?: ReactNode;
  chevron?: boolean;
}) {
  const content = (
    <View style={[styles.row, !first && styles.rowDivider]}>
      {left}
      <View style={{ flex: 1 }}>
        <Body numberOfLines={1}>{title}</Body>
        {detail ? <Muted numberOfLines={2} style={{ fontSize: 12 }}>{detail}</Muted> : null}
      </View>
      {value ? <Num style={{ fontSize: 16, color: valueColor ?? colors.text }}>{value}</Num> : null}
      {(chevron ?? !!onPress) && <Icon name="chevron" size={16} color={colors.muted} />}
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => pressed && { opacity: 0.6 }}>
      {content}
    </Pressable>
  );
}

export function IconButton({ icon, label, onPress, disabled }: { icon: IconName; label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label} hitSlop={6} style={({ pressed }) => [(pressed || disabled) && { opacity: 0.4 }]}>
      <Glass radius={22} padding={0} style={{ width: 44, height: 44 }}>
        <View style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={icon} size={20} color={colors.text} />
        </View>
      </Glass>
    </Pressable>
  );
}

// ── Icons ────────────────────────────────────────────────────────────────────────────────────

const ICON_PATHS = {
  back: 'M15 6l-6 6 6 6',
  forward: 'M9 6l6 6-6 6',
  chevron: 'M9 6l6 6-6 6',
  food: 'M7 3v7a2 2 0 0 0 4 0V3M9 12v9M17 3c-2 2-2 6 0 8v10',
  flame: 'M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-9z',
  history: 'M5 20V10M12 20V4M19 20v-7',
  plus: 'M12 5v14M5 12h14',
  close: 'M6 6l12 12M18 6L6 18',
  check: 'M5 12l5 5 9-10',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 20c1.5-4 4.5-5 8-5s6.5 1 8 5',
  camera: 'M4 8h3l2-3h6l2 3h3v11H4zM12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
  photos: 'M7 5h10a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3zM4 16l4-4 4 4 3-3 5 5',
  glasses: 'M7 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM17 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM10.5 13h3M3.5 12l1-5M20.5 12l-1-5',
  heart: 'M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z',
} as const;
export type IconName = keyof typeof ICON_PATHS | 'today';

export function Icon({ name, size = 24, color = colors.text, strokeWidth = 2 }: { name: IconName; size?: number; color?: string; strokeWidth?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {name === 'today' ? (
        <>
          <Circle cx={12} cy={12} r={8} stroke={color} strokeWidth={strokeWidth} />
          <Circle cx={12} cy={12} r={2.5} stroke={color} strokeWidth={strokeWidth} />
        </>
      ) : (
        <Path d={ICON_PATHS[name]} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      )}
    </Svg>
  );
}

// ── Tab bar ──────────────────────────────────────────────────────────────────────────────────

export type TabName = 'today' | 'food' | 'burned' | 'history';
const TABS: { name: TabName; label: string; icon: IconName }[] = [
  { name: 'today', label: 'Today', icon: 'today' },
  { name: 'food', label: 'Food', icon: 'food' },
  { name: 'burned', label: 'Burned', icon: 'flame' },
  { name: 'history', label: 'History', icon: 'history' },
];

export function TabBar({ current, onChange, onAdd }: { current: TabName; onChange: (tab: TabName) => void; onAdd: () => void }) {
  const insets = useSafeAreaInsets();
  const tab = (t: (typeof TABS)[number]) => {
    const active = t.name === current;
    return (
      <Pressable key={t.name} onPress={() => onChange(t.name)} accessibilityRole="tab" accessibilityState={{ selected: active }} style={styles.tab}>
        <Icon name={t.icon} color={active ? colors.text : colors.muted} />
        <Text style={{ fontSize: 11, color: active ? colors.text : colors.muted }}>{t.label}</Text>
      </Pressable>
    );
  };
  return (
    <View style={[styles.tabBarWrap, { bottom: Math.max(insets.bottom, 12) + 4 }]} pointerEvents="box-none">
      <Glass radius={34} padding={0} strong style={styles.tabBarShadow}>
        <View style={styles.tabBar}>
          {TABS.slice(0, 2).map(tab)}
          <Pressable onPress={onAdd} accessibilityRole="button" accessibilityLabel="Log a meal" style={({ pressed }) => [styles.add, pressed && { opacity: 0.7 }]}>
            <Icon name="plus" color="#0B0F14" strokeWidth={2.5} />
          </Pressable>
          {TABS.slice(2).map(tab)}
        </View>
      </Glass>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.page, overflow: 'hidden' },
  content: { paddingHorizontal: 20, gap: 12, width: '100%', maxWidth: 480, alignSelf: 'center' },
  glass: { overflow: 'hidden', borderWidth: 1, borderColor: colors.glassBorder, borderTopColor: colors.glassEdge },
  title: { fontSize: 30, fontWeight: '600', letterSpacing: -0.5, color: colors.text },
  heading: { fontSize: 15, fontWeight: '600', color: colors.text, marginTop: 2 },
  body: { fontSize: 15, color: colors.text },
  muted: { fontSize: 13, color: colors.muted },
  num: { fontFamily: numberFont, fontWeight: '600', color: colors.text },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  primary: {
    minHeight: 52, borderRadius: 26, overflow: 'hidden', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(150, 240, 230, 0.45)', borderTopColor: 'rgba(190, 255, 245, 0.75)',
    backgroundColor: 'rgba(72, 205, 192, 0.90)', paddingHorizontal: 20,
  },
  primaryText: { fontSize: 17, fontWeight: '600', color: colors.ink },
  outline: { minHeight: 48, borderRadius: 24, borderWidth: 1, borderColor: colors.outline, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  segment: { flex: 1, minHeight: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  segmentSelected: { backgroundColor: colors.selected },
  segmentText: { fontSize: 13, color: colors.muted },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 50, paddingVertical: 6 },
  rowDivider: { borderTopWidth: 1, borderTopColor: colors.hairline },
  tabBarWrap: { position: 'absolute', left: 14, right: 14 },
  tabBarShadow: { shadowColor: '#000', shadowOpacity: 0.38, shadowRadius: 30, shadowOffset: { width: 0, height: 20 } },
  tabBar: { height: 68, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingHorizontal: 10 },
  tab: { width: 60, height: 56, alignItems: 'center', justifyContent: 'center', gap: 3 },
  add: {
    width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#4CCFC2', borderWidth: 1, borderColor: 'rgba(190, 255, 245, 0.55)',
  },
});
