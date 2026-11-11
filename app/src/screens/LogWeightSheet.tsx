import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Keyboard, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { readScalePhoto } from '../api/readScale';
import { Body, Muted, OutlineButton, PrimaryButton, Title } from '../ui/kit';
import { BottomSheet, SheetOption } from '../ui/sheet';
import { colors } from '../ui/theme';
import { formatWeight, fromDisplayWeight, toDisplayWeight, WeightUnit } from '../units';
import { logWeight } from '../weight/weightStore';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
  unit: WeightUnit;
  lastKg?: number; // shown as a faint hint in the empty box
}

type Step = 'menu' | 'reading' | 'confirm';

// Same sheet as "Log a meal": photograph the scale, choose a photo, or type it in. A number read
// from a photo is only ever put in the box for checking. Nothing is saved until Save is tapped,
// because one misread digit on a scale display would otherwise go straight into the history.
export default function LogWeightSheet({ visible, onClose, onSaved, unit, lastKg }: Props) {
  const [step, setStep] = useState<Step>('menu');
  const [typed, setTyped] = useState('');
  const [note, setNote] = useState('');

  // Start fresh each time the sheet opens.
  useEffect(() => {
    if (visible) {
      setStep('menu');
      setTyped('');
      setNote('');
    }
  }, [visible]);

  const number = Number(typed.replace(',', '.'));
  const valid = typed !== '' && Number.isFinite(number) && number > 20 && number < 1000;

  async function readFromPhoto(source: 'camera' | 'library') {
    const permission = source === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      return Alert.alert(source === 'camera' ? 'Camera access is off' : 'Photo access is off', 'Turn it on for this app in Settings, or type your weight in.');
    }
    const result = source === 'camera' ? await ImagePicker.launchCameraAsync({ quality: 0.7 }) : await ImagePicker.launchImageLibraryAsync({ quality: 0.7 });
    if (result.canceled) return;
    setStep('reading');
    try {
      const kg = await readScalePhoto(result.assets[0].uri, unit);
      if (kg === null) {
        setTyped('');
        setNote('Could not read a weight in that photo. Type it in, or go back and try a closer, straight-on shot of the display.');
      } else {
        setTyped(toDisplayWeight(kg, unit).toFixed(1));
        setNote(`Read ${formatWeight(kg, unit)} from your photo. Check it matches the scale.`);
      }
    } catch {
      setTyped('');
      setNote('The photo reader is unavailable right now. Type your weight in instead.');
    }
    setStep('confirm');
  }

  async function save() {
    if (!valid) return;
    Keyboard.dismiss();
    await logWeight(fromDisplayWeight(number, unit));
    onSaved();
    onClose();
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} locked={step === 'reading'}>
      {step === 'menu' && (
        <View style={{ gap: 12 }}>
          <View>
            <Title style={{ fontSize: 24 }}>Log your weight</Title>
            <Muted style={{ fontSize: 14 }}>A photo of your scale is enough. You check the number before it is saved.</Muted>
          </View>
          <SheetOption icon="camera" accent title="Take a photo of the scale" detail="Opens the camera" onPress={() => readFromPhoto('camera')} />
          <SheetOption icon="photos" title="Choose from your photos" detail="A photo or screenshot showing your weight" onPress={() => readFromPhoto('library')} />
          <SheetOption icon="plus" title="Type it in" detail="Enter the number yourself" onPress={() => setStep('confirm')} />
          <OutlineButton title="Cancel" onPress={onClose} style={{ borderWidth: 0 }} />
        </View>
      )}

      {step === 'reading' && (
        <View style={{ alignItems: 'center', gap: 12, paddingVertical: 36 }}>
          <ActivityIndicator color={colors.text} size="large" />
          <Body style={{ fontSize: 17, fontWeight: '600' }}>Reading the scale…</Body>
          <Muted>This takes a few seconds.</Muted>
        </View>
      )}

      {step === 'confirm' && (
        <View style={{ gap: 12 }}>
          <View>
            <Title style={{ fontSize: 24 }}>{note && typed ? 'Check the number' : 'Your weight today'}</Title>
            {note ? <Muted style={{ fontSize: 14 }}>{note}</Muted> : null}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <TextInput
              value={typed}
              onChangeText={setTyped}
              keyboardType="decimal-pad"
              autoFocus={typed === ''}
              placeholder={lastKg ? toDisplayWeight(lastKg, unit).toFixed(1) : unit === 'lb' ? '180.0' : '82.0'}
              placeholderTextColor={colors.placeholder}
              accessibilityLabel={`Weight in ${unit}`}
              style={{ flex: 1, height: 60, borderRadius: 18, borderWidth: 1, borderColor: colors.outline, color: colors.text, fontSize: 28, fontWeight: '600', paddingHorizontal: 18 }}
            />
            <Muted style={{ fontSize: 18, width: 28 }}>{unit}</Muted>
          </View>
          <PrimaryButton title="Save" onPress={save} disabled={!valid} />
          <OutlineButton title="Back" onPress={() => { setNote(''); setTyped(''); setStep('menu'); }} style={{ borderWidth: 0 }} />
        </View>
      )}
    </BottomSheet>
  );
}
