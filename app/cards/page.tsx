"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import LoadingDots from "@/app/components/LoadingDots";
import TickerTitle from "@/app/components/TickerTitle";
import YotoConnectStatus from "@/app/components/YotoConnectStatus";
import { catalogNumber, formatDuration } from "@/lib/format";
import { getStatusLine } from "@/lib/stage";

interface Track {
  id: string;
  title?: string;
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
  coverImageUrl?: string;
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

type SortOption = "created-desc" | "created-asc" | "alpha";
type StepFilter = "all" | "editing" | "staged" | "on-yoto";

/** Where a card currently sits in the Created → Editing → Staged → On Yoto pipeline. */
function currentStep(card: Card): Exclude<StepFilter, "all"> {
  if (card.yotoCardId) return "on-yoto";
  if (card.finalized) return "staged";
  return "editing";
}

export default function CardsListPage() {
  const [cards, setCards] = useState<Card[] | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortOption>("created-desc");
  const [step, setStep] = useState<StepFilter>("all");

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

  const normalizedQuery = query.trim().toLowerCase();
  const filteredCards = (cards ?? [])
    .filter((card) => step === "all" || currentStep(card) === step)
    .filter((card) => {
      if (!normalizedQuery) return true;
      if (card.title.toLowerCase().includes(normalizedQuery)) return true;
      return card.tracks.some((track) => track.title?.toLowerCase().includes(normalizedQuery));
    })
    .sort((a, b) => {
      if (sort === "alpha") return a.title.localeCompare(b.title);
      const diff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      return sort === "created-asc" ? diff : -diff;
    });

  return (
    <main className="mx-auto max-w-2xl w-full p-6 sm:p-10 flex flex-col gap-6 file-in">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold text-paper">Library</h1>
        <div className="flex items-center gap-4">
          <YotoConnectStatus />
          <Link
            href="/"
            className="press font-mono text-xs uppercase tracking-wider text-brass hover:text-paper transition-colors inline-block"
          >
            + New card
          </Link>
        </div>
      </div>

      {cards !== null && cards.length > 0 && (
        <div className="flex items-center gap-4">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search title or tracks…"
            className="flex-1 font-mono text-sm bg-transparent text-paper placeholder:text-paper/30 border-b border-paper/20 focus:border-brass outline-none py-1.5 transition-colors"
          />
          <select
            value={step}
            onChange={(e) => setStep(e.target.value as StepFilter)}
            className="font-mono text-xs uppercase tracking-wider bg-transparent text-paper/70 border-b border-paper/20 focus:border-brass outline-none py-1.5 transition-colors shrink-0"
          >
            <option className="bg-ink" value="all">Any step</option>
            <option className="bg-ink" value="editing">Editing</option>
            <option className="bg-ink" value="staged">Staged</option>
            <option className="bg-ink" value="on-yoto">On Yoto</option>
          </select>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortOption)}
            className="font-mono text-xs uppercase tracking-wider bg-transparent text-paper/70 border-b border-paper/20 focus:border-brass outline-none py-1.5 transition-colors shrink-0"
          >
            <option className="bg-ink" value="created-desc">Newest first</option>
            <option className="bg-ink" value="created-asc">Oldest first</option>
            <option className="bg-ink" value="alpha">A–Z</option>
          </select>
        </div>
      )}

      {cards === null && <LoadingDots label="Pulling the catalog…" />}
      {cards?.length === 0 && (
        <p className="font-mono text-sm text-paper/50">
          No cards yet — create one to get started.
        </p>
      )}
      {cards && cards.length > 0 && filteredCards.length === 0 && (
        <p className="font-mono text-sm text-paper/50">
          {normalizedQuery ? `No cards match “${query}”.` : "No cards at this step."}
        </p>
      )}

      <ul className="flex flex-col gap-3">
        {filteredCards.map((card, i) => (
          <li
            key={card.id}
            style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
            className="file-in bg-paper text-ink-text rounded-sm shadow-lg shadow-black/20 border-l-4 border-brass overflow-hidden transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-black/30"
          >
            <div className="flex items-center gap-3 px-4 py-3">
              <div className="w-10 h-14 shrink-0 rounded-sm border border-ink-text/15 bg-ink-text/5 overflow-hidden">
                {card.coverImageUrl ? (
                  <img src={card.coverImageUrl} alt="" className="w-full h-full object-cover" />
                ) : null}
              </div>
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
                    className="press font-mono text-[11px] uppercase tracking-wider px-2.5 py-1 rounded-full bg-brass text-ink-text hover:bg-brass/80 transition-colors"
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
                  className="press font-mono text-ink-text/30 hover:text-red-700 transition-colors px-1"
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
