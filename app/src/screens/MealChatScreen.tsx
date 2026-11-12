import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { ChatItem, describePortion, itemCalories, MAX_PHOTOS, MAX_TURNS, mealTotals, sendMealTurn, SOURCE_LABELS, toMealItems } from '../api/mealChat';
import { persistPhoto } from '../data/dayData';
import { createEntry } from '../db/entriesRepository';
import { inferMealType } from '../nutrition/mealTagging';
import { parsePhotoTime } from '../photos/photoTime';
import { withTimeout } from '../photos/webImage';
import { Body, Glass, Glow, Icon, IconButton, IconName, Muted, Num, OutlineButton, PrimaryButton, Title } from '../ui/kit';
import { notify } from '../ui/notify';
import { BottomSheet, SheetOption } from '../ui/sheet';
import { colors, formatCalories } from '../ui/theme';
import { useDictation } from '../voice/useDictation';

// "Log a meal": a short conversation with the meal helper. One photo is enough: it is read
// straight away and can be saved. Everything after that is optional: a photo of the nutrition
// label for exact numbers, or a spoken or typed note ("a third of the bag", "no mayo").

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

  const scroll = useRef<ScrollView>(null);
  const nextId = useRef(1);
  // The first photo is the one kept with the saved meal. It is copied into the app's own storage
  // in the background while the helper reads it, so saving never waits on it for long.
  const keptPhoto = useRef<Promise<string> | null>(null);
  const takenAt = useRef<number | undefined>(undefined);
  // Voice results arrive from outside React's render, so they read the latest state from here.
  const latest = useRef({ items, busy, turns });
  latest.current = { items, busy, turns };

  const add = (message: Omit<Message, 'id'>) => setMessages((all) => [...all, { ...message, id: nextId.current++ }]);

  useEffect(() => {
    const timer = setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(timer);
  }, [messages, busy, items.length]);

  async function runTurn(turn: Turn) {
    setFailed(null);
    setBusy(turn.photoUri ? 'photo' : 'text');
    try {
      const result = await withTimeout(sendMealTurn({ items: latest.current.items, ...turn }), 75000, 'The helper');
      setItems(result.items);
      setTurns((count) => count + 1);
      add({ from: 'helper', text: result.reply });
    } catch {
      setFailed(turn);
      add({ from: 'helper', text: 'I could not work that out just now. Try again in a moment, or enter it by hand.' });
    } finally {
      setBusy(null);
    }
  }

  function say(words: string, spoken = false) {
    const message = words.trim();
    if (!message || latest.current.busy) return;
    if (latest.current.turns >= MAX_TURNS) return;
    setText('');
    add({ from: 'you', text: message, spoken });
    runTurn({ message });
  }

  const dictation = useDictation({ onHeard: setText, onDone: (words) => say(words, true) });

  function addPhoto(sourceUri: string, photoTakenAt?: number) {
    setChoosing(false);
    if (!keptPhoto.current) {
      keptPhoto.current = withTimeout(persistPhoto(sourceUri), 20000, 'Saving the photo').catch(() => '');
      takenAt.current = photoTakenAt;
    }
    setPhotos((count) => count + 1);
    add({ from: 'you', photoUri: sourceUri });
    runTurn({ photoUri: sourceUri });
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
      await createEntry(meal.photoUri, inferMealType(when), meal.items.map((item) => ({ item, portionMultiplier: 1 })), when);
      navigation.goBack();
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

  return (
    <View style={{ flex: 1, backgroundColor: colors.page, overflow: 'hidden' }}>
      <Glow />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, width: '100%', maxWidth: 480, alignSelf: 'center' }}>
        <View style={{ paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: 10, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Title style={{ fontSize: 26 }}>Log a meal</Title>
            <IconButton icon="close" label="Close without saving" onPress={() => navigation.goBack()} />
          </View>
          <Muted>One photo is enough. The label and your voice are optional extras.</Muted>
        </View>

        <ScrollView ref={scroll} style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 8, gap: 10 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {messages.map((message) => (
            <Bubble key={message.id} message={message} />
          ))}
          {busy ? (
            <View style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, paddingHorizontal: 14, borderRadius: 18, borderBottomLeftRadius: 6, borderWidth: 1, borderColor: colors.glassBorder, backgroundColor: 'rgba(255, 255, 255, 0.07)' }}>
              <ActivityIndicator color={colors.text} />
              <Muted>{busy === 'photo' ? 'Reading your photo. Usually 15 to 30 seconds.' : 'Working it out. Usually 15 to 30 seconds.'}</Muted>
            </View>
          ) : null}
          {failed && !busy ? <OutlineButton title="Try again" onPress={() => runTurn(failed)} style={{ alignSelf: 'flex-start', paddingHorizontal: 18 }} /> : null}
        </ScrollView>

        {items.length > 0 ? (
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

        {atTurnCap ? (
          <Muted style={{ textAlign: 'center', paddingHorizontal: 24, paddingBottom: 8 }}>That is the helper's limit for one meal. Save it; you can still edit every number afterwards.</Muted>
        ) : null}

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingBottom: Math.max(insets.bottom, 12) + 6 }}>
          <Pressable
            onPress={() => setChoosing(true)}
            disabled={!canType || photos >= MAX_PHOTOS}
            accessibilityRole="button"
            accessibilityLabel="Add a photo"
            style={({ pressed }) => [{ width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.eaten }, (pressed || !canType || photos >= MAX_PHOTOS) && { opacity: 0.45 }]}
          >
            <Icon name="camera" color="#0B0F14" />
          </Pressable>
          <TextInput
            value={text}
            onChangeText={setText}
            editable={canType && !dictation.listening}
            placeholder={dictation.listening ? 'Listening…' : 'Say or type it'}
            placeholderTextColor={colors.muted}
            accessibilityLabel="Say or type how much you ate"
            returnKeyType="send"
            onSubmitEditing={() => say(text)}
            style={[
              { flex: 1, minWidth: 0, height: 48, borderRadius: 24, borderWidth: 1, paddingHorizontal: 16, fontSize: 15, color: colors.text, borderColor: dictation.listening ? 'rgba(47, 184, 172, 0.55)' : colors.outline, backgroundColor: dictation.listening ? 'rgba(47, 184, 172, 0.14)' : 'rgba(255, 255, 255, 0.07)' },
              Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : null,
            ]}
          />
          {typed && !dictation.listening ? (
            <RoundButton icon="send" label="Send" fill={colors.burned} onPress={() => say(text)} disabled={!canType} />
          ) : (
            <RoundButton icon={dictation.listening ? 'stop' : 'mic'} label={dictation.listening ? 'Finish talking' : 'Talk to the helper'} fill={dictation.listening ? colors.eaten : colors.burned} onPress={dictation.toggle} disabled={!canType} />
          )}
        </View>
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
