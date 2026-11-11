import { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Body, Glass, Icon, IconName, Muted } from './kit';
import { colors } from './theme';

// The slide-up panel used for "Log a meal" and "Log your weight", so both look and behave the
// same. `locked` keeps it open while something is in progress (a photo being read), so a stray
// tap outside cannot dismiss it halfway.
export function BottomSheet({ visible, onClose, locked, children }: { visible: boolean; onClose: () => void; locked?: boolean; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={locked ? undefined : onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(8, 10, 18, 0.55)' }} onPress={locked ? undefined : onClose} accessibilityLabel="Close" />
      {/* Lifts the panel above the keyboard when it contains a box to type in. */}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}>
        <Glass strong radius={28} padding={20} style={{ borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }}>
          <View style={{ paddingBottom: insets.bottom + 4 }}>
            <View style={{ width: 40, height: 5, borderRadius: 3, backgroundColor: colors.outline, alignSelf: 'center', marginBottom: 12 }} />
            {children}
          </View>
        </Glass>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// One choice in a sheet: icon tile, title, a line of detail, chevron.
export function SheetOption({ icon, title, detail, onPress, accent }: { icon: IconName; title: string; detail: string; onPress: () => void; accent?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 18, padding: 14, backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1, borderColor: colors.glassBorder },
        pressed && { opacity: 0.6 },
      ]}
    >
      <View style={{ width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: accent ? colors.eaten : 'rgba(255,255,255,0.10)' }}>
        <Icon name={icon} color={accent ? '#0B0F14' : colors.text} />
      </View>
      <View style={{ flex: 1 }}>
        <Body style={{ fontSize: 17, fontWeight: '600' }}>{title}</Body>
        <Muted>{detail}</Muted>
      </View>
      <Icon name="chevron" size={18} color={colors.muted} />
    </Pressable>
  );
}
