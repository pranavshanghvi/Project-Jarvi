jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

import AsyncStorage from '@react-native-async-storage/async-storage';
import { getProfile, saveProfile } from './profileStore';

beforeEach(() => AsyncStorage.clear());

describe('profileStore', () => {
  it('is empty until saved, then returns what was saved', async () => {
    expect(await getProfile()).toBeNull();
    await saveProfile({ dateOfBirth: '1985-03-09', sex: 'male', heightCm: 178 });
    expect(await getProfile()).toEqual({ dateOfBirth: '1985-03-09', sex: 'male', heightCm: 178 });
  });

  it('treats damaged data as no profile', async () => {
    await AsyncStorage.setItem('jarvi.profile', '{not json');
    expect(await getProfile()).toBeNull();
    await AsyncStorage.setItem('jarvi.profile', JSON.stringify({ sex: 'other' }));
    expect(await getProfile()).toBeNull();
  });
});
