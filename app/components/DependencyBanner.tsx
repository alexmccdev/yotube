"use client";

import { useState } from "react";
import { useHealthStatus } from "@/app/components/useHealthStatus";

const SESSION_KEY = "yotube:dependency-banner-dismissed";

/** Slim, non-blocking banner warning when yt-dlp/ffmpeg aren't on PATH. Independent of
 *  the onboarding checklist — reappears next session even if dismissed, since a missing
 *  binary breaks every download until fixed. */
export default function DependencyBanner() {
  const { ytDlpOk, ffmpegOk } = useHealthStatus();
  const [dismissed, setDismissed] = useState(
    () => typeof window !== "undefined" && sessionStorage.getItem(SESSION_KEY) === "1",
  );

  if (ytDlpOk === null || ffmpegOk === null || dismissed) return null;
  const missing = [!ytDlpOk && "yt-dlp", !ffmpegOk && "ffmpeg"].filter(Boolean) as string[];
  if (missing.length === 0) return null;

  const dismiss = () => {
    sessionStorage.setItem(SESSION_KEY, "1");
    setDismissed(true);
  };

  return (
    <div className="pop-in flex items-center justify-center gap-3 bg-red-900/40 text-paper/90 border-b border-red-700/40 px-4 py-2 text-sm font-mono">
      <span>
        Missing {missing.join(" and ")} — run{" "}
        <code className="text-brass">brew install {missing.join(" ")}</code>
      </span>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        title="Dismiss for this session"
        className="press text-paper/40 hover:text-paper transition-colors"
      >
        ✕
      </button>
    </div>
  );
}
