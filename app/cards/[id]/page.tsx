"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import CoverImageField from "@/app/components/CoverImageField";
import StageRail from "@/app/components/StageRail";
import StatusPill from "@/app/components/StatusPill";
import TrackIcon from "@/app/components/TrackIcon";
import TrackTitleField from "@/app/components/TrackTitleField";
import { catalogNumber, formatDuration } from "@/lib/format";
import { getCardStages } from "@/lib/stage";
import { type TrackStatus } from "@/lib/track-status";
import { extractVideoId } from "@/lib/validate";

interface Track {
  id: string;
  url: string;
  title: string;
  status: TrackStatus;
  error?: string;
  duration?: number;
  iconUrl?: string;
}

interface Card {
  id: string;
  title: string;
  tracks: Track[];
  finalized: boolean;
  outputDir?: string;
  yotoCardId?: string;
  pushingToYoto?: boolean;
  pushError?: string;
  coverImageUrl?: string;
}

export default function CardStatusPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const cardId = params.id;
  const [card, setCard] = useState<Card | null>(null);
  const [finalizing, setFinalizing] = useState(false);
  const [finalizeError, setFinalizeError] = useState<string | null>(null);
  const [unstaging, setUnstaging] = useState(false);
  const [yotoConnected, setYotoConnected] = useState<boolean | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [newTrackUrl, setNewTrackUrl] = useState("");
  const [addingTrack, setAddingTrack] = useState(false);
  const dragIndex = useRef<number | null>(null);
  const cardRef = useRef<Card | null>(null);
  cardRef.current = card;

  useEffect(() => {
    fetch("/api/yoto/status")
      .then((res) => res.json())
      .then((body) => setYotoConnected(body.connected))
      .catch(() => setYotoConnected(false));
  }, []);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      const res = await fetch(`/api/cards/${cardId}`);
      if (!cancelled && res.ok) setCard(await res.json());
    };
    poll();
    const interval = setInterval(poll, 1500);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [cardId]);

  useEffect(() => {
    const isBlank = (c: Card) =>
      c.tracks.length === 0 && !c.finalized && !c.coverImageUrl && c.title.trim() === "Untitled card";
    const cleanupIfBlank = () => {
      const c = cardRef.current;
      if (c && isBlank(c)) {
        fetch(`/api/cards/${c.id}`, { method: "DELETE", keepalive: true });
      }
    };
    window.addEventListener("pagehide", cleanupIfBlank);
    return () => {
      window.removeEventListener("pagehide", cleanupIfBlank);
      cleanupIfBlank();
    };
  }, []);

  if (!card) {
    return (
      <main className="mx-auto max-w-2xl w-full p-6 sm:p-10 flex flex-col gap-6">
        <Link
          href="/cards"
          className="font-mono text-xs uppercase tracking-wider text-paper/70 hover:text-brass self-start transition-colors"
        >
          ← Library
        </Link>
        <p className="font-mono text-sm text-paper/50">Loading…</p>
      </main>
    );
  }

  const locked = card.finalized;
  const allReady = card.tracks.length > 0 && card.tracks.every((t) => t.status === "ready");
  const notReadyCount = card.tracks.filter((t) => t.status !== "ready").length;
  const totalDuration = card.tracks.reduce((sum, t) => sum + (t.duration ?? 0), 0);
  const hasAnyDuration = card.tracks.some((t) => t.duration !== undefined);
  const stages = getCardStages(card);

  const commitCardTitle = async () => {
    setEditingTitle(false);
    const title = titleDraft.trim() || "Untitled card";
    if (title === card.title) return;
    setCard((prev) => (prev ? { ...prev, title } : prev));
    await fetch(`/api/cards/${cardId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
  };

  const addTrackUrl = async (url: string) => {
    const res = await fetch(`/api/cards/${cardId}/tracks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    if (res.ok) {
      const track = await res.json();
      setCard((prev) => (prev ? { ...prev, tracks: [...prev.tracks, track] } : prev));
    }
  };

  const addTrack = async () => {
    const url = newTrackUrl.trim();
    if (!url) return;
    setAddingTrack(true);
    await addTrackUrl(url);
    setNewTrackUrl("");
    setAddingTrack(false);
  };

  /** Pasting a block of several links adds them all at once instead of just the first. */
  const handleAddTrackPaste = async (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData("text");
    const candidates = pasted.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
    const ids = candidates.map(extractVideoId).filter((id): id is string => Boolean(id));
    if (ids.length < 2) return;
    e.preventDefault();
    setAddingTrack(true);
    for (const id of ids) {
      await addTrackUrl(`https://www.youtube.com/watch?v=${id}`);
    }
    setNewTrackUrl("");
    setAddingTrack(false);
  };

  const removeTrack = async (trackId: string) => {
    setCard((prev) =>
      prev ? { ...prev, tracks: prev.tracks.filter((t) => t.id !== trackId) } : prev,
    );
    await fetch(`/api/cards/${cardId}/tracks/${trackId}`, { method: "DELETE" });
  };

  const renameTrack = async (trackId: string, title: string) => {
    setCard((prev) =>
      prev
        ? { ...prev, tracks: prev.tracks.map((t) => (t.id === trackId ? { ...t, title } : t)) }
        : prev,
    );
    await fetch(`/api/cards/${cardId}/tracks/${trackId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
  };

  const regenerateIcon = async (trackId: string, keyword?: string) => {
    const res = await fetch(`/api/cards/${cardId}/tracks/${trackId}/icon`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keyword }),
    });
    if (!res.ok) return;
    const body = await res.json();
    setCard((prev) =>
      prev
        ? {
            ...prev,
            tracks: prev.tracks.map((t) =>
              t.id === trackId ? { ...t, iconUrl: body.iconUrl } : t,
            ),
          }
        : prev,
    );
  };

  const setCoverImage = async (coverImageUrl: string) => {
    setCard((prev) => (prev ? { ...prev, coverImageUrl } : prev));
    await fetch(`/api/cards/${cardId}/cover`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ coverImageUrl }),
    });
  };

  const retryTrack = async (trackId: string) => {
    await fetch(`/api/cards/${cardId}/tracks/${trackId}/retry`, { method: "POST" });
    const res = await fetch(`/api/cards/${cardId}`);
    if (res.ok) setCard(await res.json());
  };

  const persistOrder = async (tracks: Track[]) => {
    setCard((prev) => (prev ? { ...prev, tracks } : prev));
    await fetch(`/api/cards/${cardId}/reorder`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trackIds: tracks.map((t) => t.id) }),
    });
  };

  const onDrop = (targetIndex: number) => {
    if (dragIndex.current === null || dragIndex.current === targetIndex) return;
    const tracks = [...card.tracks];
    const [moved] = tracks.splice(dragIndex.current, 1);
    tracks.splice(targetIndex, 0, moved);
    dragIndex.current = null;
    void persistOrder(tracks);
  };

  const finalize = async () => {
    setFinalizing(true);
    setFinalizeError(null);
    const res = await fetch(`/api/cards/${cardId}/finalize`, { method: "POST" });
    const body = await res.json();
    if (!res.ok) {
      setFinalizeError(body.error ?? "Failed to stage card");
      setFinalizing(false);
      return;
    }
    setCard((prev) => (prev ? { ...prev, finalized: true, outputDir: body.outputDir } : prev));
    setFinalizing(false);
  };

  const pushToYoto = async () => {
    setCard((prev) => (prev ? { ...prev, pushingToYoto: true, pushError: undefined } : prev));
    const res = await fetch(`/api/cards/${cardId}/push-to-yoto`, { method: "POST" });
    const body = await res.json();
    if (!res.ok) {
      setCard((prev) =>
        prev ? { ...prev, pushingToYoto: false, pushError: body.error ?? "Failed to push to Yoto" } : prev,
      );
      return;
    }
    setCard((prev) =>
      prev ? { ...prev, pushingToYoto: false, yotoCardId: body.yotoCardId } : prev,
    );
  };

  const unlinkYoto = async () => {
    await fetch(`/api/cards/${cardId}/push-to-yoto`, { method: "DELETE" });
    setCard((prev) =>
      prev
        ? {
            ...prev,
            yotoCardId: undefined,
            finalized: false,
            tracks: prev.tracks.map((t) => (t.status === "done" ? { ...t, status: "ready" } : t)),
          }
        : prev,
    );
  };

  const unstage = async () => {
    setUnstaging(true);
    await fetch(`/api/cards/${cardId}/unstage`, { method: "POST" });
    setCard((prev) =>
      prev
        ? {
            ...prev,
            finalized: false,
            tracks: prev.tracks.map((t) => (t.status === "done" ? { ...t, status: "ready" } : t)),
          }
        : prev,
    );
    setUnstaging(false);
  };

  const deleteCard = async () => {
    if (!window.confirm(`Delete "${card.title}"? This can't be undone.`)) return;
    setDeleting(true);
    await fetch(`/api/cards/${cardId}`, { method: "DELETE" });
    router.push("/cards");
  };

  return (
    <main className="mx-auto max-w-2xl w-full p-6 sm:p-10 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <Link
          href="/cards"
          className="font-mono text-xs uppercase tracking-wider text-paper/70 hover:text-brass transition-colors"
        >
          ← Library
        </Link>
        <button
          type="button"
          disabled={deleting}
          onClick={deleteCard}
          className="font-mono text-xs uppercase tracking-wider text-paper/30 hover:text-red-400 transition-colors disabled:opacity-50"
        >
          {deleting ? "Deleting…" : "Delete card"}
        </button>
      </div>

      <div className="bg-paper text-ink-text rounded-sm shadow-xl shadow-black/30 overflow-hidden">
        <div className="border-l-4 border-brass px-6 sm:px-8 pt-6 pb-7 flex flex-col gap-6">
          <div className="flex flex-col gap-4">
            <div className="flex items-start gap-4">
              <CoverImageField
                coverImageUrl={card.coverImageUrl}
                onChange={setCoverImage}
                editable={!locked}
              />
              <div className="flex flex-col gap-1 min-w-0">
                <div className="font-mono text-[11px] uppercase tracking-wider text-ink-text/40">
                  No. {catalogNumber(card.id)}
                </div>
                {!locked && editingTitle ? (
                  <input
                    autoFocus
                    className="font-display text-3xl font-semibold leading-tight border-b border-brass outline-none bg-transparent placeholder:text-ink-text/30"
                    placeholder="Untitled card"
                    value={titleDraft}
                    onChange={(e) => setTitleDraft(e.target.value)}
                    onBlur={commitCardTitle}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitCardTitle();
                    }}
                  />
                ) : (
                  <h1>
                    <button
                      type="button"
                      onClick={() => {
                        setTitleDraft(card.title);
                        setEditingTitle(true);
                      }}
                      disabled={locked}
                      title={locked ? undefined : "Click to rename"}
                      className="font-display text-3xl font-semibold leading-tight text-left border-b border-transparent hover:border-ink-text/20 transition-colors disabled:cursor-default disabled:hover:border-transparent"
                    >
                      {card.title}
                    </button>
                  </h1>
                )}
                <div className="font-mono text-xs text-ink-text/50 tabular-nums">
                  {card.tracks.length} track{card.tracks.length === 1 ? "" : "s"}
                  {hasAnyDuration && ` · ${formatDuration(totalDuration)} total`}
                </div>
              </div>
            </div>
            <StageRail stages={stages} />
          </div>

          <ul className="flex flex-col divide-y divide-ink-text/10 border-t border-b border-ink-text/10">
            {card.tracks.map((track, index) => (
              <li
                key={track.id}
                draggable={!locked}
                onDragStart={() => (dragIndex.current = index)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => onDrop(index)}
                className={`py-2.5 flex flex-col gap-1 ${locked ? "" : "cursor-move"}`}
              >
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs text-ink-text/40 w-10 shrink-0 tabular-nums">
                    {index + 1}/{card.tracks.length}
                  </span>
                  <TrackIcon
                    iconUrl={track.iconUrl}
                    onRegenerate={(keyword) => regenerateIcon(track.id, keyword)}
                    editable={!locked}
                  />
                  <TrackTitleField
                    title={track.title}
                    onRename={(title) => renameTrack(track.id, title)}
                    editable={!locked}
                  />
                  {!locked && (
                    <button
                      type="button"
                      aria-label="Remove track"
                      title="Remove track"
                      className="font-mono text-xs text-ink-text/30 hover:text-red-700 transition-colors px-1 shrink-0"
                      onClick={() => removeTrack(track.id)}
                    >
                      ✕
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-3 pl-[3.25rem]">
                  {track.duration !== undefined && (
                    <span className="font-mono text-xs text-ink-text/40 tabular-nums">
                      {formatDuration(track.duration)}
                    </span>
                  )}
                  {track.status === "ready" || track.status === "done" ? (
                    <span className="font-mono text-xs text-ink-text/30">✓ ready</span>
                  ) : (
                    <StatusPill status={track.status} />
                  )}
                  {track.status === "error" && (
                    <button
                      type="button"
                      className="font-mono text-xs uppercase tracking-wider text-ink-text/50 hover:text-brass transition-colors"
                      onClick={() => retryTrack(track.id)}
                    >
                      Retry
                    </button>
                  )}
                </div>
                {track.status === "error" && track.error && (
                  <p className="text-xs text-red-700 truncate pl-[3.25rem]" title={track.error}>
                    {track.error}
                  </p>
                )}
              </li>
            ))}
          </ul>

          {!locked && (
            <div className="flex flex-col gap-1.5">
              {card.tracks.length === 0 && (
                <p className="text-sm text-ink-text/50">
                  Paste a YouTube link or video ID — drop in several at once, one per line.
                </p>
              )}
              <div className="flex items-center gap-2">
                <input
                  className="flex-1 border-b border-ink-text/15 focus:border-brass outline-none bg-transparent py-1 placeholder:text-ink-text/30 transition-colors"
                  placeholder="youtube.com/watch?v=... or jNQXAC9IVRw"
                  value={newTrackUrl}
                  onChange={(e) => setNewTrackUrl(e.target.value)}
                  onPaste={handleAddTrackPaste}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") addTrack();
                  }}
                />
                <button
                  type="button"
                  disabled={addingTrack || !newTrackUrl.trim()}
                  onClick={addTrack}
                  className="font-mono text-xs uppercase tracking-wider text-ink-text/60 hover:text-brass transition-colors disabled:opacity-50 shrink-0"
                >
                  {addingTrack ? "Adding…" : "+ Add"}
                </button>
              </div>
            </div>
          )}

          {finalizeError && <p className="text-sm text-red-700">{finalizeError}</p>}

          {card.finalized && card.outputDir ? (
            <div className="flex flex-col gap-2">
              {card.yotoCardId && (
                <a
                  href={`https://my.yotoplay.com/card/${card.yotoCardId}/edit`}
                  target="_blank"
                  rel="noreferrer"
                  className="self-start font-mono text-[11px] uppercase tracking-wider px-2.5 py-1 rounded-full bg-brass text-ink-text hover:opacity-80 transition-opacity"
                >
                  On Yoto ↗
                </a>
              )}
              {card.pushError && <p className="text-sm text-red-700">{card.pushError}</p>}

              {card.yotoCardId ? (
                <button
                  type="button"
                  onClick={unlinkYoto}
                  className="self-start font-mono text-xs uppercase tracking-wider text-ink-text/40 hover:text-red-700 transition-colors"
                >
                  Unlink from Yoto
                </button>
              ) : (
                <div className="flex flex-col gap-1.5">
                  <button
                    type="button"
                    disabled={card.pushingToYoto || yotoConnected === null || yotoConnected === false}
                    onClick={pushToYoto}
                    className="self-start bg-ink text-paper font-mono text-sm uppercase tracking-wider px-5 py-2.5 rounded-sm hover:bg-brass hover:text-ink-text transition-colors disabled:opacity-50"
                  >
                    {card.pushingToYoto ? "Pushing…" : "Push to Yoto"}
                  </button>
                  <p className="font-mono text-[11px] text-ink-text/40">
                    {yotoConnected === false
                      ? "Connect your Yoto account from the home page first."
                      : "Uploads the finished tracks and creates the card in your Yoto library."}
                  </p>
                  <button
                    type="button"
                    disabled={unstaging}
                    onClick={unstage}
                    className="self-start mt-2 font-mono text-xs uppercase tracking-wider text-ink-text/40 hover:text-brass transition-colors disabled:opacity-50"
                  >
                    {unstaging ? "Unstaging…" : "Unstage to edit"}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <button
                type="button"
                disabled={!allReady || finalizing}
                onClick={finalize}
                className="self-start bg-ink text-paper font-mono text-sm uppercase tracking-wider px-5 py-2.5 rounded-sm hover:bg-brass hover:text-ink-text transition-colors disabled:opacity-50"
              >
                {finalizing ? "Staging…" : "Stage card"}
              </button>
              <p className="font-mono text-[11px] text-ink-text/40">
                {card.tracks.length === 0
                  ? "Add at least one track before staging."
                  : notReadyCount > 0
                    ? `Waiting on ${notReadyCount} track${notReadyCount === 1 ? "" : "s"} to finish downloading.`
                    : "Tags every track and packages it for Yoto."}
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
