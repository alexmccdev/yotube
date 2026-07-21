"use client";

import { useState } from "react";
import type { IconCandidate } from "@/lib/yoto-icons";

export default function TrackIcon({
  iconUrl,
  onFetchCandidates,
  onSelect,
  editable = true,
  open,
  onOpenChange,
}: {
  iconUrl?: string;
  onFetchCandidates: (keyword?: string) => Promise<IconCandidate[]>;
  onSelect: (candidate: IconCandidate) => Promise<void>;
  editable?: boolean;
  /** Whether this track's picker is the one currently open — only one can be open at a time, so the parent owns this. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const setOpen = onOpenChange;
  const [loading, setLoading] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [error, setError] = useState<string>();
  const [keyword, setKeyword] = useState("");
  const [candidates, setCandidates] = useState<IconCandidate[]>([]);

  const search = async (word?: string) => {
    setLoading(true);
    setError(undefined);
    try {
      setCandidates(await onFetchCandidates(word));
    } catch (searchError) {
      setCandidates([]);
      setError(searchError instanceof Error ? searchError.message : "Icon search failed");
    } finally {
      setLoading(false);
    }
  };

  const togglePicker = async () => {
    if (!editable) return;
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    setKeyword("");
    await search();
  };

  const pick = async (candidate: IconCandidate) => {
    setSelecting(true);
    try {
      await onSelect(candidate);
    } finally {
      setSelecting(false);
      setOpen(false);
    }
  };

  return (
    <div className={`relative shrink-0 ${open ? "z-[999]" : ""}`}>
      <button
        type="button"
        onClick={togglePicker}
        disabled={!editable}
        aria-label={!editable ? undefined : iconUrl ? "Change track icon" : "Choose track icon"}
        aria-expanded={editable ? open : undefined}
        className={`press flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-ink-text/15 bg-ink-text/5 transition-colors hover:border-brass disabled:opacity-50 disabled:hover:border-ink-text/15 sm:h-8 sm:w-8 ${open ? "z-[999]" : ""}`}
      >
        {iconUrl ? (
          <img src={iconUrl} alt="" className="w-full h-full" style={{ imageRendering: "pixelated" }} />
        ) : (
          <span className="font-mono text-sm text-ink-text/35">+</span>
        )}
      </button>

      {open && (
        <div className="pop-in fixed inset-x-3 bottom-3 z-[999] flex max-h-[70dvh] flex-col gap-3 rounded-md border border-ink-text/15 bg-paper p-4 text-ink-text shadow-2xl sm:absolute sm:inset-x-auto sm:bottom-auto sm:left-0 sm:top-full sm:mt-1 sm:w-60 sm:gap-2 sm:rounded-sm sm:p-3 sm:shadow-xl" style={{ transformOrigin: "top left" }}>
          <div className="flex items-center justify-between sm:hidden">
            <p className="font-display text-lg font-semibold">Choose an icon</p>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close icon picker" className="press flex h-11 w-11 items-center justify-center rounded-sm font-mono text-xl text-ink-text/45 hover:bg-ink-text/5">×</button>
          </div>
          <div className="flex items-center gap-1">
            <input
              autoFocus
              aria-label="Search track icons"
              className="min-h-11 min-w-0 flex-1 border-b border-ink-text/20 bg-transparent px-1 py-1 font-mono text-xs outline-none focus:border-brass sm:min-h-0 sm:text-[11px]"
              placeholder="Search icons"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") search(keyword.trim() || undefined);
                if (e.key === "Escape") setOpen(false);
              }}
            />
            <button
              type="button"
              onClick={() => search(keyword.trim() || undefined)}
              className="min-h-11 shrink-0 rounded-sm bg-ink px-4 py-1 font-mono text-[10px] text-paper transition-colors hover:bg-brass hover:text-ink-text sm:min-h-0 sm:px-2"
            >
              Go
            </button>
          </div>

          {loading ? (
            <p className="py-2 text-center font-mono text-[10px] text-ink-text/40">Searching icons…</p>
          ) : error ? (
            <p role="alert" className="rounded-sm bg-red-700/5 px-2 py-2 text-center font-mono text-[10px] text-red-800">{error}</p>
          ) : candidates.length === 0 ? (
            <p className="py-2 text-center font-mono text-[10px] text-ink-text/40">No matching icons</p>
          ) : (
            <div className="grid max-h-64 grid-cols-6 gap-2 overflow-y-auto sm:max-h-40 sm:grid-cols-5 sm:gap-1">
              {candidates.map((c) => (
                <button
                  key={`${c.source}-${c.id}`}
                  type="button"
                  disabled={selecting}
                  onClick={() => pick(c)}
                  title={c.source === "yoto-library" ? "From Yoto's library" : "From yotoicons.com"}
                  className="press h-11 w-11 overflow-hidden rounded-sm border border-ink-text/10 hover:border-brass disabled:opacity-50 hover:scale-105 sm:h-8 sm:w-8"
                >
                  <img src={c.url} alt="" className="w-full h-full" style={{ imageRendering: "pixelated" }} />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
