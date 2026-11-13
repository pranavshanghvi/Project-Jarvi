import { ReactNode, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Image, NativeScrollEvent, NativeSyntheticEvent, Platform, Pressable, ScrollView, StyleProp, StyleSheet, Text, useWindowDimensions, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Polyline, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { Glass, Glow, Icon, IconName, Muted, Num, OutlineButton, PrimaryButton, Row, Title } from '../ui/kit';
import { colors, numberFont } from '../ui/theme';

// The tour, opened from the landing page (WelcomeScreen). It can be skipped at any point and
// replayed any time from the bottom of the Today screen.
//
// Six scenes, pictures first and very few words (redesigned 2026-11-13 after Pranav found the old
// eight-slide version "a lot of words"). Three scenes sit on real photographs; the rest are drawn
// with the app's own building blocks. Every number is a made-up example, and the same day runs
// through all of them: 1,520 consumed, 2,140 burned (412 of it active), so the net is −620.
//
// Wording rules he set: say "consumed", never "eaten"; say "smartphone", not "iPhone"; the logo
// always appears with the word BiteLog beside it; never mention how long a photo takes to read.
//
// Photos are free Pexels photos, cropped and shrunk (see assets/tour/CREDITS.md).

const onPhone = Platform.OS === 'ios';
// Every movement in the tour is timed by the app's own clock rather than handed to the phone's
// animation engine. The engine obeys the simulator's "Slow Animations" switch, which made the
// tour look broken there (2026-11-13); the tour is light enough that the simpler route costs
// nothing, and it behaves the same on a phone, in the simulator and in a browser.
const native = false;

const LOGO = require('../../assets/brand/icon-192.png');
const PHOTO_MOVE = require('../../assets/tour/move.jpg');
const PHOTO_MOVE_SQUARE = require('../../assets/tour/move-sq.jpg');
const PHOTO_FOOD = require('../../assets/tour/food.jpg');
const PHOTO_FOOD_SQUARE = require('../../assets/tour/food-sq.jpg');
const PHOTO_SCALE = require('../../assets/tour/scale.jpg');

// Every scene is drawn on a fixed 362-point-wide board and the whole board is scaled to fit the
// screen, so the labels stay exactly where they belong on each photo at any phone size.
const BOARD = 362;
const PHOTO_HEIGHT = 452;
const SOFT = '#AEB6C2';
// Lettering drawn inside a chart. A browser would otherwise fall back to a serif typeface.
const CHART_FONT = Platform.select({ web: 'system-ui, -apple-system, sans-serif', default: undefined });
const fill = StyleSheet.absoluteFill;

// ── Small moving parts ───────────────────────────────────────────────────────────────────────

// One value per step, each running 0 → 1 after its own delay whenever the scene comes on screen.
// A scene that is not showing rests fully drawn, and so does everything when the person has
// asked their phone to reduce motion.
function useSteps(active: boolean, still: boolean, delays: number[]): Animated.Value[] {
  const values = useRef(delays.map(() => new Animated.Value(1))).current;
  useEffect(() => {
    if (!active || still) {
      values.forEach((v) => v.setValue(1));
      return;
    }
    values.forEach((v) => v.setValue(0));
    const run = Animated.parallel(values.map((v, i) => Animated.timing(v, { toValue: 1, duration: 420, delay: delays[i], easing: Easing.out(Easing.cubic), useNativeDriver: native })));
    run.start();
    return () => run.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, still]);
  return values;
}

function Pop({ step, style, children }: { step: Animated.Value | Animated.AnimatedInterpolation<number>; style?: StyleProp<ViewStyle>; children: ReactNode }) {
  return (
    <Animated.View
      style={[
        style,
        {
          opacity: step,
          transform: [{ translateY: step.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }, { scale: step.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

// A ring that grows and fades, to draw the eye to where the action is in a photo.
function Pulse({ active, still, x, y, size, color = colors.burned, delay = 0 }: { active: boolean; still: boolean; x: number; y: number; size: number; color?: string; delay?: number }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    v.setValue(0);
    if (!active || still) return;
    let loop: Animated.CompositeAnimation | undefined;
    const timer = setTimeout(() => {
      loop = Animated.loop(Animated.timing(v, { toValue: 1, duration: 1900, easing: Easing.out(Easing.quad), useNativeDriver: native }));
      loop.start();
    }, delay);
    return () => {
      clearTimeout(timer);
      loop?.stop();
    };
  }, [active, still, delay, v]);
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute', left: x - size / 2, top: y - size / 2, width: size, height: size, borderRadius: size / 2, borderWidth: 2, borderColor: color,
        opacity: v.interpolate({ inputRange: [0, 0.02, 1], outputRange: [0, 0.8, 0] }),
        transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.7] }) }],
      }}
    />
  );
}

// The animation wrapper adds a phone-only setting that a browser does not understand and warns
// about, so it is dropped before the line is drawn.
const AnimatedPath = Animated.createAnimatedComponent(({ collapsable: _collapsable, ...props }: any) => <Path {...props} />);

// A dotted line whose dots travel along it: "this flows from here to there".
function Flow({ d, active, still }: { d: string; active: boolean; still: boolean }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    v.setValue(0);
    if (!active || still) return;
    const loop = Animated.loop(Animated.timing(v, { toValue: -13, duration: 600, easing: Easing.linear, useNativeDriver: false }));
    loop.start();
    return () => loop.stop();
  }, [active, still, v]);
  return <AnimatedPath d={d} stroke={colors.burned} strokeWidth={5} strokeLinecap="round" strokeDasharray={[0.1, 13]} strokeDashoffset={v} fill="none" />;
}

// ── Shared pieces ────────────────────────────────────────────────────────────────────────────

// The logo never appears by itself: a first-time visitor cannot know what it stands for.
function Brand({ size = 20, fontSize = 14 }: { size?: number; fontSize?: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Image source={LOGO} accessibilityIgnoresInvertColors style={{ width: size, height: size, borderRadius: size * 0.24 }} />
      <Text style={{ fontSize, fontWeight: '700', color: colors.text }}>BiteLog</Text>
    </View>
  );
}

// The same, set inside a sentence.
function BrandInline({ size = 18 }: { size?: number }) {
  return (
    <>
      <Image source={LOGO} accessibilityIgnoresInvertColors style={{ width: size, height: size, borderRadius: size * 0.24 }} />
      <Text style={{ fontWeight: '700', color: colors.text }}> BiteLog</Text>
    </>
  );
}

// Darkens the top and bottom of a photo so the labels laid over it stay readable.
function Scrim({ id, top, bottom }: { id: string; top: number; bottom: number }) {
  return (
    <Svg width={BOARD} height={PHOTO_HEIGHT} style={fill} pointerEvents="none">
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={colors.page} stopOpacity={top} />
          <Stop offset="0.4" stopColor={colors.page} stopOpacity={0.04} />
          <Stop offset="1" stopColor={colors.page} stopOpacity={bottom} />
        </LinearGradient>
      </Defs>
      <Rect x={0} y={0} width={BOARD} height={PHOTO_HEIGHT} fill={`url(#${id})`} />
    </Svg>
  );
}

function Photo({ source, label, children }: { source: number; label: string; children: ReactNode }) {
  return (
    <View style={{ width: BOARD, height: PHOTO_HEIGHT, borderRadius: 28, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.14)', backgroundColor: '#10141C' }}>
      <Image source={source} accessibilityLabel={label} resizeMode="cover" style={{ position: 'absolute', left: 0, top: 0, width: BOARD, height: PHOTO_HEIGHT }} />
      {children}
    </View>
  );
}

// A small dark label that sits straight on a photo.
function Tag({ children, color = colors.text }: { children: ReactNode; color?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 28, paddingHorizontal: 11, borderRadius: 14, backgroundColor: 'rgba(7, 8, 15, 0.74)', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.2)' }}>
      {typeof children === 'string' ? <Text style={{ fontSize: 12, fontWeight: '600', color }}>{children}</Text> : children}
    </View>
  );
}

function Dot({ color, size = 9 }: { color: string; size?: number }) {
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />;
}

function Glyph({ d, size = 22, color = colors.text, strokeWidth = 2, filled }: { d: string; size?: number; color?: string; strokeWidth?: number; filled?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d={d} stroke={filled ? 'none' : color} fill={filled ? color : 'none'} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

const PHONE = 'M9.5 2h5a3 3 0 0 1 3 3v14a3 3 0 0 1-3 3h-5a3 3 0 0 1-3-3V5a3 3 0 0 1 3-3zM10.5 5h3';
const WATCH = 'M9.5 6h5a3.5 3.5 0 0 1 3.5 3.5v5a3.5 3.5 0 0 1-3.5 3.5h-5A3.5 3.5 0 0 1 6 14.5v-5A3.5 3.5 0 0 1 9.5 6zM9 6V2h6v4M9 18v4h6v-4';
// Photos from smart glasses reach the app through the phone's photo library, which a website
// cannot open, so the web version of the tour does not mention them.
const GLASSES_WORK = onPhone;
const SPARKLE = 'M12 2l2.6 6.4L21 11l-6.4 2.6L12 20l-2.6-6.4L3 11l6.4-2.6z';
const LABEL = 'M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM8 7h8M8 11h8M8 15h5';

interface SceneProps {
  active: boolean;
  still: boolean;
}

// ── Scene 1: move ────────────────────────────────────────────────────────────────────────────

// The top of the app's own Burned screen, built from the same parts and shrunk to sit on the photo.
function BurnedPreview({ width }: { width: number }) {
  const inner = 362;
  const height = 250;
  const scale = width / inner;
  return (
    <View style={{ width, borderRadius: 22, overflow: 'hidden', backgroundColor: '#0B0E16', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.34)' }} accessible accessibilityLabel="The Burned screen in BiteLog: 2,140 calories so far today, 412 active and 1,728 resting">
      <View style={{ height: 36, paddingHorizontal: 12, justifyContent: 'center', borderBottomWidth: 1, borderBottomColor: 'rgba(255, 255, 255, 0.1)' }}>
        <Brand size={20} fontSize={14} />
      </View>
      <View style={{ width, height: height * scale }}>
        <View style={{ position: 'absolute', left: 0, top: 0, width: inner, height, padding: 12, gap: 8, transformOrigin: 'top left', transform: [{ scale }] }}>
          <Title style={{ fontSize: 28 }}>Burned</Title>
          <Glass>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
              <Num style={{ fontSize: 40, color: colors.burned }}>2,140</Num>
              <Muted style={{ fontSize: 14 }}>calories so far today</Muted>
            </View>
            <View style={{ flexDirection: 'row', gap: 3, height: 10, marginTop: 14, marginBottom: 6 }}>
              <View style={{ width: '19%', borderRadius: 5, backgroundColor: colors.burned }} />
              <View style={{ flex: 1, borderRadius: 5, backgroundColor: colors.burnedDeep }} />
            </View>
            <Row first title="Active" detail="Workouts and moving around" value="412" chevron={false} left={<Dot color={colors.burned} size={10} />} />
            <Row title="Resting" detail="What your body uses just staying alive" value="1,728" chevron={false} left={<Dot color={colors.burnedDeep} size={10} />} />
          </Glass>
        </View>
      </View>
    </View>
  );
}

function MoveScene({ active, still }: SceneProps) {
  const [phone, watch, app] = useSteps(active, still, [250, 700, 1150]);
  return (
    <Photo source={PHOTO_MOVE} label="A runner at sunrise, between palm trees">
      <Scrim id="tourMove" top={0.42} bottom={0.3} />
      <Pulse active={active} still={still} x={164} y={272} size={112} />
      <Pulse active={active} still={still} x={164} y={272} size={112} delay={950} />
      <Svg width={BOARD} height={PHOTO_HEIGHT} style={fill} pointerEvents="none">
        <Flow d="M196,236 C222,200 246,160 258,114" active={active} still={still} />
        <Flow d="M306,114 L306,262" active={active} still={still} />
      </Svg>
      <Pop step={phone} style={{ position: 'absolute', right: 14, top: 56, width: 178 }}>
        <Glass radius={16} padding={0}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 10, paddingHorizontal: 12 }}>
            <Glyph d={PHONE} />
            <View>
              <Text style={styles.chipTitle}>Smartphone</Text>
              <Text style={styles.chipDetail}>counts as you move</Text>
            </View>
          </View>
        </Glass>
      </Pop>
      <Pop step={watch} style={{ position: 'absolute', left: 14, bottom: 14 }}>
        <Tag>
          <Glyph d={WATCH} size={14} strokeWidth={2.2} />
          <Text style={{ fontSize: 12, fontWeight: '600', color: colors.text }}>Watch optional</Text>
        </Tag>
      </Pop>
      <Pop step={app} style={{ position: 'absolute', right: 14, bottom: 14 }}>
        <BurnedPreview width={190} />
      </Pop>
    </Photo>
  );
}

// ── Scene 2: eat ─────────────────────────────────────────────────────────────────────────────

const FOODS = [
  { name: 'Omelette', calories: '190', color: '#F2C230', top: 36, line: 'M182,53 L146,222', x: 146, y: 222 },
  { name: 'Shrimp', calories: '90', color: '#F0A58F', top: 78, line: 'M182,95 L170,230', x: 170, y: 230 },
  { name: 'Greens, pesto', calories: '75', color: '#6FAE5A', top: 120, line: 'M200,154 L204,214', x: 204, y: 214 },
];

function EatScene({ active, still }: SceneProps) {
  // The whole scene runs off ONE clock, 0 → 1, so its steps can never fall out of order: a teal
  // band sweeps down the photo twice while the label says "AI is reading", the label changes to
  // "3 foods found", the foods appear one by one, and the meal lands in the log. At rest the
  // clock sits at 1, with everything showing and the band gone.
  const clock = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!active || still) {
      clock.setValue(1);
      return;
    }
    clock.setValue(0);
    const run = Animated.timing(clock, { toValue: 1, duration: 4200, easing: Easing.linear, useNativeDriver: native });
    run.start();
    return () => run.stop();
  }, [active, still, clock]);

  // A piece that fades in between two points on the clock.
  const between = (from: number, to: number) => clock.interpolate({ inputRange: [from, to], outputRange: [0, 1], extrapolate: 'clamp' });
  const reading = clock.interpolate({ inputRange: [0.56, 0.6], outputRange: [1, 0], extrapolate: 'clamp' });
  const found = between(0.56, 0.6);
  const foods = FOODS.map((_, i) => between(0.6 + i * 0.09, 0.69 + i * 0.09));
  const logged = between(0.88, 0.96);
  const glasses = between(0.94, 1);
  const label = { fontSize: 12, fontWeight: '600' as const, color: colors.burned };

  return (
    <Photo source={PHOTO_FOOD} label="Two hands holding a phone, taking a photo of a plate of food">
      <Scrim id="tourEat" top={0.34} bottom={0.5} />
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute', left: 0, right: 0, top: 0, height: 64, borderBottomWidth: 3, borderBottomColor: colors.burned, backgroundColor: 'rgba(47, 184, 172, 0.2)',
          opacity: clock.interpolate({ inputRange: [0, 0.55, 0.57], outputRange: [1, 1, 0], extrapolate: 'clamp' }),
          transform: [{ translateY: clock.interpolate({ inputRange: [0, 0.285, 0.2851, 0.57], outputRange: [-64, PHOTO_HEIGHT, -64, PHOTO_HEIGHT], extrapolate: 'clamp' }) }],
        }}
      />
      {FOODS.map((food, i) => (
        <Animated.View key={food.name} pointerEvents="none" style={[fill, { opacity: foods[i] }]}>
          <Svg width={BOARD} height={PHOTO_HEIGHT}>
            <Path d={food.line} stroke="rgba(255, 255, 255, 0.75)" strokeWidth={1.5} fill="none" />
            <Circle cx={food.x} cy={food.y} r={4} fill="#FFFFFF" />
          </Svg>
        </Animated.View>
      ))}
      <View style={{ position: 'absolute', left: 14, top: 16 }}>
        <Tag>
          <Glyph d={SPARKLE} size={14} color={colors.burned} filled />
          <View>
            <Animated.Text style={[label, { opacity: reading }]}>AI is reading…</Animated.Text>
            <Animated.Text style={[label, { position: 'absolute', left: 0, top: 0, opacity: found }]}>3 foods found</Animated.Text>
          </View>
        </Tag>
      </View>
      {FOODS.map((food, i) => (
        <Pop key={food.name} step={foods[i]} style={{ position: 'absolute', right: 14, top: food.top, width: 170 }}>
          <Glass radius={17} padding={0}>
            <View style={{ height: 32, flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 11, paddingRight: 13 }}>
              <Dot color={food.color} />
              <Text numberOfLines={1} style={{ flex: 1, fontSize: 13, fontWeight: '600', color: colors.text }}>{food.name}</Text>
              <Num style={{ fontSize: 13.5, fontWeight: '700', color: colors.eaten }}>{food.calories}</Num>
            </View>
          </Glass>
        </Pop>
      ))}
      {GLASSES_WORK && (
        <Pop step={glasses} style={{ position: 'absolute', left: 14, bottom: 94 }}>
          <Tag>
            <Icon name="glasses" size={16} color={colors.text} />
            <Text style={{ fontSize: 12, fontWeight: '600', color: colors.text }}>Smart glasses work too</Text>
          </Tag>
        </Pop>
      )}
      <Pop step={logged} style={{ position: 'absolute', left: 14, right: 14, bottom: 14 }}>
        <Glass radius={22} padding={0}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14 }}>
            <Image source={LOGO} accessibilityIgnoresInvertColors style={{ width: 34, height: 34, borderRadius: 8 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.chipDetail}>
                Lunch, logged in <Text style={{ fontWeight: '700', color: colors.text }}>BiteLog</Text>
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                <Num style={{ fontSize: 28, fontWeight: '700', color: colors.eaten }}>355</Num>
                <Text style={styles.caption}>calories consumed</Text>
              </View>
            </View>
            <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: colors.burned, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="check" size={16} color={colors.ink} strokeWidth={3.2} />
            </View>
          </View>
        </Glass>
      </Pop>
    </Photo>
  );
}

// ── Scene 3: the number ──────────────────────────────────────────────────────────────────────

function SumTile({ source, label, name, value, color }: { source: number; label: string; name: string; value: string; color: string }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <Image source={source} accessibilityLabel={label} style={{ width: 148, height: 148, borderRadius: 26, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.16)' }} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 }}>
        <Dot color={color} />
        <Text style={{ fontSize: 13.5, fontWeight: '600', color: colors.text }}>{name}</Text>
      </View>
      <Num style={{ fontSize: 30, lineHeight: 34, fontWeight: '700', color }}>{value}</Num>
    </View>
  );
}

function NumberScene({ active, still }: SceneProps) {
  const [consumed, burned, net] = useSteps(active, still, [250, 700, 1150]);
  // The two rings of the Today screen: outer is burned, inner is consumed, on one shared scale.
  const outer = 2 * Math.PI * 56;
  const inner = 2 * Math.PI * 39;
  const full = 2140 * 1.12;
  return (
    <View style={{ width: BOARD, alignItems: 'center', gap: 8, paddingVertical: 6 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 10 }}>
        <Pop step={consumed}>
          <SumTile source={PHOTO_FOOD_SQUARE} label="The plate of food" name="Consumed" value="1,520" color={colors.eaten} />
        </Pop>
        <Pop step={burned} style={{ width: 22, marginTop: 52 }}>
          <Text style={styles.sign}>−</Text>
        </Pop>
        <Pop step={burned}>
          <SumTile source={PHOTO_MOVE_SQUARE} label="The runner at sunrise" name="Burned" value="2,140" color={colors.burned} />
        </Pop>
      </View>
      <Pop step={net}>
        <Text style={[styles.sign, { color: colors.muted }]}>=</Text>
      </Pop>
      <Pop step={net} style={{ width: BOARD }}>
        <Glass radius={26} padding={0}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 12, paddingHorizontal: 16 }}>
            <Svg width={136} height={136} viewBox="0 0 136 136" accessibilityLabel="Today's ring: 620 more burned than consumed">
              <Circle cx={68} cy={68} r={56} fill="none" stroke={colors.track} strokeWidth={12} />
              <Circle cx={68} cy={68} r={39} fill="none" stroke={colors.track} strokeWidth={12} />
              <Circle cx={68} cy={68} r={56} fill="none" stroke={colors.burned} strokeWidth={12} strokeLinecap="round" strokeDasharray={[(outer * 2140) / full, outer]} transform="rotate(-90 68 68)" />
              <Circle cx={68} cy={68} r={39} fill="none" stroke={colors.eaten} strokeWidth={12} strokeLinecap="round" strokeDasharray={[(inner * 1520) / full, inner]} transform="rotate(-90 68 68)" />
              <SvgText x={68} y={75} fontSize={21} fontWeight="700" fontFamily={numberFont ?? CHART_FONT} fill={colors.text} textAnchor="middle">
                −620
              </SvgText>
            </Svg>
            <View style={{ flex: 1 }}>
              <Text style={styles.chipDetail}>Net for the day</Text>
              <Text style={{ marginTop: 4, fontSize: 19, lineHeight: 25, fontWeight: '600', color: SOFT }}>
                <Text style={{ fontFamily: numberFont, fontSize: 24, fontWeight: '700', color: colors.burned }}>620</Text> more burned than consumed
              </Text>
            </View>
          </View>
        </Glass>
      </Pop>
    </View>
  );
}

// ── Scene 4: why it matters ──────────────────────────────────────────────────────────────────

const OUTCOMES = [
  { sign: '<', text: 'Weight goes down', color: colors.burned, arrow: 'M12 4v16M5 13l7 7 7-7' },
  { sign: '=', text: 'Weight holds', color: colors.text, arrow: 'M5 9h14M5 15h14' },
  { sign: '>', text: 'Weight goes up', color: colors.eaten, arrow: 'M12 20V4M5 11l7-7 7 7' },
];

function WhyScene({ active, still }: SceneProps) {
  const [fact] = useSteps(active, still, [700]);
  const [turn, setTurn] = useState(0);
  // The three outcomes take turns. With motion reduced, the first one simply stays.
  useEffect(() => {
    setTurn(0);
    if (!active || still) return;
    const timer = setInterval(() => setTurn((t) => (t + 1) % OUTCOMES.length), 2400);
    return () => clearInterval(timer);
  }, [active, still]);
  const outcome = OUTCOMES[turn];
  return (
    <Photo source={PHOTO_SCALE} label="Feet in grey socks standing on a bathroom scale">
      <Scrim id="tourWhy" top={0.5} bottom={0.35} />
      <Pulse active={active} still={still} x={259} y={285} size={70} color="rgba(255, 255, 255, 0.8)" />
      <View style={{ position: 'absolute', left: 14, right: 14, top: 14 }}>
        <Glass radius={22} padding={0}>
          <View style={{ height: 94, paddingTop: 13, paddingHorizontal: 16, gap: 6 }} accessible accessibilityLabel="Burn more than you consume and your weight goes down. Match them and it holds. Consume more and it goes up.">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Dot color={colors.eaten} />
              <Text style={styles.compare}>Consumed</Text>
              <Text style={{ fontFamily: numberFont, fontSize: 19, fontWeight: '700', color: colors.text, marginHorizontal: 5 }}>{outcome.sign}</Text>
              <Dot color={colors.burned} />
              <Text style={styles.compare}>Burned</Text>
              <View style={{ flex: 1 }} />
              {OUTCOMES.map((o, i) => (
                <View key={o.text} style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: i === turn ? colors.text : colors.outline }} />
              ))}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Glyph d={outcome.arrow} size={20} color={outcome.color} strokeWidth={3} />
              <Text style={{ fontSize: 22, lineHeight: 26, fontWeight: '700', letterSpacing: -0.3, color: outcome.color }}>{outcome.text}</Text>
            </View>
          </View>
        </Glass>
      </View>
      <Pop step={fact} style={{ position: 'absolute', left: 14, right: 14, bottom: 14 }}>
        <Glass radius={22} padding={0}>
          <Text style={{ paddingVertical: 13, paddingHorizontal: 10, textAlign: 'center', fontSize: 14, color: SOFT }}>
            <Text style={styles.strong}>500 under</Text> each day <Text style={{ fontFamily: numberFont, fontSize: 18, fontWeight: '700', color: colors.burned }}> ≈ </Text> <Text style={styles.strong}>1 lb down</Text> a week
          </Text>
        </Glass>
      </Pop>
    </Photo>
  );
}

// ── Scene 5: over time ───────────────────────────────────────────────────────────────────────

const WEEK = [
  { day: 'T', consumed: 1900, burned: 2200 },
  { day: 'F', consumed: 2050, burned: 2350 },
  { day: 'S', consumed: 2300, burned: 2100 },
  { day: 'S', consumed: 1800, burned: 2500 },
  { day: 'M', consumed: 1750, burned: 2250 },
  { day: 'T', consumed: 1880, burned: 2150 },
  { day: 'W', consumed: 1520, burned: 2140 },
];

// One round-topped bar, 13 wide, standing on the chart's baseline. 2,500 calories is full height.
function bar(x: number, calories: number): string {
  const height = (calories / 2500) * 124;
  return `M${x},176 v${-(height - 5)} a5,5 0 0 1 5,-5 h3 a5,5 0 0 1 5,5 v${height - 5} z`;
}

function WeeksScene({ active, still }: SceneProps) {
  const [bars, ticks, weight, goal] = useSteps(active, still, [200, 900, 1500, 2100]);
  const chart = { width: 334, height: 380 };
  const layer = (step: Animated.Value, children: ReactNode) => (
    <Animated.View pointerEvents="none" style={[fill, { opacity: step }]}>
      <Svg width={chart.width} height={chart.height}>{children}</Svg>
    </Animated.View>
  );
  return (
    <Glass radius={28} padding={0} style={{ width: BOARD }}>
      <View style={{ paddingVertical: 12, paddingHorizontal: 14 }} accessible accessibilityLabel="A week of consumed against burned, with a tick on the days the goal was met, and weight falling from 188 toward a goal of 175.">
        <View style={chart}>
          <Svg width={chart.width} height={chart.height}>
            <Circle cx={30} cy={22} r={5} fill={colors.eaten} />
            <SvgText fontFamily={CHART_FONT} x={40} y={26} fontSize={11} fill={colors.muted}>Consumed</SvgText>
            <Circle cx={108} cy={22} r={5} fill={colors.burned} />
            <SvgText fontFamily={CHART_FONT} x={118} y={26} fontSize={11} fill={colors.muted}>Burned</SvgText>
            <Circle cx={178} cy={22} r={7} fill={colors.burned} />
            <Path d="M174.5,22.5 l2.6,2.6 l4.4,-5.2" stroke={colors.ink} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            <SvgText fontFamily={CHART_FONT} x={190} y={26} fontSize={11} fill={colors.muted}>Goal met that day</SvgText>
            <Line x1={22} y1={177} x2={318} y2={177} stroke="rgba(255, 255, 255, 0.14)" strokeWidth={1.5} />
            {WEEK.map((d, i) => (
              <SvgText fontFamily={CHART_FONT} key={i} x={26 + i * 41 + 19.5} y={192} fontSize={10} fill={colors.muted} textAnchor="middle">{d.day}</SvgText>
            ))}
            <Line x1={22} y1={232} x2={318} y2={232} stroke={colors.hairline} strokeWidth={1} />
            <SvgText fontFamily={CHART_FONT} x={26} y={256} fontSize={11} fill={colors.muted}>Your weight</SvgText>
            <SvgText fontFamily={CHART_FONT} x={26} y={290} fontSize={10} fill={colors.muted}>188</SvgText>
            <Line x1={26} y1={346} x2={318} y2={346} stroke={colors.burned} strokeWidth={1.5} strokeDasharray={[4, 5]} />
          </Svg>
          {layer(
            bars,
            <>
              {WEEK.map((d, i) => (
                <Path key={`c${i}`} d={bar(26 + i * 41 + 5, d.consumed)} fill={colors.eaten} />
              ))}
              {WEEK.map((d, i) => (
                <Path key={`b${i}`} d={bar(26 + i * 41 + 21, d.burned)} fill={colors.burned} />
              ))}
            </>
          )}
          {layer(
            ticks,
            WEEK.map((d, i) => {
              if (d.burned - d.consumed < 500) return null;
              const x = 26 + i * 41;
              return (
                <Path key={i} d={`M${x + 11.5},208 a8,8 0 1 0 16,0 a8,8 0 1 0 -16,0 M${x + 15.5},208.5 l3,3 l5,-6`} fill={colors.burned} stroke={colors.ink} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
              );
            })
          )}
          {layer(
            weight,
            <>
              <Polyline points="54,272 84,276 114,280 144,278 174,286 204,290 234,296 264,301" fill="none" stroke={colors.text} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
              <Circle cx={264} cy={301} r={6} fill={colors.text} />
              <SvgText fontFamily={CHART_FONT} x={264} y={286} fontSize={12} fontWeight="700" fill={colors.text} textAnchor="middle">182.4 now</SvgText>
            </>
          )}
          {layer(
            goal,
            <>
              <Path d="M264,301 L314,344" stroke="rgba(255, 255, 255, 0.3)" strokeWidth={2} strokeDasharray={[2, 6]} strokeLinecap="round" />
              <SvgText fontFamily={CHART_FONT} x={318} y={364} fontSize={11} fontWeight="600" fill={colors.burned} textAnchor="end">Goal 175</SvgText>
            </>
          )}
        </View>
      </View>
    </Glass>
  );
}

// ── Scene 6: start ───────────────────────────────────────────────────────────────────────────

function StartTile({ icon, glyph, title, detail, accent }: { icon?: IconName; glyph?: string; title: string; detail: string; accent?: boolean }) {
  const ink = accent ? '#0B0F14' : colors.text;
  return (
    <View style={{ width: 92, alignItems: 'center' }}>
      <View style={{ width: 72, height: 72, borderRadius: 22, marginBottom: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.2)', backgroundColor: accent ? colors.eaten : 'rgba(28, 34, 48, 0.82)' }}>
        {icon ? <Icon name={icon} size={30} color={ink} strokeWidth={1.9} /> : <Glyph d={glyph!} size={30} color={ink} strokeWidth={1.9} />}
      </View>
      <Text style={{ fontSize: 13.5, fontWeight: '700', color: colors.text }}>{title}</Text>
      <Text style={{ fontSize: 11.5, color: colors.muted }}>{detail}</Text>
    </View>
  );
}

function StartScene({ active, still }: SceneProps) {
  const [photo, label, voice] = useSteps(active, still, [250, 550, 850]);
  return (
    <View style={{ width: BOARD, alignItems: 'center', gap: 34, paddingTop: 30, paddingBottom: 10 }}>
      <View style={{ width: 104, height: 104 }}>
        <Pulse active={active} still={still} x={52} y={52} size={104} color="#4CCFC2" />
        <Pulse active={active} still={still} x={52} y={52} size={104} color="#4CCFC2" delay={950} />
        <View style={{ width: 104, height: 104, borderRadius: 52, alignItems: 'center', justifyContent: 'center', backgroundColor: '#4CCFC2', borderWidth: 1.5, borderColor: 'rgba(190, 255, 245, 0.6)' }} accessible accessibilityLabel="The round plus button, which is on every screen">
          <Icon name="plus" size={44} color="#0B0F14" strokeWidth={2.6} />
        </View>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 22 }}>
        <Pop step={photo}>
          <StartTile icon="camera" title="One photo" detail="is enough" accent />
        </Pop>
        <Pop step={label}>
          <StartTile glyph={LABEL} title="The label" detail="optional" />
        </Pop>
        <Pop step={voice}>
          <StartTile icon="mic" title="Your voice" detail="optional" />
        </Pop>
      </View>
    </View>
  );
}

// ── The six scenes ───────────────────────────────────────────────────────────────────────────

interface Scene {
  key: string;
  eyebrow: string;
  title: string;
  line: ReactNode;
  small?: ReactNode;
  picture: (props: SceneProps) => ReactNode;
}

const SCENES: Scene[] = [
  {
    key: 'move',
    eyebrow: 'Move',
    title: 'Every move is counted',
    // A website is not allowed to read the phone's health data, so the web version must not
    // promise that the burn arrives by itself.
    line: onPhone ? (
      <>
        <BrandInline /> picks up the burn from your smartphone by itself.
      </>
    ) : (
      <>
        Send the burn to <BrandInline /> with one tap on your smartphone, or type it in.
      </>
    ),
    picture: (props) => <MoveScene {...props} />,
  },
  { key: 'eat', eyebrow: 'Eat', title: 'Snap your plate', line: 'AI names each food and counts the calories.', picture: (props) => <EatScene {...props} /> },
  { key: 'number', eyebrow: 'The number', title: 'Consumed minus burned', line: 'One number shows how the day went.', picture: (props) => <NumberScene {...props} /> },
  { key: 'why', eyebrow: 'Why it matters', title: 'The gap moves your weight', line: 'Burn more than you consume and it comes down.', picture: (props) => <WhyScene {...props} /> },
  { key: 'weeks', eyebrow: 'Over time', title: 'Weeks add up', line: 'Every day you log, set against your goal.', picture: (props) => <WeeksScene {...props} /> },
  {
    key: 'start',
    eyebrow: 'Ready',
    title: 'Start with one photo',
    line: 'Add the label or your voice for a closer number.',
    small: (
      <>
        Your log stays on this {onPhone ? 'phone' : 'browser'}, with no account. A photo, or what you say or type, is read by an AI service and not kept by <BrandInline size={14} />. Numbers are estimates, not medical advice.
      </>
    ),
    picture: (props) => <StartScene {...props} />,
  },
];

export const TUTORIAL_SLIDE_COUNT = SCENES.length;

export default function TutorialScreen({ route, navigation }: any) {
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const width = Math.max(320, Math.min(windowWidth, 480));
  const [index, setIndex] = useState(0);
  const [still, setStill] = useState(false);
  const pager = useRef<ScrollView>(null);
  // The scene a Next or Back tap is sliding towards. While the slide is under way the scenes it
  // passes must not count as "showing", or their pictures would restart as they leave.
  const heading = useRef<number | null>(null);
  const last = index === SCENES.length - 1;

  // The board is scaled to the width of the screen, but never so tall that the words and the
  // buttons under it are pushed off a short screen.
  const room = windowHeight - insets.top - insets.bottom - 8 - 44 - 84 - 190;
  const scale = Math.max(0.62, Math.min((width - 28) / BOARD, room / PHOTO_HEIGHT, 1.2));

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setStill).catch(() => undefined);
    const watcher = AccessibilityInfo.addEventListener('reduceMotionChanged', setStill);
    return () => watcher.remove();
  }, []);

  function go(to: number) {
    const next = Math.max(0, Math.min(SCENES.length - 1, to));
    heading.current = next;
    pager.current?.scrollTo({ x: next * width, animated: true });
    setIndex(next);
  }

  // Leaving the tour: a brand-new person goes on to the short profile questions, anyone replaying
  // it just goes back to where they were.
  function finish() {
    if (route.params?.thenOnboard) navigation.replace('Profile', { onboarding: true });
    else navigation.goBack();
  }

  function onScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const page = Math.round(event.nativeEvent.contentOffset.x / width);
    if (heading.current !== null) {
      if (page === heading.current) heading.current = null;
      return;
    }
    if (page !== index && page >= 0 && page < SCENES.length) setIndex(page);
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.page, alignItems: 'center', overflow: 'hidden' }}>
      <Glow />
      <View style={{ flex: 1, width, paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, height: 44 }}>
          <View style={{ flexDirection: 'row', gap: 6 }} accessibilityLabel={`Step ${index + 1} of ${SCENES.length}`}>
            {SCENES.map((scene, i) => (
              <View key={scene.key} style={{ width: i === index ? 18 : 6, height: 6, borderRadius: 3, backgroundColor: i === index ? colors.text : colors.outline }} />
            ))}
          </View>
          <Pressable onPress={finish} accessibilityRole="button" hitSlop={12}>
            <Muted style={{ fontSize: 15 }}>{last ? '' : 'Skip'}</Muted>
          </Pressable>
        </View>

        <ScrollView
          ref={pager}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={onScroll}
          onScrollBeginDrag={() => (heading.current = null)}
          onMomentumScrollEnd={() => (heading.current = null)}
          scrollEventThrottle={32}
          style={{ flex: 1 }}
        >
          {SCENES.map((scene, i) => (
            <ScrollView key={scene.key} style={{ width }} contentContainerStyle={{ paddingHorizontal: 14, paddingTop: 4, paddingBottom: 12, gap: 16, flexGrow: 1, justifyContent: 'center' }} showsVerticalScrollIndicator={false}>
              <View style={{ alignItems: 'center' }}>
                <ScaledBoard scale={scale}>{scene.picture({ active: i === index, still })}</ScaledBoard>
              </View>
              <View style={{ gap: 6, paddingHorizontal: 10 }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: colors.burned }}>{scene.eyebrow}</Text>
                <Title style={{ fontSize: 28, lineHeight: 32, fontWeight: '700' }}>{scene.title}</Title>
                <Text style={{ fontSize: 16, lineHeight: 22, color: SOFT }}>{scene.line}</Text>
                {scene.small ? <Text style={{ marginTop: 4, fontSize: 11.5, lineHeight: 16, color: colors.muted }}>{scene.small}</Text> : null}
              </View>
            </ScrollView>
          ))}
        </ScrollView>

        <View style={{ flexDirection: 'row', gap: 12, paddingHorizontal: 20, paddingTop: 8 }}>
          {index > 0 && <OutlineButton title="Back" onPress={() => go(index - 1)} style={{ minHeight: 52, borderRadius: 26 }} />}
          <PrimaryButton title={last ? 'Get started' : 'Next'} onPress={() => (last ? finish() : go(index + 1))} style={{ flex: 1 }} />
        </View>
      </View>
    </View>
  );
}

// Shrinks or grows a finished board as one piece. The outer box takes the scaled size so the
// words underneath sit right below it; its height is measured, since the boards differ.
function ScaledBoard({ scale, children }: { scale: number; children: ReactNode }) {
  const [height, setHeight] = useState(PHOTO_HEIGHT);
  return (
    <View style={{ width: BOARD * scale, height: height * scale }}>
      <View onLayout={(event) => setHeight(event.nativeEvent.layout.height)} style={{ position: 'absolute', left: 0, top: 0, width: BOARD, transformOrigin: 'top left', transform: [{ scale }] }}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chipTitle: { fontSize: 13.5, lineHeight: 17, fontWeight: '600', color: colors.text },
  chipDetail: { fontSize: 11, lineHeight: 14, color: SOFT },
  caption: { fontSize: 11.5, lineHeight: 15, fontWeight: '500', color: SOFT },
  sign: { fontFamily: numberFont, fontSize: 34, lineHeight: 36, fontWeight: '700', color: colors.text, textAlign: 'center' },
  compare: { fontSize: 13, fontWeight: '600', color: SOFT },
  strong: { fontWeight: '700', color: colors.text },
});
