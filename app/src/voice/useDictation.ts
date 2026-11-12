import { useRef, useState } from 'react';
import { Platform } from 'react-native';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { notify } from '../ui/notify';

// Voice for the meal helper. This is the phone's (or browser's) own speech-to-text, which costs
// nothing and uses none of the AI allowance: it only turns what is said into words, which then go
// to the helper exactly as if they had been typed.
//
const SWITCHED_OFF =
  Platform.OS === 'web'
    ? 'Allow the microphone for this site in your browser, or type it instead.'
    : 'Allow the microphone and speech recognition for BiteLog in Settings, or type it instead.';

// Tap to start; it stops by itself after a pause, or on a second tap. `onHeard` gets the words as
// they arrive (to show them in the box) and `onDone` gets the finished sentence.
export function useDictation({ onHeard, onDone }: { onHeard: (text: string) => void; onDone: (text: string) => void }) {
  const [listening, setListening] = useState(false);
  const heard = useRef('');

  useSpeechRecognitionEvent('start', () => setListening(true));
  useSpeechRecognitionEvent('result', (event) => {
    heard.current = event.results[0]?.transcript ?? '';
    onHeard(heard.current);
  });
  useSpeechRecognitionEvent('end', () => {
    setListening(false);
    const text = heard.current.trim();
    heard.current = '';
    if (text) onDone(text);
  });
  useSpeechRecognitionEvent('error', (event) => {
    setListening(false);
    // Saying nothing, or stopping early, is not a fault worth a message.
    if (event.error === 'no-speech' || event.error === 'aborted') return;
    if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
      notify('Voice is switched off', SWITCHED_OFF);
      return;
    }
    notify('Could not hear that', 'Try again, or type it instead.');
  });

  async function start() {
    let available = false;
    try {
      available = ExpoSpeechRecognitionModule.isRecognitionAvailable();
    } catch {
      available = false;
    }
    if (!available) {
      notify('Voice is not available here', 'This browser or device cannot turn speech into text. Type it, or use the microphone on your keyboard.');
      return;
    }
    const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!permission.granted) {
      notify('Voice is switched off', SWITCHED_OFF);
      return;
    }
    heard.current = '';
    ExpoSpeechRecognitionModule.start({ lang: 'en-US', interimResults: true, continuous: false, addsPunctuation: true });
  }

  function stop() {
    ExpoSpeechRecognitionModule.stop();
  }

  return { listening, toggle: () => (listening ? stop() : start()) };
}
