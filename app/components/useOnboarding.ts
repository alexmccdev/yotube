"use client";

import { useCallback, useSyncExternalStore } from "react";
import { loadOnboardingState, saveOnboardingState, type OnboardingState } from "@/lib/onboarding";

const SERVER_STATE: OnboardingState = { hintViews: {} };
const noopSubscribe = () => () => {};

/** True once the component has mounted client-side — guards against SSR hydration
 *  mismatches for anything that reads localStorage. */
export function useMounted(): boolean {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

const listeners = new Set<() => void>();
let cached: OnboardingState | null = null;

function getSnapshot(): OnboardingState {
  if (cached === null) cached = loadOnboardingState();
  return cached;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function commit(next: OnboardingState) {
  cached = next;
  saveOnboardingState(next);
  for (const listener of listeners) listener();
}

export function useOnboardingState() {
  const mounted = useMounted();
  const state = useSyncExternalStore(subscribe, getSnapshot, () => SERVER_STATE);

  const noteHintView = useCallback((key: string) => {
    const prev = getSnapshot();
    commit({ ...prev, hintViews: { ...prev.hintViews, [key]: (prev.hintViews[key] ?? 0) + 1 } });
  }, []);

  const hideHint = useCallback((key: string) => {
    const prev = getSnapshot();
    commit({ ...prev, hintViews: { ...prev.hintViews, [key]: Number.MAX_SAFE_INTEGER } });
  }, []);

  return { mounted, state, noteHintView, hideHint };
}
