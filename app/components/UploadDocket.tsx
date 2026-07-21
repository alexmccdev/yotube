"use client";

export type UploadPhase =
  | "authorizing"
  | "opening"
  | "streaming"
  | "processing"
  | "publishing"
  | "complete"
  | "error"
  | "cancelled";

export interface UploadDocketState {
  phase: UploadPhase;
  overallPercent: number;
  transferPercent?: number;
  trackIndex?: number;
  trackCount: number;
  trackTitle?: string;
  bytesTransferred?: number;
  totalBytes?: number;
  processingAttempt?: number;
  message?: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1_000_000) return `${(bytes / 1_000).toFixed(0)} KB`;
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

function formatElapsed(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  return minutes ? `${minutes}:${String(seconds % 60).padStart(2, "0")}` : `${seconds}s`;
}

function phaseCopy(progress: UploadDocketState) {
  switch (progress.phase) {
    case "authorizing": return ["Checking the route", "Confirming your Yoto session"];
    case "opening": return ["Opening the line", "Yoto issued a direct upload destination"];
    case "streaming": return ["Audio in transit", "YouTube → Yoto · nothing staged here"];
    case "processing": return ["Yoto is processing", "The transfer is complete; Yoto is preparing playback"];
    case "publishing": return ["Filing the card", "Assigning the cover, icons, and ordered tracks"];
    case "complete": return ["Filed on Yoto", "The full route completed"];
    case "cancelled": return ["Route stopped", "Completed Yoto media remains checkpointed"];
    case "error": return ["Route needs attention", progress.message ?? "Retry to continue from the last checkpoint"];
  }
}

export default function UploadDocket({
  progress,
  elapsedMs,
  onCancel,
}: {
  progress: UploadDocketState;
  elapsedMs: number;
  onCancel?: () => void;
}) {
  const [heading, detail] = phaseCopy(progress);
  const active = !["complete", "error", "cancelled"].includes(progress.phase);
  return (
    <section aria-live="polite" aria-label="Upload progress" className="pop-in border border-ink-text/15 bg-ink-text/[0.04] rounded-sm overflow-hidden">
      <div className="grid grid-cols-[auto_1fr_auto] gap-x-4 gap-y-2 items-center p-4 sm:p-5">
        <div className="font-display text-3xl sm:text-4xl font-semibold tabular-nums leading-none text-brass">
          {Math.round(progress.overallPercent)}<span className="text-base">%</span>
        </div>
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-text/45">
            {progress.trackIndex ? `Track ${progress.trackIndex} of ${progress.trackCount}` : "Card route"}
          </p>
          <h3 className="font-display text-lg font-semibold leading-tight">{heading}</h3>
          <p className="text-xs text-ink-text/50 truncate">{progress.trackTitle ?? detail}</p>
        </div>
        <div className="text-right font-mono text-[10px] uppercase tracking-wider text-ink-text/40 tabular-nums">
          <span className="block">Elapsed</span>
          <span className="text-ink-text/70">{formatElapsed(elapsedMs)}</span>
        </div>
        <div className="col-span-3 h-2 bg-ink-text/10 rounded-full overflow-hidden" role="progressbar" aria-label="Overall card progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress.overallPercent)}>
          <div className="h-full bg-brass transition-[width] duration-300 ease-out" style={{ width: `${progress.overallPercent}%` }} />
        </div>
      </div>

      <div className="border-t border-ink-text/10 px-4 sm:px-5 py-3 flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[10px] uppercase tracking-wider text-ink-text/45">
        {progress.phase === "streaming" && progress.transferPercent !== undefined ? (
          <>
            <span className="text-ink-text/75">Transfer {progress.transferPercent}%</span>
            <span>{formatBytes(progress.bytesTransferred ?? 0)} / {formatBytes(progress.totalBytes ?? 0)}</span>
          </>
        ) : null}
        {progress.phase === "processing" ? (
          <span className="flex items-center gap-2 text-ink-text/75">
            <span className="h-1.5 w-1.5 rounded-full bg-brass animate-pulse" />
            Waiting for Yoto{progress.processingAttempt ? ` · check ${progress.processingAttempt}` : ""}
          </span>
        ) : null}
        <span className="normal-case tracking-normal text-ink-text/45">{detail}</span>
        {active && onCancel ? (
          <button type="button" onClick={onCancel} className="press ml-auto uppercase tracking-wider text-ink-text/45 hover:text-red-700">Stop</button>
        ) : null}
      </div>
    </section>
  );
}
