"use client";

import { useCallback, useSyncExternalStore } from "react";

interface YotoStatus {
  connected: boolean | null;
  error: string | null;
}

const SERVER_SNAPSHOT: YotoStatus = { connected: null, error: null };
const POLL_MS = 5000;

let snapshot: YotoStatus = { connected: null, error: null };
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function notify() {
  for (const listener of listeners) listener();
}

function setSnapshot(next: Partial<YotoStatus>) {
  snapshot = { ...snapshot, ...next };
  notify();
}

async function fetchStatus() {
  try {
    const res = await fetch("/api/yoto/status");
    const body = await res.json();
    setSnapshot({ connected: Boolean(body.connected), error: body.error ?? null });
  } catch {
    setSnapshot({ connected: false, error: null });
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Tied to subscriber count (not module load) so the interval is torn down when the
  // last consumer unmounts — a module-scope `setInterval` survives dev-mode Fast Refresh
  // reloads uncleared, and they stack up across edits until requests visibly back up.
  if (listeners.size === 1) {
    fetchStatus();
    timer = setInterval(fetchStatus, POLL_MS);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

function getSnapshot(): YotoStatus {
  return snapshot;
}

/** Shared, polling Yoto-connection status. Every consumer reads the same live value, so
 *  connecting from one part of the UI (e.g. the getting-started banner) is reflected
 *  everywhere else (header pill, card detail page) without a manual refresh. */
export function useYotoStatus() {
  const state = useSyncExternalStore(subscribe, getSnapshot, () => SERVER_SNAPSHOT);
  const setConnected = useCallback((connected: boolean) => {
    setSnapshot({ connected, error: null });
  }, []);
  return { ...state, setConnected };
}
