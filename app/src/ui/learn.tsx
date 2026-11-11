import { ReactNode, useState } from 'react';
import { Linking, Modal, Pressable, ScrollView, StyleProp, Text, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { describeDailyValue, NUTRIENT_GUIDE, percentOfDailyValue } from '../learn/nutrientGuide';
import { NutrientProfile } from '../types/nutrition';
import { Body, Glass, Muted, Num, OutlineButton, PrimaryButton, Title } from './kit';
import { colors } from './theme';

function QuestionMark() {
  return (
    <View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 1, borderColor: colors.muted, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: 11, fontWeight: '700', color: colors.muted, lineHeight: 14 }}>?</Text>
    </View>
  );
}

function Section({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <View style={{ gap: 4 }}>
      <Muted style={{ fontSize: 12, fontWeight: '600', letterSpacing: 0.3 }}>{heading}</Muted>
      {children}
    </View>
  );
}

interface LearnProps {
  topic: keyof NutrientProfile;
  // The figure this explanation sits next to, so the sheet can say what share of a day it is.
  amount?: number;
  amountLabel?: string; // "This meal" / "That day" / "An average day"
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}

// Wraps a nutrient's label and number so the whole thing, with a small "?" beside it, opens a
// short plain-English explanation. The facts and the "read more" link are FDA's.
export function Learn({ topic, amount, amountLabel = 'This meal', children, style }: LearnProps) {
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const guide = NUTRIENT_GUIDE[topic];
  const percent = amount === undefined ? null : percentOfDailyValue(topic, amount);
  const unit = guide.dailyValue?.unit ?? 'g';

  return (
    <>
      <Pressable onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel={`What is ${guide.title.toLowerCase()}?`} hitSlop={6} style={({ pressed }) => [style, pressed && { opacity: 0.6 }]}>
        {children}
      </Pressable>
      {open && (
        <Modal visible transparent animationType="slide" onRequestClose={() => setOpen(false)}>
          <Pressable style={{ flex: 1, backgroundColor: 'rgba(8, 10, 18, 0.55)' }} onPress={() => setOpen(false)} accessibilityLabel="Close" />
          <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '86%' }}>
            <Glass strong radius={28} padding={0} style={{ borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }}>
              <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 16, gap: 16 }} showsVerticalScrollIndicator={false}>
                <View style={{ width: 40, height: 5, borderRadius: 3, backgroundColor: colors.outline, alignSelf: 'center' }} />
                <Title style={{ fontSize: 26 }}>{guide.title}</Title>

                <Section heading="WHAT IT IS">
                  <Body style={{ lineHeight: 22 }}>{guide.what}</Body>
                </Section>

                <Section heading="DAILY VALUE">
                  {guide.dailyValue ? <Num style={{ fontSize: 20 }}>{describeDailyValue(guide.dailyValue)}</Num> : null}
                  {guide.dailyValueNote ? <Body style={{ lineHeight: 22 }}>{guide.dailyValueNote}</Body> : null}
                  {percent !== null && amount !== undefined && (
                    <View style={{ marginTop: 6, gap: 6 }}>
                      <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.track }}>
                        <View style={{ height: 8, borderRadius: 4, width: `${Math.min(100, percent)}%`, backgroundColor: guide.dailyValue!.kind === 'limit' && percent > 100 ? colors.danger : colors.eaten }} />
                      </View>
                      <Muted>
                        {amountLabel}: {Math.round(amount).toLocaleString('en-US')} {unit === 'cal' ? 'calories' : unit}, which is {percent}% of the Daily Value.
                      </Muted>
                    </View>
                  )}
                </Section>

                {guide.foundIn ? (
                  <Section heading="WHERE IT COMES FROM">
                    <Body style={{ lineHeight: 22 }}>{guide.foundIn}</Body>
                  </Section>
                ) : null}

                <Section heading="WHAT TO DO WITH IT">
                  <Body style={{ lineHeight: 22 }}>{guide.advice}</Body>
                </Section>

                <Muted style={{ fontSize: 12, lineHeight: 18 }}>
                  Daily Values are for a 2,000 calorie day, so yours may be a little higher or lower. As a rule of thumb for one serving, 5% of the Daily Value or less is low and 20% or more is high. General information, not medical advice.
                </Muted>

                <View style={{ gap: 10 }}>
                  <PrimaryButton title="Got it" onPress={() => setOpen(false)} />
                  <OutlineButton title="Read more on FDA's site" onPress={() => Linking.openURL(guide.url)} />
                </View>
                <Muted style={{ fontSize: 12, textAlign: 'center' }}>Source: U.S. Food and Drug Administration, Interactive Nutrition Facts Label.</Muted>
              </ScrollView>
            </Glass>
          </View>
        </Modal>
      )}
    </>
  );
}

// A label with the small "?" beside it, for use inside <Learn>.
export function LearnLabel({ children }: { children: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Muted style={{ fontSize: 12 }}>{children}</Muted>
      <QuestionMark />
    </View>
  );
}
