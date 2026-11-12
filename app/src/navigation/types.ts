import { TabName } from '../ui/kit';
import { DetectedFoodItem } from '../types/nutrition';

// A meal that has been read from a photo but not saved yet.
export interface MealDraft {
  photoUri: string;
  items: DetectedFoodItem[];
  takenAt?: number; // when the photo was taken, if known
  glassesPhotoId?: string;
}

export type RootStackParamList = {
  Tabs: undefined;
  Tutorial: { thenOnboard?: boolean } | undefined;
  MealDetail: { entryId?: number; draft?: MealDraft };
  GlassesImport: undefined;
  Profile: { onboarding?: boolean } | undefined;
  Goals: undefined;
  Weight: undefined;
};

// The handful of places a screen can send you. Passed down so screens do not each need to know
// how navigation is wired.
export interface AppNav {
  goTab: (tab: TabName) => void;
  openDay: (date: Date) => void;
  openMeal: (entryId: number) => void;
  openProfile: () => void;
  openGoals: () => void;
  openWeight: () => void;
  openTutorial: () => void;
}
