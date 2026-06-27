"use client";

import { useEffect, useRef, useState } from "react";
import type { IconCandidate } from "@/lib/yoto-icons";

export default function TrackIcon({
  iconUrl,
  onFetchCandidates,
  onSelect,
  editable = true,
}: {
  iconUrl?: string;
  onFetchCandidates: (keyword?: string) => Promise<IconCandidate[]>;
  onSelect: (candidate: IconCandidate) => Promise<void>;
  editable?: boolean;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
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
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) setPosition({ top: rect.bottom + 4, left: rect.left });
    setOpen(true);
    setKeyword("");
    await search();
  };

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

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
    <div className="relative shrink-0">
      <button
        ref={buttonRef}
        type="button"
        onClick={togglePicker}
        disabled={!editable}
        title={!editable ? undefined : iconUrl ? "Click to change icon" : "Click to find an icon"}
        className="press w-8 h-8 shrink-0 rounded-sm border border-ink-text/15 bg-ink-text/5 flex items-center justify-center hover:border-brass transition-colors disabled:opacity-50 disabled:hover:border-ink-text/15 overflow-hidden"
      >
        {iconUrl ? (
          <img src={iconUrl} alt="" className="w-full h-full" style={{ imageRendering: "pixelated" }} />
        ) : (
          <span className="font-mono text-[9px] text-ink-text/30">+</span>
        )}
      </button>

      {open && (
        <div
          className="pop-in fixed z-50 w-56 bg-paper text-ink-text border border-ink-text/15 rounded-sm shadow-xl p-2 flex flex-col gap-2"
          style={{ top: position.top, left: position.left, transformOrigin: "top left" }}
        >
          <div className="flex items-center gap-1">
            <input
              autoFocus
              className="flex-1 font-mono text-[10px] border-b border-ink-text/20 focus:border-brass outline-none bg-transparent px-0.5"
              placeholder="Search icon…"
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
              className="font-mono text-[10px] uppercase text-ink-text/50 hover:text-brass transition-colors shrink-0"
            >
              Go
            </button>
          </div>

          {loading ? (
            <p className="font-mono text-[10px] text-ink-text/40 text-center py-2">Searching…</p>
          ) : candidates.length === 0 ? (
            <p className="font-mono text-[10px] text-ink-text/40 text-center py-2">No matches</p>
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
