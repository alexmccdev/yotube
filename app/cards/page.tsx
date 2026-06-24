"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import TickerTitle from "@/app/components/TickerTitle";
import YotoConnectStatus from "@/app/components/YotoConnectStatus";
import { catalogNumber, formatDuration } from "@/lib/format";
import { getStatusLine } from "@/lib/stage";

interface Track {
  id: string;
  status: string;
  duration?: number;
}

interface Card {
  id: string;
  title: string;
  tracks: Track[];
  finalized: boolean;
  outputDir?: string;
  createdAt: string;
  yotoCardId?: string;
  pushingToYoto?: boolean;
}

function totalDuration(tracks: Track[]): number {
  return tracks.reduce((sum, track) => sum + (track.duration ?? 0), 0);
}

const DOT_TONE: Record<string, string> = {
  idle: "bg-ink-text/30",
  active: "bg-brass animate-pulse",
  done: "bg-brass",
  error: "bg-red-600",
};

function StatusLine({ card }: { card: Card }) {
  const { text, tone } = getStatusLine(card);
  return (
    <span className="font-mono text-[11px] text-ink-text/50 flex items-center gap-1.5 whitespace-nowrap">
      <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${DOT_TONE[tone]}`} />
      {text}
    </span>
  );
}

export default function CardsListPage() {
  const [cards, setCards] = useState<Card[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      const res = await fetch("/api/cards");
      if (!cancelled && res.ok) setCards(await res.json());
    };
    poll();
    const interval = setInterval(poll, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const deleteCard = async (card: Card) => {
    if (!window.confirm(`Delete "${card.title}"? This can't be undone.`)) return;
    setCards((prev) => prev?.filter((c) => c.id !== card.id) ?? prev);
    await fetch(`/api/cards/${card.id}`, { method: "DELETE" });
  };

  return (
    <main className="mx-auto max-w-2xl w-full p-6 sm:p-10 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold text-paper">Library</h1>
        <div className="flex items-center gap-4">
          <YotoConnectStatus />
          <Link
            href="/"
            className="font-mono text-xs uppercase tracking-wider text-brass hover:text-paper transition-colors"
          >
            + New card
          </Link>
        </div>
      </div>

      {cards === null && (
        <p className="font-mono text-sm text-paper/50">Loading…</p>
      )}
      {cards?.length === 0 && (
        <p className="font-mono text-sm text-paper/50">
          No cards yet — create one to get started.
        </p>
      )}

      <ul className="flex flex-col gap-3">
        {cards?.map((card) => (
          <li
            key={card.id}
            className="bg-paper text-ink-text rounded-sm shadow-lg shadow-black/20 border-l-4 border-brass overflow-hidden"
          >
            <div className="flex items-center gap-3 px-4 py-3">
              <div className="flex-1 min-w-0">
                <div className="font-mono text-[11px] uppercase tracking-wider text-ink-text/40">
                  No. {catalogNumber(card.id)}
                </div>
                <TickerTitle
                  href={`/cards/${card.id}`}
                  title={card.title}
                  className="font-display text-lg font-semibold leading-snug hover:text-brass transition-colors"
                />
                <div className="font-mono text-[11px] text-ink-text/40 tabular-nums">
                  {card.tracks.length} track{card.tracks.length === 1 ? "" : "s"}
                  {totalDuration(card.tracks) > 0 && ` · ${formatDuration(totalDuration(card.tracks))}`}
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {card.yotoCardId ? (
                  <a
                    href={`https://my.yotoplay.com/card/${card.yotoCardId}/edit`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="font-mono text-[11px] uppercase tracking-wider px-2.5 py-1 rounded-full bg-brass text-ink-text hover:bg-brass/80 transition-colors"
                  >
                    On Yoto ↗
                  </a>
                ) : (
                  <StatusLine card={card} />
                )}
                <button
                  type="button"
                  onClick={() => deleteCard(card)}
                  aria-label="Delete card"
                  title="Delete card"
                  className="font-mono text-ink-text/30 hover:text-red-700 transition-colors px-1"
                >
                  ✕
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
