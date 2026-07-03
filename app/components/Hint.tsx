"use client";

import { useEffect } from "react";
import { useOnboardingState } from "@/app/components/useOnboarding";

/** A contextual tip that fades away after `maxViews` renders per `hintKey` — the
 *  "less and less guidance" mechanism for first-time users. Renders nothing once
 *  the view cap is reached, and nothing until mounted (avoids hydration mismatch). */
export default function Hint({
  hintKey,
  maxViews = 3,
  children,
}: {
  hintKey: string;
  maxViews?: number;
  children: React.ReactNode;
}) {
  const { mounted, state, noteHintView, hideHint } = useOnboardingState();
  const views = state.hintViews[hintKey] ?? 0;
  const seen = views < maxViews;

  useEffect(() => {
    if (mounted && seen) noteHintView(hintKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, hintKey]);

  if (!mounted || !seen) return null;

  return (
    <div className="pop-in relative flex items-start gap-2 border-l-2 border-brass bg-brass/10 rounded-sm px-3 py-2 text-sm text-ink-text/70">
      <span className="flex-1">{children}</span>
      <button
        type="button"
        aria-label="Dismiss hint"
        title="Dismiss"
        onClick={() => hideHint(hintKey)}
        className="press shrink-0 font-mono text-xs text-ink-text/30 hover:text-red-700 transition-colors"
      >
        ✕
      </button>
    </div>
  );
}
