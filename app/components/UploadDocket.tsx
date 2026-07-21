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
    case "authorizing": return ["Checking Yoto", "Confirming your connection"];
    case "opening": return ["Starting the transfer", "Preparing a secure destination in Yoto"];
    case "streaming": return ["Sending audio", "YouTube → Yoto · nothing stored by Yotube"];
    case "processing": return ["Preparing playback", "The transfer is complete; Yoto is processing the audio"];
    case "publishing": return ["Saving the card", "Adding the cover, icons, and track order"];
    case "complete": return ["Ready in Yoto", "The card and all tracks are available"];
    case "cancelled": return ["Sending stopped", "Completed tracks are saved for the next attempt"];
    case "error": return ["Sending needs attention", progress.message ?? "Try again to continue from the last completed track"];
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
      <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 p-4 sm:grid-cols-[auto_1fr_auto] sm:gap-x-4 sm:p-5">
        <div className="font-display text-3xl sm:text-4xl font-semibold tabular-nums leading-none text-brass">
          {Math.round(progress.overallPercent)}<span className="text-base">%</span>
        </div>
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-text/45">
            {progress.trackIndex ? `Track ${progress.trackIndex} of ${progress.trackCount}` : "Yoto card"}
          </p>
          <h3 className="font-display text-lg font-semibold leading-tight">{heading}</h3>
          <p className="text-xs text-ink-text/50 truncate">{progress.trackTitle ?? detail}</p>
        </div>
        <div className="col-span-2 flex justify-between font-mono text-[10px] uppercase tracking-wider text-ink-text/40 tabular-nums sm:col-span-1 sm:block sm:text-right">
          <span className="block">Elapsed</span>
          <span className="text-ink-text/70">{formatElapsed(elapsedMs)}</span>
        </div>
        <div className="col-span-2 h-2 overflow-hidden rounded-full bg-ink-text/10 sm:col-span-3" role="progressbar" aria-label="Overall card progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress.overallPercent)}>
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
            Checking Yoto{progress.processingAttempt ? ` · ${progress.processingAttempt}` : ""}
          </span>
        ) : null}
        <span className="normal-case tracking-normal text-ink-text/45">{detail}</span>
        {active && onCancel ? (
          <button type="button" onClick={onCancel} className="press ml-auto min-h-11 px-2 uppercase tracking-wider text-ink-text/45 hover:text-red-700 sm:min-h-0">Stop</button>
        ) : null}
      </div>
    </section>
  );
}
