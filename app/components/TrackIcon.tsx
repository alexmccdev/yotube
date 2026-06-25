"use client";

import { useState } from "react";

export default function TrackIcon({
  iconUrl,
  onRegenerate,
}: {
  iconUrl?: string;
  onRegenerate: (keyword?: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [keyword, setKeyword] = useState("");

  const regenerate = async (word?: string) => {
    setEditing(false);
    setRegenerating(true);
    try {
      await onRegenerate(word);
    } finally {
      setRegenerating(false);
      setKeyword("");
    }
  };

  if (editing) {
    return (
      <input
        autoFocus
        className="w-16 font-mono text-[9px] border-b border-brass outline-none bg-transparent text-ink-text"
        value={keyword}
        placeholder="Search icon…"
        onChange={(e) => setKeyword(e.target.value)}
        onBlur={() => setEditing(false)}
        onKeyDown={(e) => {
          if (e.key === "Enter") regenerate(keyword.trim() || undefined);
          if (e.key === "Escape") setEditing(false);
        }}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      disabled={regenerating}
      title={iconUrl ? "Click to search for a different icon" : "Click to find an icon"}
      className="w-8 h-8 shrink-0 rounded-sm border border-ink-text/15 bg-ink-text/5 flex items-center justify-center hover:border-brass transition-colors disabled:opacity-50 overflow-hidden"
    >
      {regenerating ? (
        <span className="font-mono text-[9px] text-ink-text/40">…</span>
      ) : iconUrl ? (
        <img src={iconUrl} alt="" className="w-full h-full" style={{ imageRendering: "pixelated" }} />
      ) : (
        <span className="font-mono text-[9px] text-ink-text/30">+</span>
      )}
    </button>
  );
}
