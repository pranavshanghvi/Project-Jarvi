import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { ChatItem, describePortion, FAILURE_TEXT, failureReason, itemCalories, MAX_PHOTOS, MAX_TURNS, mealTotals, sendMealTurn, SOURCE_LABELS, toMealItems } from '../api/mealChat';
import { persistPhoto } from '../data/dayData';
import { createEntry, deleteEntry, getEntriesInRange } from '../db/entriesRepository';
import { toDateKey } from '../nutrition/aggregation';
import { inferMealType } from '../nutrition/mealTagging';
import { parsePhotoTime } from '../photos/photoTime';
import { withTimeout } from '../photos/webImage';
import { Body, Glass, Glow, Icon, IconButton, IconName, Muted, Num, OutlineButton, PrimaryButton, Title } from '../ui/kit';
import { notify } from '../ui/notify';
import { BottomSheet, SheetOption } from '../ui/sheet';
import { colors, formatCalories, formatTime } from '../ui/theme';
import { findRepeat, getUsuals, rankUsuals, recordUse, removeUsual, Repeat, saveUsual, signature, suggestName, Usual, usualCalories } from '../usuals/usualsStore';
import { useDictation } from '../voice/useDictation';

// "Log a meal": a short conversation with the meal helper. One photo is enough, and nothing is
// read until the person sends it: a chosen photo waits above the message box so they can first
// say what it is ("the milk in my coffee, two tablespoons"). Meals had again and again are kept
// as "usuals" and logged with one tap, with no photo and no AI read.

interface Message {
  id: number;
  from: 'you' | 'helper';
  text?: string;
  photoUri?: string;
  spoken?: boolean;
}
interface Turn {
  message?: string;
  photoUri?: string;
}

const GREETING = 'Show me what you ate. One photo is enough, or just tell me.';
const TAG_COLORS = {
  label: { text: '#7FE0D6', fill: 'rgba(47, 184, 172, 0.16)' },
  said: { text: '#7FE0D6', fill: 'rgba(47, 184, 172, 0.16)' },
  estimate: { text: '#FFC58F', fill: 'rgba(255, 176, 103, 0.16)' },
};

function Bubble({ message }: { message: Message }) {
  const mine = message.from === 'you';
  if (message.photoUri) {
    return <Image source={{ uri: message.photoUri }} accessibilityLabel="Your photo" style={{ alignSelf: 'flex-end', width: 104, height: 104, borderRadius: 16, borderWidth: 1, borderColor: colors.glassBorder }} />;
  }
  return (
    <View
      style={{
        alignSelf: mine ? 'flex-end' : 'flex-start',
        maxWidth: '82%',
        flexDirection: 'row',
        gap: 8,
        paddingVertical: 11,
        paddingHorizontal: 14,
        borderRadius: 18,
        borderBottomRightRadius: mine ? 6 : 18,
        borderBottomLeftRadius: mine ? 18 : 6,
        borderWidth: 1,
        backgroundColor: mine ? 'rgba(47, 184, 172, 0.18)' : 'rgba(255, 255, 255, 0.07)',
        borderColor: mine ? 'rgba(47, 184, 172, 0.38)' : colors.glassBorder,
      }}
    >
      {message.spoken ? <View style={{ marginTop: 2 }}><Icon name="mic" size={16} color="#7FE0D6" /></View> : null}
      <Body style={{ flexShrink: 1, lineHeight: 21 }}>{message.text}</Body>
    </View>
  );
}

function RoundButton({ icon, label, onPress, fill, disabled }: { icon: IconName; label: string; onPress: () => void; fill: string; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [{ width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: fill }, (pressed || disabled) && { opacity: 0.45 }]}
    >
      <Icon name={icon} color="#0B0F14" />
    </Pressable>
  );
}

export default function MealChatScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<Message[]>([{ id: 0, from: 'helper', text: GREETING }]);
  const [items, setItems] = useState<ChatItem[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState<null | 'photo' | 'text'>(null);
  const [failed, setFailed] = useState<Turn | null>(null);
  const [turns, setTurns] = useState(0);
  const [photos, setPhotos] = useState(0);
  const [choosing, setChoosing] = useState(false);
  const [saving, setSaving] = useState(false);
  // A chosen photo that has not been sent yet. Nothing is read until the person taps send.
  const [pending, setPending] = useState<{ uri: string; takenAt?: number } | null>(null);
  const [usuals, setUsuals] = useState<Usual[]>([]);
  const [repeat, setRepeat] = useState<Repeat | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [fromUsual, setFromUsual] = useState<Usual | null>(null);
  const [logged, setLogged] = useState<{ entryId: number; name: string; when: Date } | null>(null);
  const [offer, setOffer] = useState<{ items: ChatItem[]; when: Date } | null>(null);
  const [usualName, setUsualName] = useState('');

  const scroll = useRef<ScrollView>(null);
  const nextId = useRef(1);
  // The first photo is the one kept with the saved meal. It is copied into the app's own storage
  // in the background while the helper reads it, so saving never waits on it for long.
  const keptPhoto = useRef<Promise<string> | null>(null);
  const takenAt = useRef<number | undefined>(undefined);
  // Everything the person typed or said in this meal, used only to suggest a name for a usual.
  const said = useRef('');
  // Voice results arrive from outside React's render, so they read the latest state from here.
  const latest = useRef({ items, busy, turns, pending });
  latest.current = { items, busy, turns, pending };

  const add = (message: Omit<Message, 'id'>) => setMessages((all) => [...all, { ...message, id: nextId.current++ }]);

  useEffect(() => {
    const timer = setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(timer);
  }, [messages, busy, items.length]);

  // Usuals, and any meal logged on two or more of the last 14 days that could become one.
  useEffect(() => {
    let alive = true;
    (async () => {
      const saved = await getUsuals();
      if (!alive) return;
      setUsuals(saved);
      try {
        const today = new Date();
        const from = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 14);
        const found = findRepeat(await getEntriesInRange(toDateKey(from), toDateKey(today)), saved);
        if (alive) setRepeat(found);
      } catch {
        // No history to look through: there is simply nothing to suggest.
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // After a one-tap log the screen closes by itself, leaving a moment to undo.
  useEffect(() => {
    if (!logged) return;
    const timer = setTimeout(() => navigation.goBack(), 2600);
    return () => clearTimeout(timer);
  }, [logged, navigation]);

  async function runTurn(turn: Turn) {
    setFailed(null);
    setBusy(turn.photoUri ? 'photo' : 'text');
    const attempt = () => withTimeout(sendMealTurn({ items: latest.current.items, ...turn }), 75000, 'The helper');
    try {
      let result;
      try {
        result = await attempt();
      } catch (error) {
        // A dropped connection is often gone a moment later (a phone coming back from the camera),
        // so that one case gets a single quiet second try before the person is bothered.
        if (failureReason(error) !== 'network') throw error;
        await new Promise((resolve) => setTimeout(resolve, 1500));
        result = await attempt();
      }
      setItems(result.items);
      setTurns((count) => count + 1);
      add({ from: 'helper', text: result.reply });
    } catch (error) {
      setFailed(turn);
      add({ from: 'helper', text: FAILURE_TEXT[failureReason(error)] });
    } finally {
      setBusy(null);
    }
  }

  // Sends whatever is waiting: the photo, the note, or both together as one read.
  function send(words: string = text, spoken = false) {
    const message = words.trim();
    const photo = latest.current.pending;
    if ((!message && !photo) || latest.current.busy) return;
    if (latest.current.turns >= MAX_TURNS) return;
    setText('');
    setPending(null);
    if (photo) {
      if (!keptPhoto.current) {
        keptPhoto.current = withTimeout(persistPhoto(photo.uri), 20000, 'Saving the photo').catch(() => '');
        takenAt.current = photo.takenAt;
      }
      setPhotos((count) => count + 1);
      add({ from: 'you', photoUri: photo.uri });
    }
    if (message) {
      said.current += ` ${message}`;
      add({ from: 'you', text: message, spoken });
    }
    runTurn({ message: message || undefined, photoUri: photo?.uri });
  }

  // Spoken words send themselves, except when a photo is waiting: then they land in the box so
  // the person can check the note before the photo and note go off together.
  const dictation = useDictation({ onHeard: setText, onDone: (words) => (latest.current.pending ? setText(words) : send(words, true)) });

  function addPhoto(sourceUri: string, photoTakenAt?: number) {
    setChoosing(false);
    setPending({ uri: sourceUri, takenAt: photoTakenAt });
  }

  async function logUsual(usual: Usual) {
    if (saving) return;
    setSaving(true);
    try {
      const when = new Date();
      const entryId = await createEntry('', inferMealType(when), toMealItems(usual.items).map((item) => ({ item, portionMultiplier: 1 })), when);
      recordUse(usual.id, when).catch(() => {});
      setLogged({ entryId, name: usual.name, when });
    } catch {
      notify('Could not log it', 'The meal was not saved. Try once more.');
    } finally {
      setSaving(false);
    }
  }

  async function undoLogged() {
    if (!logged) return;
    const { entryId } = logged;
    setLogged(null);
    await deleteEntry(entryId).catch(() => {});
  }

  // "Change it": the usual becomes the meal so far, ready to be corrected by voice or by hand.
  function changeUsual(usual: Usual) {
    setItems(usual.items);
    setFromUsual(usual);
    add({ from: 'helper', text: `Here is ${usual.name}. Tell me what is different today, or save it as it is.` });
  }

  async function keepRepeat() {
    if (!repeat) return;
    const when = new Date();
    when.setHours(Math.floor(repeat.minuteOfDay / 60), repeat.minuteOfDay % 60, 0, 0);
    setUsuals(await saveUsual(suggestName(repeat.items, inferMealType(when), usuals), repeat.items, when));
    setRepeat(null);
  }

  async function forgetUsual(usual: Usual) {
    setUsuals(await removeUsual(usual.id));
    setPicked(null);
  }

  async function keepOffer() {
    if (!offer) return;
    await saveUsual(usualName, offer.items, offer.when).catch(() => {});
    navigation.goBack();
  }

  async function takePhoto() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return notify('Camera access is off', 'Turn on camera access for this app in Settings to photograph a meal.');
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (result.canceled) return setChoosing(false);
    addPhoto(result.assets[0].uri);
  }

  async function pickPhoto() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return notify('Photo access is off', 'Turn on photo access for this app in Settings to choose a meal photo.');
    const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.7, exif: true });
    if (result.canceled) return setChoosing(false);
    addPhoto(result.assets[0].uri, parsePhotoTime(result.assets[0].exif));
  }

  async function draft() {
    return { photoUri: (await keptPhoto.current) ?? '', items: toMealItems(items), takenAt: takenAt.current };
  }

  async function save() {
    setSaving(true);
    try {
      const meal = await draft();
      const when = meal.takenAt ? new Date(meal.takenAt) : new Date();
      const mealType = inferMealType(when);
      await createEntry(meal.photoUri, mealType, meal.items.map((item) => ({ item, portionMultiplier: 1 })), when);
      if (fromUsual) recordUse(fromUsual.id, when).catch(() => {});
      // A meal that is not a usual yet gets the offer to become one; anything else just closes.
      const sig = signature(items.map((item) => item.name));
      if (fromUsual || usuals.some((usual) => signature(usual.items.map((item) => item.name)) === sig)) return navigation.goBack();
      setUsualName(suggestName(items, mealType, usuals, said.current));
      setOffer({ items, when });
      setSaving(false);
    } catch {
      setSaving(false);
      notify('Could not save', 'The meal was not saved. Try once more.');
    }
  }

  // The full meal screen: every number editable, time and meal type adjustable. Also the way in
  // for typing a meal by hand when the helper is unavailable.
  async function openDetails() {
    setChoosing(false);
    navigation.replace('MealDetail', { draft: await draft() });
  }

  const total = mealTotals(items);
  const atTurnCap = turns >= MAX_TURNS;
  const canType = !busy && !atTurnCap && !saving;
  const typed = text.trim().length > 0;
  const done = !!logged || !!offer;
  // Usuals are offered only before anything else has happened in this meal.
  const fresh = messages.length === 1 && items.length === 0 && !pending && !busy && !done;
  const ranked = rankUsuals(usuals, new Date());
  const top = ranked.find((usual) => usual.id === picked) ?? ranked[0];
  const usualTime = (usual: Usual) => {
    const at = new Date();
    at.setHours(Math.floor(usual.minuteOfDay / 60), usual.minuteOfDay % 60, 0, 0);
    return formatTime(at);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.page, overflow: 'hidden' }}>
      <Glow />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, width: '100%', maxWidth: 480, alignSelf: 'center' }}>
        <View style={{ paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: 10, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Title style={{ fontSize: 26 }}>Log a meal</Title>
            <IconButton icon="close" label="Close without saving" onPress={() => navigation.goBack()} />
          </View>
          <Muted>One photo is enough. A note is optional.</Muted>
        </View>

        <ScrollView ref={scroll} style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 8, gap: 10 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {messages.map((message) => (
            <Bubble key={message.id} message={message} />
          ))}
          {fresh && top ? (
            <View style={{ gap: 10, marginTop: 6 }}>
              <Muted style={{ fontSize: 13, fontWeight: '600', paddingHorizontal: 4 }}>Your usuals</Muted>
              <Glass strong radius={22} padding={16}>
                <View style={{ gap: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <View style={{ width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255, 176, 103, 0.18)', borderWidth: 1, borderColor: 'rgba(255, 176, 103, 0.4)' }}>
                      <Icon name="usual" color={colors.eaten} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Body numberOfLines={1} style={{ fontSize: 17, fontWeight: '600' }}>{top.name}</Body>
                      <Muted numberOfLines={1} style={{ fontSize: 13 }}>You have this around {usualTime(top)}</Muted>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Num style={{ fontSize: 22, color: colors.eaten }}>{formatCalories(usualCalories(top))}</Num>
                      <Muted style={{ fontSize: 11 }}>calories</Muted>
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <PrimaryButton title={saving ? 'Logging…' : 'Log it'} onPress={() => logUsual(top)} disabled={saving} style={{ flex: 1 }} />
                    <OutlineButton title="Change it" onPress={() => changeUsual(top)} style={{ paddingHorizontal: 18 }} />
                  </View>
                  <Pressable onPress={() => forgetUsual(top)} accessibilityRole="button" hitSlop={8} style={{ alignSelf: 'center', minHeight: 28, justifyContent: 'center' }}>
                    <Muted style={{ fontSize: 13 }}>Remove from usuals</Muted>
                  </Pressable>
                </View>
              </Glass>
              {ranked.length > 1 ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {ranked
                    .filter((usual) => usual.id !== top.id)
                    .slice(0, 6)
                    .map((usual) => (
                      <Pressable key={usual.id} onPress={() => setPicked(usual.id)} accessibilityRole="button" accessibilityLabel={`Show ${usual.name}`} style={({ pressed }) => [{ flexGrow: 1, flexBasis: '45%', minWidth: 0, borderRadius: 16, borderWidth: 1, borderColor: colors.glassBorder, backgroundColor: 'rgba(255, 255, 255, 0.07)', paddingVertical: 10, paddingHorizontal: 12 }, pressed && { opacity: 0.6 }]}>
                        <Body numberOfLines={1} style={{ fontSize: 14, fontWeight: '600' }}>{usual.name}</Body>
                        <Muted style={{ fontSize: 12 }}>{formatCalories(usualCalories(usual))} calories</Muted>
                      </Pressable>
                    ))}
                </View>
              ) : null}
              <Muted style={{ fontSize: 13, paddingHorizontal: 4 }}>Something else? Take a photo or tell me below.</Muted>
            </View>
          ) : null}
          {fresh && repeat ? (
            <Glass radius={22} padding={16} style={{ marginTop: 6 }}>
              <View style={{ gap: 10 }}>
                <View>
                  <Body numberOfLines={2} style={{ fontSize: 16, fontWeight: '600' }}>{repeat.items.map((item) => item.name).join(', ')}</Body>
                  <Muted style={{ fontSize: 13 }}>You logged this on {repeat.days} days. Keep it as a usual and it is one tap from now on.</Muted>
                </View>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <PrimaryButton title="Keep as a usual" onPress={keepRepeat} style={{ flex: 1 }} />
                  <OutlineButton title="Not now" onPress={() => setRepeat(null)} style={{ paddingHorizontal: 18 }} />
                </View>
              </View>
            </Glass>
          ) : null}
          {logged ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(47, 184, 172, 0.4)', backgroundColor: 'rgba(47, 184, 172, 0.16)', paddingHorizontal: 14, marginTop: 6 }}>
              <View style={{ width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.burned }}>
                <Icon name="check" size={16} color={colors.ink} strokeWidth={2.6} />
              </View>
              <Body numberOfLines={1} style={{ flex: 1, fontWeight: '600' }}>{logged.name} logged at {formatTime(logged.when)}</Body>
              <Pressable onPress={undoLogged} accessibilityRole="button" hitSlop={10} style={{ minHeight: 44, justifyContent: 'center' }}>
                <Muted>Undo</Muted>
              </Pressable>
            </View>
          ) : null}
          {offer ? (
            <Glass strong radius={22} padding={16} style={{ marginTop: 6 }}>
              <View style={{ gap: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.burned }}>
                    <Icon name="check" size={16} color={colors.ink} strokeWidth={2.6} />
                  </View>
                  <Body style={{ fontWeight: '600' }}>Saved, {formatTime(offer.when)}</Body>
                </View>
                <View style={{ height: 1, backgroundColor: colors.hairline }} />
                <View>
                  <Body style={{ fontSize: 17, fontWeight: '600' }}>Have this most days?</Body>
                  <Muted style={{ fontSize: 14, lineHeight: 20 }}>Keep it as a usual and next time it is one tap, with no photo.</Muted>
                </View>
                <TextInput
                  value={usualName}
                  onChangeText={setUsualName}
                  placeholder="Name it"
                  placeholderTextColor={colors.muted}
                  accessibilityLabel="Name for this usual"
                  maxLength={40}
                  style={[{ height: 48, borderRadius: 16, borderWidth: 1, borderColor: colors.outline, backgroundColor: 'rgba(255, 255, 255, 0.07)', paddingHorizontal: 14, fontSize: 16, color: colors.text }, Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : null]}
                />
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <PrimaryButton title="Keep as a usual" onPress={keepOffer} style={{ flex: 1 }} />
                  <OutlineButton title="Not now" onPress={() => navigation.goBack()} style={{ paddingHorizontal: 18 }} />
                </View>
              </View>
            </Glass>
          ) : null}
          {busy ? (
            <View style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, paddingHorizontal: 14, borderRadius: 18, borderBottomLeftRadius: 6, borderWidth: 1, borderColor: colors.glassBorder, backgroundColor: 'rgba(255, 255, 255, 0.07)' }}>
              <ActivityIndicator color={colors.text} />
              <Muted>{busy === 'photo' ? 'Reading your photo. Usually 15 to 30 seconds.' : 'Working it out. Usually 15 to 30 seconds.'}</Muted>
            </View>
          ) : null}
          {failed && !busy ? <OutlineButton title="Try again" onPress={() => runTurn(failed)} style={{ alignSelf: 'flex-start', paddingHorizontal: 18 }} /> : null}
        </ScrollView>

        {items.length > 0 && !done ? (
          <View style={{ paddingHorizontal: 16, paddingBottom: 10 }}>
            <Glass strong radius={22} padding={14}>
              <View style={{ gap: 9 }}>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
                  <Muted>Meal so far</Muted>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 5 }}>
                    <Num style={{ fontSize: 28, color: colors.eaten }}>{formatCalories(total.calories)}</Num>
                    <Muted>calories</Muted>
                  </View>
                </View>
                <ScrollView style={{ maxHeight: 148 }} contentContainerStyle={{ gap: 8 }} showsVerticalScrollIndicator={false} nestedScrollEnabled>
                  {items.map((item, index) => (
                    <View key={`${item.name}-${index}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Body numberOfLines={1}>{item.name}</Body>
                        <Muted numberOfLines={1} style={{ fontSize: 12 }}>{describePortion(item)}</Muted>
                      </View>
                      <Text style={{ fontSize: 11, fontWeight: '600', color: TAG_COLORS[item.source].text, backgroundColor: TAG_COLORS[item.source].fill, borderRadius: 8, overflow: 'hidden', paddingVertical: 3, paddingHorizontal: 7 }}>
                        {SOURCE_LABELS[item.source]}
                      </Text>
                      <Num style={{ fontSize: 15, minWidth: 38, textAlign: 'right' }}>{formatCalories(itemCalories(item))}</Num>
                      <Pressable onPress={() => setItems((all) => all.filter((_, i) => i !== index))} accessibilityRole="button" accessibilityLabel={`Remove ${item.name}`} hitSlop={10} style={({ pressed }) => [{ width: 28, height: 28, alignItems: 'center', justifyContent: 'center' }, pressed && { opacity: 0.5 }]}>
                        <Icon name="close" size={14} color={colors.muted} />
                      </Pressable>
                    </View>
                  ))}
                </ScrollView>
                {total.addedSugarG >= 0.5 ? <Muted style={{ fontSize: 13 }}>Added sugar in this meal: {Math.round(total.addedSugarG)} g</Muted> : null}
                <PrimaryButton title={saving ? 'Saving…' : 'Save meal'} onPress={save} disabled={saving || !!busy} />
                <Pressable onPress={openDetails} disabled={saving || !!busy} accessibilityRole="button" style={{ alignSelf: 'center', minHeight: 32, justifyContent: 'center' }}>
                  <Muted>Check or edit the numbers first</Muted>
                </Pressable>
              </View>
            </Glass>
          </View>
        ) : null}

        {atTurnCap && !done ? (
          <Muted style={{ textAlign: 'center', paddingHorizontal: 24, paddingBottom: 8 }}>That is the helper's limit for one meal. Save it; you can still edit every number afterwards.</Muted>
        ) : null}

        {pending && !done ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 16, marginBottom: 8, padding: 8, borderRadius: 18, borderWidth: 1, borderColor: colors.outline, backgroundColor: 'rgba(255, 255, 255, 0.07)' }}>
            <Image source={{ uri: pending.uri }} accessibilityLabel="The photo waiting to be sent" style={{ width: 52, height: 52, borderRadius: 12 }} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Body style={{ fontWeight: '600' }}>Photo ready</Body>
              <Muted style={{ fontSize: 13 }}>Not read yet. Say what it is, or just send.</Muted>
            </View>
            <Pressable onPress={() => setPending(null)} accessibilityRole="button" accessibilityLabel="Remove this photo" hitSlop={8} style={({ pressed }) => [{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255, 255, 255, 0.10)' }, pressed && { opacity: 0.5 }]}>
              <Icon name="close" size={14} />
            </Pressable>
          </View>
        ) : null}

        {done ? (
          <View style={{ height: Math.max(insets.bottom, 12) + 6 }} />
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingBottom: Math.max(insets.bottom, 12) + 6 }}>
            <Pressable
              onPress={() => setChoosing(true)}
              disabled={!canType || photos >= MAX_PHOTOS}
              accessibilityRole="button"
              accessibilityLabel={pending ? 'Choose a different photo' : 'Add a photo'}
              style={({ pressed }) => [{ width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.eaten }, (pressed || !canType || photos >= MAX_PHOTOS) && { opacity: 0.45 }]}
            >
              <Icon name="camera" color="#0B0F14" />
            </Pressable>
            <TextInput
              value={text}
              onChangeText={setText}
              editable={canType && !dictation.listening}
              placeholder={dictation.listening ? 'Listening…' : pending ? 'What is this?' : 'Say or type it'}
              placeholderTextColor={colors.muted}
              accessibilityLabel={pending ? 'Say or type what the photo is' : 'Say or type what you ate'}
              returnKeyType="send"
              onSubmitEditing={() => send()}
              style={[
                { flex: 1, minWidth: 0, height: 48, borderRadius: 24, borderWidth: 1, paddingHorizontal: 16, fontSize: 15, color: colors.text, borderColor: dictation.listening ? 'rgba(47, 184, 172, 0.55)' : colors.outline, backgroundColor: dictation.listening ? 'rgba(47, 184, 172, 0.14)' : 'rgba(255, 255, 255, 0.07)' },
                Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : null,
              ]}
            />
            {/* With a photo waiting, both buttons show: talk to add a note, or send it as it is. */}
            {dictation.listening || (!typed && !pending) || (pending && !typed) ? (
              <RoundButton icon={dictation.listening ? 'stop' : 'mic'} label={dictation.listening ? 'Finish talking' : pending ? 'Say what the photo is' : 'Talk to the helper'} fill={dictation.listening ? colors.eaten : pending ? 'rgba(255, 255, 255, 0.85)' : colors.burned} onPress={dictation.toggle} disabled={!canType} />
            ) : null}
            {(typed || pending) && !dictation.listening ? <RoundButton icon="send" label={pending ? 'Send the photo' : 'Send'} fill={colors.burned} onPress={() => send()} disabled={!canType} /> : null}
          </View>
        )}
      </KeyboardAvoidingView>

      <BottomSheet visible={choosing} onClose={() => setChoosing(false)}>
        <View style={{ gap: 12 }}>
          <View>
            <Title style={{ fontSize: 24 }}>Add a photo</Title>
            <Muted style={{ fontSize: 14 }}>The food, or its nutrition label. Up to {MAX_PHOTOS} per meal.</Muted>
          </View>
          <SheetOption icon="camera" accent title="Take a photo" detail="Opens the camera" onPress={takePhoto} />
          <SheetOption icon="photos" title="Choose from your photos" detail="Uses the time the photo was taken" onPress={pickPhoto} />
          {Platform.OS === 'ios' && (
            <SheetOption
              icon="glasses"
              title="From your glasses"
              detail="Photos your Meta glasses saved to this phone"
              onPress={() => {
                setChoosing(false);
                navigation.replace('GlassesImport');
              }}
            />
          )}
          <SheetOption icon="plus" title="Enter it by hand" detail="No helper: type the food and calories yourself" onPress={openDetails} />
          <OutlineButton title="Cancel" onPress={() => setChoosing(false)} style={{ borderWidth: 0 }} />
        </View>
      </BottomSheet>
    </View>
  );
}
