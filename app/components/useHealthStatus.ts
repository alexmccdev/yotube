"use client";

import { useSyncExternalStore } from "react";

interface HealthStatus {
  ytDlpOk: boolean | null;
  ffmpegOk: boolean | null;
}

const SERVER_SNAPSHOT: HealthStatus = { ytDlpOk: null, ffmpegOk: null };
const POLL_MS = 5000;

let snapshot: HealthStatus = { ytDlpOk: null, ffmpegOk: null };
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function notify() {
  for (const listener of listeners) listener();
}

function stopPolling() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

async function fetchHealth() {
  try {
    const res = await fetch("/api/health");
    const body = await res.json();
    snapshot = { ytDlpOk: Boolean(body.ytDlpOk), ffmpegOk: Boolean(body.ffmpegOk) };
  } catch {
    snapshot = { ytDlpOk: false, ffmpegOk: false };
  }
  notify();
  // Both binaries present — stop polling, nothing left to watch for this session.
  if (snapshot.ytDlpOk && snapshot.ffmpegOk) stopPolling();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Tied to subscriber count so it's cleaned up on unmount (and on every dev-mode Fast
  // Refresh reload) — a module-scope-only interval would stack up across edits instead.
  if (listeners.size === 1 && !timer && !(snapshot.ytDlpOk && snapshot.ffmpegOk)) {
    fetchHealth();
    timer = setInterval(fetchHealth, POLL_MS);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) stopPolling();
  };
}

function getSnapshot(): HealthStatus {
  return snapshot;
}

/** Shared, polling yt-dlp/ffmpeg presence check — spawning both binaries with `--version`
 *  takes ~150-170ms, so this is deduped across the dependency banner and the getting-started
 *  checklist rather than each polling `/api/health` independently. */
export function useHealthStatus() {
  return useSyncExternalStore(subscribe, getSnapshot, () => SERVER_SNAPSHOT);
}
