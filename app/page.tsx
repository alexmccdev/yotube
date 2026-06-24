"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import YotoConnectStatus from "@/app/components/YotoConnectStatus";
import { extractVideoId, normalizeYoutubeInput } from "@/lib/validate";

interface Row {
  id: number;
  url: string;
}

interface ExistingTrack {
  videoId: string;
  cardTitle: string;
}

interface Lookup {
  status: "loading" | "done" | "error";
  title?: string;
  error?: string;
}

let nextRowId = 1;

export default function NewCardPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [rows, setRows] = useState<Row[]>([{ id: nextRowId++, url: "" }]);
  const [lookups, setLookups] = useState<Record<number, Lookup>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existingTracks, setExistingTracks] = useState<ExistingTrack[]>([]);
  const debounceTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    const timers = debounceTimers.current;
    return () => {
      Object.values(timers).forEach(clearTimeout);
    };
  }, []);

  useEffect(() => {
    fetch("/api/cards")
      .then((res) => res.json())
      .then((cards: { title: string; tracks: { url: string }[] }[]) => {
        const tracks: ExistingTrack[] = [];
        for (const card of cards) {
          for (const track of card.tracks) {
            const videoId = extractVideoId(track.url);
            if (videoId) tracks.push({ videoId, cardTitle: card.title });
          }
        }
        setExistingTracks(tracks);
      })
      .catch(() => setExistingTracks([]));
  }, []);

  const duplicateWarning = (rowId: number, value: string): string | undefined => {
    const videoId = extractVideoId(value);
    if (!videoId) return undefined;
    const existing = existingTracks.find((t) => t.videoId === videoId);
    if (existing) return `Already in "${existing.cardTitle}"`;
    const dupeRow = rows.find((r) => r.id !== rowId && extractVideoId(r.url) === videoId);
    if (dupeRow) return "Duplicate of another track above";
    return undefined;
  };

  const lookupTitle = async (rowId: number, normalizedUrl: string) => {
    setLookups((prev) => ({ ...prev, [rowId]: { status: "loading" } }));
    try {
      const res = await fetch("/api/youtube-metadata", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: normalizedUrl }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Lookup failed");
      setLookups((prev) => ({ ...prev, [rowId]: { status: "done", title: body.title } }));
    } catch (err) {
      setLookups((prev) => ({
        ...prev,
        [rowId]: { status: "error", error: err instanceof Error ? err.message : "Lookup failed" },
      }));
    }
  };

  const updateUrl = (rowId: number, value: string) => {
    setRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, url: value } : r)));

    clearTimeout(debounceTimers.current[rowId]);
    const normalized = normalizeYoutubeInput(value);
    if (!normalized) {
      setLookups((prev) => {
        const next = { ...prev };
        delete next[rowId];
        return next;
      });
      return;
    }
    debounceTimers.current[rowId] = setTimeout(() => lookupTitle(rowId, normalized), 400);
  };

  const addRow = () => setRows((prev) => [...prev, { id: nextRowId++, url: "" }]);
  const removeRow = (rowId: number) => {
    setRows((prev) => prev.filter((r) => r.id !== rowId));
    setLookups((prev) => {
      const next = { ...prev };
      delete next[rowId];
      return next;
    });
  };

  /** Pasting a block of several links splits them into one row each. */
  const handlePaste = (rowId: number, e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData("text");
    const candidates = pasted.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
    const ids = candidates.map(extractVideoId).filter((id): id is string => Boolean(id));
    if (ids.length === 0) return;
    e.preventDefault();

    const urls = ids.map((id) => `https://www.youtube.com/watch?v=${id}`);
    updateUrl(rowId, urls[0]);

    if (urls.length > 1) {
      const newRows = urls.slice(1).map((url) => ({ id: nextRowId++, url }));
      setRows((prev) => {
        const idx = prev.findIndex((r) => r.id === rowId);
        const next = [...prev];
        next.splice(idx + 1, 0, ...newRows);
        return next;
      });
      newRows.forEach((row) => lookupTitle(row.id, row.url));
    }
  };

  const submit = async () => {
    setError(null);
    const cleanUrls = rows.map((r) => r.url.trim()).filter(Boolean);
    if (!title.trim()) {
      setError("Card title is required");
      return;
    }
    if (cleanUrls.length === 0) {
      setError("Add at least one YouTube URL");
      return;
    }

    setSubmitting(true);
    try {
      const cardRes = await fetch("/api/cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (!cardRes.ok) throw new Error("Failed to create card");
      const card = await cardRes.json();

      for (const url of cleanUrls) {
        const res = await fetch(`/api/cards/${card.id}/tracks`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `Invalid URL: ${url}`);
        }
      }

      router.push(`/cards/${card.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  };

  return (
    <main className="mx-auto max-w-2xl w-full p-6 sm:p-10 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs uppercase tracking-wider text-brass">Yotube</span>
        <div className="flex items-center gap-4">
          <YotoConnectStatus />
          <Link
            href="/cards"
            className="font-mono text-xs uppercase tracking-wider text-paper/70 hover:text-brass transition-colors"
          >
            Library →
          </Link>
        </div>
      </div>

      <div className="bg-paper text-ink-text rounded-sm shadow-xl shadow-black/30 overflow-hidden">
        <div className="border-l-4 border-brass px-6 sm:px-8 pt-6 pb-7 flex flex-col gap-6">
          <div className="flex flex-col gap-1">
            <div className="font-mono text-[11px] uppercase tracking-wider text-ink-text/40">
              Draft
            </div>
            <h1 className="font-display text-3xl font-semibold leading-tight">
              New library entry
            </h1>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="font-mono text-[11px] uppercase tracking-wider text-ink-text/60">
              Card title
            </label>
            <input
              className="font-display border-b-2 border-ink-text/15 focus:border-brass outline-none bg-transparent py-1.5 text-xl placeholder:text-ink-text/30 placeholder:font-sans transition-colors"
              placeholder="Bedtime Stories Vol. 1"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-3 pt-2 border-t border-ink-text/10">
            <div className="pt-1">
              <label className="font-mono text-[11px] uppercase tracking-wider text-ink-text/60">
                Tracks
              </label>
              <p className="text-sm text-ink-text/50 mt-0.5">
                Paste a YouTube link or video ID — drop in several at once, one per line.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              {rows.map((row, i) => {
                const lookup = lookups[row.id];
                const warning = duplicateWarning(row.id, row.url);
                return (
                  <div key={row.id} className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-ink-text/40 w-5 shrink-0 tabular-nums">
                        {i + 1}
                      </span>
                      <input
                        className="flex-1 border-b border-ink-text/15 focus:border-brass outline-none bg-transparent py-1 placeholder:text-ink-text/30 transition-colors"
                        placeholder="youtube.com/watch?v=... or jNQXAC9IVRw"
                        value={row.url}
                        onChange={(e) => updateUrl(row.id, e.target.value)}
                        onPaste={(e) => handlePaste(row.id, e)}
                      />
                      {rows.length > 1 && (
                        <button
                          type="button"
                          aria-label="Remove track"
                          className="font-mono text-xs text-ink-text/40 hover:text-red-700 transition-colors"
                          onClick={() => removeRow(row.id)}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                    {warning ? (
                      <p className="font-mono text-xs pl-7 text-amber-700">⚠ {warning}</p>
                    ) : (
                      lookup && (
                        <p className="font-mono text-xs pl-7 truncate">
                          {lookup.status === "loading" && (
                            <span className="text-ink-text/40">Looking up…</span>
                          )}
                          {lookup.status === "done" && (
                            <span className="text-ink-text/60">→ {lookup.title}</span>
                          )}
                          {lookup.status === "error" && (
                            <span className="text-red-700">{lookup.error}</span>
                          )}
                        </p>
                      )
                    )}
                  </div>
                );
              })}
            </div>
            <button
              type="button"
              className="self-start font-mono text-xs uppercase tracking-wider text-ink-text/60 hover:text-brass transition-colors"
              onClick={addRow}
            >
              + Add another track
            </button>
          </div>

          {error && <p className="text-sm text-red-700">{error}</p>}

          <button
            type="button"
            disabled={submitting}
            onClick={submit}
            className="self-start bg-ink text-paper font-mono text-sm uppercase tracking-wider px-5 py-2.5 rounded-sm hover:bg-brass hover:text-ink-text transition-colors disabled:opacity-50"
          >
            {submitting ? "Creating…" : "Create card →"}
          </button>
        </div>
      </div>
    </main>
  );
}
