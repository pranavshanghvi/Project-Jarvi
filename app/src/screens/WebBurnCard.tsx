import { useEffect, useState } from 'react';
import { TextInput, View } from 'react-native';
import { setBurnForDay } from '../health/importedBurn';
import { toDateKey } from '../nutrition/aggregation';
import { Body, Glass, Muted, OutlineButton, PrimaryButton } from '../ui/kit';
import { colors } from '../ui/theme';

// Once Pranav has built the Shortcut on his phone and shared it, its iCloud link goes here and
// the steps below collapse to one "Get the Shortcut" button for everyone else.
export const SHORTCUT_LINK = '';

const box = { flex: 1, minWidth: 0, height: 48, borderRadius: 14, borderWidth: 1, borderColor: colors.outline, color: colors.text, fontSize: 18, paddingHorizontal: 14 } as const;

// Shown on the web version, where Apple Health cannot be read. Two ways to get the day's burn in:
// type it, or set up an Apple Shortcut once that sends it with one tap.
export default function WebBurnCard({ active, resting, onSaved }: { active: number; resting: number; onSaved: () => void }) {
  const [activeText, setActiveText] = useState('');
  const [restingText, setRestingText] = useState('');
  const [showSteps, setShowSteps] = useState(false);
  const [copied, setCopied] = useState(false);
  const site = typeof window !== 'undefined' && window.location ? window.location.origin : 'this page';

  useEffect(() => {
    setActiveText(active > 0 ? String(Math.round(active)) : '');
    setRestingText(resting > 0 ? String(Math.round(resting)) : '');
  }, [active, resting]);

  const a = Number(activeText.replace(',', '.')) || 0;
  const r = Number(restingText.replace(',', '.')) || 0;
  const valid = (activeText !== '' || restingText !== '') && a >= 0 && r >= 0 && a + r > 0 && a + r <= 20000;

  async function save() {
    if (!valid) return;
    await setBurnForDay(toDateKey(new Date()), { active: Math.round(a), resting: Math.round(r) });
    onSaved();
  }

  // The address the Shortcut opens. It ends in "active=" so the one number from Health is simply
  // added on the end: nothing has to be placed in the middle of it.
  const address = `${site}/#active=`;

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Some browsers refuse without asking. The address is also shown in a box that selects
      // itself when tapped, so it can still be copied by hand.
      setCopied(false);
    }
  }

  const steps = [
    'On your iPhone, open the Shortcuts app and tap + to start a new shortcut.',
    'Add the action "Find Health Samples". Set the type to Active Energy and add the filter "Start Date is today".',
    'Add the action "Calculate Statistics" and set it to Sum.',
    'Add the action "Open URLs". Paste the address below into it, then tap "Statistics" in the row of suggestions above the keyboard so it lands on the end.',
    'Name the shortcut BiteLog and add it to your Home Screen. Tap it whenever you open BiteLog.',
  ];

  return (
    <Glass>
      <Body>Calories burned today</Body>
      <Muted style={{ marginBottom: 10 }}>A website cannot read Apple Health, so type the numbers from your Watch or the Fitness app, or set up the one-tap Shortcut below.</Muted>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1, gap: 4 }}>
          <Muted style={{ fontSize: 12 }}>Active</Muted>
          <TextInput value={activeText} onChangeText={setActiveText} keyboardType="decimal-pad" placeholder="520" placeholderTextColor={colors.placeholder} accessibilityLabel="Active calories" style={box} />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Muted style={{ fontSize: 12 }}>Resting</Muted>
          <TextInput value={restingText} onChangeText={setRestingText} keyboardType="decimal-pad" placeholder="1620" placeholderTextColor={colors.placeholder} accessibilityLabel="Resting calories" style={box} />
        </View>
      </View>
      <Muted style={{ fontSize: 12, marginTop: 6 }}>Only have one total? Put it under Active and leave Resting empty.</Muted>
      <PrimaryButton title="Save" onPress={save} disabled={!valid} style={{ marginTop: 12 }} />
      <OutlineButton title={showSteps ? 'Hide the Shortcut steps' : 'Send it from your iPhone with one tap'} onPress={() => setShowSteps(!showSteps)} style={{ marginTop: 10 }} />
      {showSteps && (
        <View style={{ gap: 10, marginTop: 12 }}>
          {SHORTCUT_LINK ? (
            <Body>Open this on your iPhone and tap "Add Shortcut": {SHORTCUT_LINK}</Body>
          ) : (
            <>
              {steps.map((step, index) => (
                <View key={index} style={{ flexDirection: 'row', gap: 10 }}>
                  <Muted style={{ width: 16, color: colors.text }}>{index + 1}</Muted>
                  <Muted style={{ flex: 1, lineHeight: 19 }}>{step}</Muted>
                </View>
              ))}
              <TextInput value={address} editable={false} selectTextOnFocus accessibilityLabel="Address for the Shortcut" style={[box, { flex: 0, fontSize: 14 }]} />
              <PrimaryButton title={copied ? 'Copied' : 'Copy the address'} onPress={copyAddress} />
            </>
          )}
          <Muted style={{ fontSize: 12 }}>The Shortcut sends your active calories. BiteLog works out the resting part from your profile, so fill in About you first.</Muted>
          <Muted style={{ fontSize: 12 }}>Your numbers travel after the # in the address, which browsers never send to any server. They are stored only in this browser.</Muted>
        </View>
      )}
    </Glass>
  );
}
