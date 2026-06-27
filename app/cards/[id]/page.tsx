"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import BrassBurst from "@/app/components/BrassBurst";
import CoverImageField from "@/app/components/CoverImageField";
import LoadingDots from "@/app/components/LoadingDots";
import StageRail from "@/app/components/StageRail";
import StatusPill from "@/app/components/StatusPill";
import TrackIcon from "@/app/components/TrackIcon";
import TrackTitleField from "@/app/components/TrackTitleField";
import { catalogNumber, formatDuration } from "@/lib/format";
import { getCardStages } from "@/lib/stage";
import { type TrackStatus } from "@/lib/track-status";
import { extractVideoId, isYoutubePlaylistUrl } from "@/lib/validate";
import type { IconCandidate } from "@/lib/yoto-icons";

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
  const [justLinked, setJustLinked] = useState(false);
  const [playlistLoading, setPlaylistLoading] = useState(false);
  const [playlistError, setPlaylistError] = useState<string | null>(null);
  const [playlistPreview, setPlaylistPreview] = useState<{
    url: string;
    playlistTitle?: string;
    videos: { id: string; title: string }[];
    individualAdded: number;
  } | null>(null);
  const [confirmingPlaylist, setConfirmingPlaylist] = useState(false);
  const dragIndex = useRef<number | null>(null);
  const cardRef = useRef<Card | null>(null);
  useEffect(() => {
    cardRef.current = card;
  }, [card]);

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

  const isBlank = (c: Card) =>
    c.tracks.length === 0 && !c.finalized && !c.coverImageUrl && c.title.trim() === "Untitled card";

  useEffect(() => {
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

  const goToLibrary = async () => {
    const c = cardRef.current;
    if (c && isBlank(c)) {
      await fetch(`/api/cards/${c.id}`, { method: "DELETE" });
    }
    router.push("/");
  };

  if (!card) {
    return (
      <main className="mx-auto max-w-2xl w-full p-6 sm:p-10 flex flex-col gap-6">
        <Link
          href="/"
          className="font-mono text-xs uppercase tracking-wider text-paper/70 hover:text-brass self-start transition-colors"
        >
          ← Library
        </Link>
        <LoadingDots label="Pulling the card…" />
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

  /** Resolves a playlist URL into a preview list, without creating any tracks yet. */
  const resolvePlaylist = async (url: string, individualAdded = 0) => {
    setPlaylistLoading(true);
    setPlaylistError(null);
    const res = await fetch(`/api/cards/${cardId}/playlist?url=${encodeURIComponent(url)}`);
    const body = await res.json();
    setPlaylistLoading(false);
    if (!res.ok) {
      setPlaylistError(body.error ?? "Failed to resolve playlist");
      return;
    }
    setPlaylistPreview({ url, playlistTitle: body.playlistTitle, videos: body.videos, individualAdded });
  };

  const confirmPlaylist = async () => {
    if (!playlistPreview) return;
    setConfirmingPlaylist(true);
    const res = await fetch(`/api/cards/${cardId}/playlist`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ videos: playlistPreview.videos, playlistTitle: playlistPreview.playlistTitle }),
    });
    if (res.ok) {
      const body = await res.json();
      setCard((prev) => (prev ? { ...prev, tracks: [...prev.tracks, ...body.added] } : prev));
      const res2 = await fetch(`/api/cards/${cardId}`);
      if (res2.ok) setCard(await res2.json());
    }
    setConfirmingPlaylist(false);
    setPlaylistPreview(null);
  };

  const cancelPlaylist = () => {
    setPlaylistPreview(null);
    setPlaylistError(null);
  };

  const addTrack = async () => {
    const url = newTrackUrl.trim();
    if (!url) return;
    if (isYoutubePlaylistUrl(url)) {
      setNewTrackUrl("");
      await resolvePlaylist(url);
      return;
    }
    setAddingTrack(true);
    await addTrackUrl(url);
    setNewTrackUrl("");
    setAddingTrack(false);
  };

  /** Pasting a block of several links adds plain links right away; a playlist link among
   *  them goes through the preview/confirm step since it can expand into many tracks. */
  const handleAddTrackPaste = async (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData("text");
    const candidates = pasted.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
    const playlistUrls = candidates.filter(isYoutubePlaylistUrl);
    const ids = candidates.map(extractVideoId).filter((id): id is string => Boolean(id));

    if (playlistUrls.length === 0) {
      if (ids.length < 2) return;
      e.preventDefault();
      setAddingTrack(true);
      for (const id of ids) {
        await addTrackUrl(`https://www.youtube.com/watch?v=${id}`);
      }
      setNewTrackUrl("");
      setAddingTrack(false);
      return;
    }

    e.preventDefault();
    setNewTrackUrl("");
    if (ids.length > 0) {
      setAddingTrack(true);
      for (const id of ids) {
        await addTrackUrl(`https://www.youtube.com/watch?v=${id}`);
      }
      setAddingTrack(false);
    }
    await resolvePlaylist(playlistUrls[0], ids.length);
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

  const fetchIconCandidates = async (trackId: string, keyword?: string): Promise<IconCandidate[]> => {
    const url = new URL(`/api/cards/${cardId}/tracks/${trackId}/icon`, window.location.origin);
    if (keyword) url.searchParams.set("keyword", keyword);
    const res = await fetch(url);
    if (!res.ok) return [];
    const body = await res.json();
    return body.candidates ?? [];
  };

  const selectIcon = async (trackId: string, candidate: IconCandidate) => {
    const res = await fetch(`/api/cards/${cardId}/tracks/${trackId}/icon`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(candidate),
    });
    if (!res.ok) return;
    setCard((prev) =>
      prev
        ? {
            ...prev,
            tracks: prev.tracks.map((t) =>
              t.id === trackId ? { ...t, iconUrl: candidate.url } : t,
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
    setJustLinked(true);
    setTimeout(() => setJustLinked(false), 600);
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
    router.push("/");
  };

  return (
    <main className="mx-auto max-w-2xl w-full p-6 sm:p-10 flex flex-col gap-6 file-in">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={goToLibrary}
          className="press font-mono text-xs uppercase tracking-wider text-paper/70 hover:text-brass transition-colors inline-block"
        >
          ← Library
        </button>
        <button
          type="button"
          disabled={deleting}
          onClick={deleteCard}
          className="press font-mono text-xs uppercase tracking-wider text-paper/30 hover:text-red-400 transition-colors disabled:opacity-50"
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
                style={{ animationDelay: `${Math.min(index, 10) * 30}ms` }}
                className={`file-in py-2.5 flex flex-col gap-1 ${locked ? "" : "cursor-move"}`}
              >
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs text-ink-text/40 w-10 shrink-0 tabular-nums">
                    {index + 1}/{card.tracks.length}
                  </span>
                  <TrackIcon
                    iconUrl={track.iconUrl}
                    onFetchCandidates={(keyword) => fetchIconCandidates(track.id, keyword)}
                    onSelect={(candidate) => selectIcon(track.id, candidate)}
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
                      className="press font-mono text-xs text-ink-text/30 hover:text-red-700 transition-colors px-1 shrink-0"
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
                      className="press font-mono text-xs uppercase tracking-wider text-ink-text/50 hover:text-brass transition-colors"
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
                  Paste a YouTube link, video ID, or playlist URL — drop in several at once, one per line.
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
                  className="press font-mono text-xs uppercase tracking-wider text-ink-text/60 hover:text-brass transition-colors disabled:opacity-50 shrink-0"
                >
                  {addingTrack ? (
                    <LoadingDots className="font-mono text-xs text-ink-text/60" />
                  ) : (
                    "+ Add"
                  )}
                </button>
              </div>
              {playlistLoading && (
                <LoadingDots label="Looking up playlist" className="font-mono text-xs text-ink-text/50" />
              )}
              {playlistError && <p className="text-sm text-red-700">{playlistError}</p>}
              {playlistPreview && (
                <div className="flex flex-col gap-2 border border-brass/40 rounded-sm px-3 py-2.5 bg-brass/5">
                  <p className="text-sm text-ink-text">
                    {playlistPreview.individualAdded > 0 && (
                      <>+{playlistPreview.individualAdded} individual track
                        {playlistPreview.individualAdded === 1 ? "" : "s"}, </>
                    )}
                    +{playlistPreview.videos.length} from
                    {playlistPreview.playlistTitle ? ` "${playlistPreview.playlistTitle}"` : " playlist"}
                  </p>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      disabled={confirmingPlaylist}
                      onClick={confirmPlaylist}
                      className="press font-mono text-xs uppercase tracking-wider bg-ink text-paper px-3 py-1.5 rounded-sm hover:bg-brass hover:text-ink-text transition-colors disabled:opacity-50"
                    >
                      {confirmingPlaylist ? (
                        <LoadingDots label="Adding" className="font-mono text-xs text-paper" />
                      ) : (
                        "Add all"
                      )}
                    </button>
                    <button
                      type="button"
                      disabled={confirmingPlaylist}
                      onClick={cancelPlaylist}
                      className="press font-mono text-xs uppercase tracking-wider text-ink-text/50 hover:text-red-700 transition-colors disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {finalizeError && <p className="text-sm text-red-700">{finalizeError}</p>}

          {card.finalized && card.outputDir ? (
            <div className="flex flex-col gap-2">
              {card.yotoCardId && (
                <span className="relative self-start inline-block">
                  <a
                    href={`https://my.yotoplay.com/card/${card.yotoCardId}/edit`}
                    target="_blank"
                    rel="noreferrer"
                    className="press pop-in self-start font-mono text-[11px] uppercase tracking-wider px-2.5 py-1 rounded-full bg-brass text-ink-text hover:opacity-80 transition-opacity inline-block"
                  >
                    On Yoto ↗
                  </a>
                  {justLinked && <BrassBurst />}
                </span>
              )}
              {card.pushError && <p className="text-sm text-red-700">{card.pushError}</p>}

              {card.yotoCardId ? (
                <button
                  type="button"
                  onClick={unlinkYoto}
                  className="press self-start font-mono text-xs uppercase tracking-wider text-ink-text/40 hover:text-red-700 transition-colors"
                >
                  Unlink from Yoto
                </button>
              ) : (
                <div className="flex flex-col gap-1.5">
                  <button
                    type="button"
                    disabled={card.pushingToYoto || yotoConnected === null || yotoConnected === false}
                    onClick={pushToYoto}
                    className="press self-start bg-ink text-paper font-mono text-sm uppercase tracking-wider px-5 py-2.5 rounded-sm hover:bg-brass hover:text-ink-text transition-colors disabled:opacity-50"
                  >
                    {card.pushingToYoto ? (
                      <LoadingDots label="Pushing" className="font-mono text-sm text-paper" />
                    ) : (
                      "Push to Yoto"
                    )}
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
                    className="press self-start mt-2 font-mono text-xs uppercase tracking-wider text-ink-text/40 hover:text-brass transition-colors disabled:opacity-50"
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
                className="press self-start bg-ink text-paper font-mono text-sm uppercase tracking-wider px-5 py-2.5 rounded-sm hover:bg-brass hover:text-ink-text transition-colors disabled:opacity-50"
              >
                {finalizing ? (
                  <LoadingDots label="Staging" className="font-mono text-sm text-paper" />
                ) : (
                  "Stage card"
                )}
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
