import { Image, Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BalanceRing, Legend } from '../ui/charts';
import { Body, Glow, Icon, IconName, Muted, Num, OutlineButton, PrimaryButton, Title } from '../ui/kit';
import { colors } from '../ui/theme';

// The landing page: the first thing a new person sees, before any questions are asked. It says
// what BiteLog is in a sentence, offers the one-minute tour, and lets them go straight in. It is
// shown once by itself; after that it is one tap away from the bottom of the Today screen.

const onPhone = Platform.OS === 'ios';

function Point({ icon, title, detail }: { icon: IconName; title: string; detail: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
      <View style={{ width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: colors.glassBorder }}>
        <Icon name={icon} size={22} />
      </View>
      <View style={{ flex: 1 }}>
        <Body style={{ fontWeight: '600' }}>{title}</Body>
        <Muted>{detail}</Muted>
      </View>
    </View>
  );
}

export default function WelcomeScreen({ route, navigation }: any) {
  const insets = useSafeAreaInsets();
  const thenOnboard = !!route.params?.thenOnboard;

  // A brand-new person goes on to the short profile questions; anyone who came back to this page
  // from inside the app just returns to where they were.
  function enter() {
    if (thenOnboard) navigation.replace('Profile', { onboarding: true });
    else navigation.goBack();
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.page, overflow: 'hidden' }}>
      <Glow />
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', width: '100%', maxWidth: 480, alignSelf: 'center', paddingHorizontal: 24, paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24, gap: 22 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ alignItems: 'center', gap: 2 }}>
          <Image source={require('../../assets/brand/icon-192.png')} accessibilityLabel="BiteLog logo" style={{ width: 76, height: 76, borderRadius: 18, marginBottom: 10 }} />
          <Title style={{ fontSize: 36, letterSpacing: -1 }}>BiteLog</Title>
          <Muted style={{ color: colors.burned, fontWeight: '600' }}>Food in, energy out</Muted>
        </View>

        <View style={{ alignItems: 'center' }}>
          <BalanceRing eaten={1520} burned={2140}>
            <Num style={{ fontSize: 34 }}>−620</Num>
            <Muted>calorie deficit</Muted>
            <Muted style={{ fontSize: 12, fontWeight: '600', color: colors.burned, marginTop: 4 }}>Goal −500 met</Muted>
          </BalanceRing>
          <Legend items={[{ label: 'Eaten', color: colors.eaten }, { label: 'Burned', color: colors.burned }]} />
        </View>

        <View style={{ gap: 8 }}>
          <Title style={{ fontSize: 28, lineHeight: 33, textAlign: 'center' }}>Know what you eat against what you burn</Title>
          <Body style={{ color: colors.muted, lineHeight: 22, textAlign: 'center' }}>
            Photograph your meals, bring in the calories your Apple Watch counts, and see where the day, the week or the year stands.
          </Body>
        </View>

        <View style={{ gap: 14 }}>
          <Point icon="camera" title="Snap a meal" detail="Calories and nutrients from one photo, in about 20 seconds" />
          <Point icon="flame" title="Your burn, counted" detail={onPhone ? 'Read from Apple Health by itself' : 'Sent from your iPhone with one tap, or typed in'} />
          <Point icon="history" title="Goals, weight and history" detail="A target to aim for, and every day you have logged" />
        </View>

        <View style={{ gap: 10 }}>
          <PrimaryButton title="See how it works (1 minute)" onPress={() => navigation.replace('Tutorial', { thenOnboard })} />
          <OutlineButton title={thenOnboard ? 'Start using BiteLog' : 'Back to the app'} onPress={enter} />
        </View>

        <Muted style={{ fontSize: 12, textAlign: 'center' }}>
          No account. Your log stays on this {onPhone ? 'phone' : 'browser'}. The numbers are estimates, not medical advice.
        </Muted>
      </ScrollView>
    </View>
  );
}
