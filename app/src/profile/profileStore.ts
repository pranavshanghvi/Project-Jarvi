import AsyncStorage from '@react-native-async-storage/async-storage';

export type Sex = 'male' | 'female';

// dateOfBirth is a local calendar day, YYYY-MM-DD. Together with sex and height it lets us
// estimate how many calories the body burns at rest.
export interface Profile {
  dateOfBirth: string;
  sex: Sex;
  heightCm: number;
}

const KEY = 'jarvi.profile';

function isProfile(value: any): value is Profile {
  return (
    !!value &&
    typeof value.dateOfBirth === 'string' &&
    (value.sex === 'male' || value.sex === 'female') &&
    typeof value.heightCm === 'number'
  );
}

// A damaged or missing value just means "no profile yet", never a crash.
export async function getProfile(): Promise<Profile | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return isProfile(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function saveProfile(profile: Profile): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(profile));
}
