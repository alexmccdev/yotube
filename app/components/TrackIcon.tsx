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
  const [keyword, setKeyword] = useState("");
  const [candidates, setCandidates] = useState<IconCandidate[]>([]);

  const search = async (word?: string) => {
    setLoading(true);
    try {
      setCandidates(await onFetchCandidates(word));
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
        className={`press flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-ink-text/15 bg-ink-text/5 transition-colors hover:border-brass disabled:opacity-50 disabled:hover:border-ink-text/15 ${open ? "z-[999]" : ""}`}
      >
        {iconUrl ? (
          <img src={iconUrl} alt="" className="w-full h-full" style={{ imageRendering: "pixelated" }} />
        ) : (
          <span className="font-mono text-sm text-ink-text/35">+</span>
        )}
      </button>

      {open && (
        <div className="pop-in absolute left-0 top-full z-[999] mt-1 flex w-60 flex-col gap-2 rounded-sm border border-ink-text/15 bg-paper p-3 text-ink-text shadow-xl" style={{ transformOrigin: "top left" }}>
          <div className="flex items-center gap-1">
            <input
              autoFocus
              aria-label="Search track icons"
              className="flex-1 border-b border-ink-text/20 bg-transparent px-0.5 py-1 font-mono text-[11px] outline-none focus:border-brass"
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
              className="shrink-0 rounded-sm bg-ink px-2 py-1 font-mono text-[10px] text-paper transition-colors hover:bg-brass hover:text-ink-text"
            >
              Go
            </button>
          </div>

          {loading ? (
            <p className="py-2 text-center font-mono text-[10px] text-ink-text/40">Searching icons…</p>
          ) : candidates.length === 0 ? (
            <p className="py-2 text-center font-mono text-[10px] text-ink-text/40">No matching icons</p>
          ) : (
            <div className="grid grid-cols-5 gap-1 max-h-40 overflow-y-auto">
              {candidates.map((c) => (
                <button
                  key={`${c.source}-${c.id}`}
                  type="button"
                  disabled={selecting}
                  onClick={() => pick(c)}
                  title={c.source === "yoto-library" ? "From Yoto's library" : "From yotoicons.com"}
                  className="press w-8 h-8 rounded-sm border border-ink-text/10 hover:border-brass overflow-hidden disabled:opacity-50 hover:scale-105"
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
