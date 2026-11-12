import { ReactNode, useRef, useState } from 'react';
import { NativeScrollEvent, NativeSyntheticEvent, Platform, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BarsChart, Legend } from '../ui/charts';
import { Body, Glass, Glow, Icon, IconName, Muted, Num, OutlineButton, PrimaryButton, Row, Title } from '../ui/kit';
import { LearnLabel } from '../ui/learn';
import { colors } from '../ui/theme';

// The tour, opened from the landing page (WelcomeScreen). It can be skipped at any point and
// replayed any time from the bottom of the Today screen. The slides walk
// through one ordinary day, so someone who was only sent a link knows what they have been sent.
// Every picture is drawn with the app's real building blocks and made-up example numbers.

const onPhone = Platform.OS === 'ios';

interface Slide {
  eyebrow: string;
  title: string;
  body: string;
  picture: ReactNode;
}

function Tile({ icon, title, detail, accent }: { icon: IconName; title: string; detail: string; accent?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, padding: 12, backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1, borderColor: colors.glassBorder }}>
      <View style={{ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: accent ? colors.eaten : 'rgba(255,255,255,0.10)' }}>
        <Icon name={icon} size={22} color={accent ? '#0B0F14' : colors.text} />
      </View>
      <View style={{ flex: 1 }}>
        <Body style={{ fontWeight: '600' }}>{title}</Body>
        <Muted style={{ fontSize: 12 }}>{detail}</Muted>
      </View>
    </View>
  );
}

function FoodLine({ name, portion, calories, fill }: { name: string; portion: string; calories: string; fill: number }) {
  return (
    <View style={{ paddingVertical: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Body>{name}</Body>
          <Muted style={{ fontSize: 12 }}>{portion}</Muted>
        </View>
        <Num style={{ fontSize: 16 }}>{calories}</Num>
        <View style={{ borderWidth: 1, borderColor: colors.outline, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 4 }}>
          <Body style={{ fontSize: 13 }}>Edit</Body>
        </View>
      </View>
      <View style={{ height: 4, borderRadius: 2, backgroundColor: colors.outline, marginTop: 10 }}>
        <View style={{ height: 4, borderRadius: 2, backgroundColor: colors.eaten, width: `${fill}%` }} />
        <View style={{ position: 'absolute', left: `${fill}%`, top: -7, width: 18, height: 18, marginLeft: -9, borderRadius: 9, backgroundColor: colors.text }} />
      </View>
    </View>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ width: '33.33%', marginBottom: 10 }}>
      <LearnLabel>{label}</LearnLabel>
      <Num style={{ fontSize: 17 }}>{value}</Num>
    </View>
  );
}

const SLIDES: Slide[] = [
  {
    eyebrow: 'In the morning',
    title: 'Your burn is counted for you',
    body: onPhone
      ? 'Your Apple Watch and iPhone already count the calories you burn, workouts included. BiteLog reads them from Apple Health by itself. There is nothing to type.'
      : 'Your Apple Watch and iPhone already count the calories you burn. A website is not allowed to read them directly, so tap the BiteLog Shortcut on your iPhone to bring them in, or type them on the Burned tab.',
    picture: (
      <Glass>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
          <Num style={{ fontSize: 34, color: colors.burned }}>2,140</Num>
          <Muted>calories burned today</Muted>
        </View>
        <View style={{ flexDirection: 'row', gap: 3, height: 8, marginVertical: 10 }}>
          <View style={{ width: '24%', borderRadius: 4, backgroundColor: colors.burned }} />
          <View style={{ flex: 1, borderRadius: 4, backgroundColor: colors.burnedDeep }} />
        </View>
        <Row first title="Outdoor run" detail="7:10 AM · 38 min · 3.2 mi" value="−412" valueColor={colors.burned} chevron={false} />
        <Row title="Resting" detail="What your body uses just staying alive" value="1,620" chevron={false} />
      </Glass>
    ),
  },
  {
    eyebrow: 'At each meal',
    title: 'Take a photo of what you eat',
    body: `Tap the round + button and photograph the plate. One photo is enough: in about 20 seconds BiteLog lists each food with its calories, protein, carbs, fat, sugar and more. For a closer number you can also photograph the nutrition label, or just say how much you had.${onPhone ? ' Photos from Meta smart glasses work too.' : ''}`,
    picture: (
      <View style={{ gap: 10 }}>
        <Tile icon="camera" accent title="Take a photo" detail="One is enough" />
        <Tile icon="photos" title="Add the nutrition label" detail="Optional: exact numbers off the packet" />
        <Tile icon="mic" title="Say how much you ate" detail="Optional: “a third of the bag”" />
      </View>
    ),
  },
  {
    eyebrow: 'If it gets it wrong',
    title: 'Correct it in a few taps',
    body: 'The photo reader estimates, so check it. Drag a slider to change a portion. Tap Edit to rename a food or fix any number. Add a food the photo missed, or type a whole meal in with no photo at all.',
    picture: (
      <Glass padding={0} style={{ paddingHorizontal: 14, paddingVertical: 4 }}>
        <FoodLine name="Pizza crust" portion="1 crust · 100% portion" calories="250" fill={40} />
        <View style={{ height: 1, backgroundColor: colors.hairline }} />
        <FoodLine name="Mozzarella" portion="8 slices · 70% portion" calories="196" fill={26} />
      </Glass>
    ),
  },
  {
    eyebrow: 'Through the day',
    title: 'Everything you ate, with the time',
    body: 'The Food tab keeps every meal in order with the time you ate it. The Today screen sets eaten against burned, and shows when in the day each meal and workout happened.',
    picture: (
      <Glass padding={0} style={{ paddingHorizontal: 14 }}>
        <Row first title="Oatmeal, berries" detail="8:05 AM · Breakfast" value="420" valueColor={colors.eaten} chevron />
        <Row title="Pizza margherita" detail="1:15 PM · Lunch" value="581" valueColor={colors.eaten} chevron />
        <Row title="Dal, rice, roti" detail="7:40 PM · Dinner" value="520" valueColor={colors.eaten} chevron />
      </Glass>
    ),
  },
  {
    eyebrow: 'Go deeper',
    title: 'Tap anything to see behind it',
    body: 'Every number and every row opens the detail behind it. Tap a nutrient with a small ? to learn what it is, how much is recommended in a day, and what share of that this meal was.',
    picture: (
      <Glass>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          <Fact label="Protein" value="32 g" />
          <Fact label="Carbs" value="58 g" />
          <Fact label="Fat" value="24 g" />
          <Fact label="Sugar" value="9 g" />
          <Fact label="Added sugar" value="2 g" />
          <Fact label="Sodium" value="1,180 mg" />
        </View>
        <Muted style={{ fontSize: 12 }}>Sodium: this meal is 51% of the Daily Value.</Muted>
      </Glass>
    ),
  },
  {
    eyebrow: 'Your target',
    title: 'Set a goal and log your weight',
    body: 'Pick the weight you want to reach and how fast. BiteLog turns that into a daily calorie target and shows which days you hit it. Log your weight by typing it, or by photographing your scale.',
    picture: (
      <Glass>
        <Muted>Reach</Muted>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
          <Num style={{ fontSize: 36 }}>175</Num>
          <Muted style={{ fontSize: 15 }}>lb</Muted>
        </View>
        <View style={{ height: 10, borderRadius: 5, backgroundColor: colors.track, marginVertical: 10 }}>
          <View style={{ height: 10, borderRadius: 5, backgroundColor: colors.text, width: '43%' }} />
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Muted style={{ fontSize: 12 }}>Started 188.0</Muted>
          <Muted style={{ fontSize: 12, color: colors.text }}>Now 182.4</Muted>
          <Muted style={{ fontSize: 12 }}>Goal 175.0</Muted>
        </View>
      </Glass>
    ),
  },
  {
    eyebrow: 'Over time',
    title: 'Look back over weeks, months and years',
    body: 'History shows eaten against burned for any period, and which days you logged. Switch any chart between bars, line, pie and flow to see it the way you like.',
    picture: (
      <Glass>
        <BarsChart
          width={260}
          labels={['Thu', 'Fri', 'Sat', 'Sun', 'Mon', 'Tue', 'Wed']}
          series={[
            { label: 'Eaten', color: colors.eaten, values: [1900, 2050, 2300, 1800, 1750, 1880, 1520] },
            { label: 'Burned', color: colors.burned, values: [2200, 2350, 2100, 2500, 2250, 2150, 2140] },
          ]}
        />
        <Legend items={[{ label: 'Eaten', color: colors.eaten }, { label: 'Burned', color: colors.burned }]} />
      </Glass>
    ),
  },
  {
    eyebrow: 'Ready',
    title: 'Start with one photo',
    body: `Your food log, weight and goal stay on this ${onPhone ? 'phone' : 'browser'}. There is no account, and nobody else can see them. A food photo, and anything you say or type to the meal helper, is sent to an AI service to be read and is not kept by BiteLog. The numbers are estimates, not medical advice. You can come back to this tour from the bottom of the Today screen.`,
    picture: (
      <View style={{ alignItems: 'center', gap: 14 }}>
        <View style={{ width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center', backgroundColor: '#4CCFC2', borderWidth: 1, borderColor: 'rgba(190, 255, 245, 0.55)' }}>
          <Icon name="plus" size={38} color="#0B0F14" strokeWidth={2.5} />
        </View>
        <Muted>The round + button is on every screen.</Muted>
      </View>
    ),
  },
];

export const TUTORIAL_SLIDE_COUNT = SLIDES.length;

export default function TutorialScreen({ route, navigation }: any) {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const width = Math.max(320, Math.min(windowWidth, 480));
  const [index, setIndex] = useState(0);
  const pager = useRef<ScrollView>(null);
  const last = index === SLIDES.length - 1;

  function go(to: number) {
    const next = Math.max(0, Math.min(SLIDES.length - 1, to));
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
    if (page !== index && page >= 0 && page < SLIDES.length) setIndex(page);
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.page, alignItems: 'center', overflow: 'hidden' }}>
      <Glow />
      <View style={{ flex: 1, width, paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, height: 44 }}>
          <View style={{ flexDirection: 'row', gap: 6 }} accessibilityLabel={`Step ${index + 1} of ${SLIDES.length}`}>
            {SLIDES.map((_, i) => (
              <View key={i} style={{ width: i === index ? 18 : 6, height: 6, borderRadius: 3, backgroundColor: i === index ? colors.text : colors.outline }} />
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
          scrollEventThrottle={32}
          style={{ flex: 1 }}
        >
          {SLIDES.map((slide) => (
            <ScrollView key={slide.title} style={{ width }} contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 12, paddingBottom: 12, gap: 18, flexGrow: 1, justifyContent: 'center' }} showsVerticalScrollIndicator={false}>
              <View>{slide.picture}</View>
              <View style={{ gap: 8 }}>
                <Muted style={{ fontSize: 13, fontWeight: '600', color: colors.burned }}>{slide.eyebrow}</Muted>
                <Title style={{ fontSize: 26, lineHeight: 31 }}>{slide.title}</Title>
                <Body style={{ lineHeight: 22, color: colors.muted }}>{slide.body}</Body>
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
