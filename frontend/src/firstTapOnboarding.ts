export const FIRST_TAP_ONBOARDING_STORAGE_KEY = 'onixTutorialDone';

type OnboardingStorage = {
  setItem: (key: string, value: string) => void;
};

export function shouldShowFirstTapCoachmark(storedValue: string | null) {
  return storedValue !== 'true';
}

export function markFirstTapOnboardingComplete(storage: OnboardingStorage) {
  storage.setItem(FIRST_TAP_ONBOARDING_STORAGE_KEY, 'true');
}
