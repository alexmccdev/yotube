const STORAGE_KEY = "yotube:onboarding:v1";

export interface OnboardingState {
  hintViews: Record<string, number>;
}

const DEFAULT_STATE: OnboardingState = {
  hintViews: {},
};

export function loadOnboardingState(): OnboardingState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_STATE };
    const parsed = JSON.parse(raw);
    return {
      hintViews: typeof parsed?.hintViews === "object" && parsed?.hintViews !== null ? parsed.hintViews : {},
    };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

export function saveOnboardingState(state: OnboardingState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // localStorage unavailable or quota exceeded — onboarding state just won't persist.
  }
}
