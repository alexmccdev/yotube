"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import LoadingDots from "@/app/components/LoadingDots";
import TrackIcon from "@/app/components/TrackIcon";
import YotoConnectStatus from "@/app/components/YotoConnectStatus";
import YotoOnboarding from "@/app/components/YotoOnboarding";
import UploadDocket, { type UploadDocketState } from "@/app/components/UploadDocket";
import {
  cardPublishFingerprint,
  loadCatalog,
  newBrowserCard,
  removeBrowserTrack,
  saveCatalog,
  type BrowserCard,
  type BrowserTrack,
} from "@/lib/browser-catalog";
import { formatDuration } from "@/lib/format";
import type { IconCandidate } from "@/lib/yoto-icons";
import type { IngestedTrack, TrackIngestProgress } from "@/lib/track-ingest";
import { extractVideoId } from "@/lib/validate";

async function jsonRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? "Request failed");
  return body as T;
}

type TrackStreamEvent =
  | { type: "progress"; progress: TrackIngestProgress | { phase: "authorizing"; totalBytes: number } }
  | { type: "uploaded"; uploadId: string }
  | { type: "error"; error: string };

const TRANSCODE_POLL_INTERVAL_MS = 5_000;
const TRANSCODE_POLL_ATTEMPTS = 120;

function abortableDelay(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      window.clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    const timer = window.setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

async function waitForYotoTrack(
  track: BrowserTrack,
  uploadId: string,
  signal: AbortSignal,
  onProgress: (progress: TrackStreamEvent & { type: "progress" }) => void,
): Promise<IngestedTrack> {
  for (let attempt = 1; attempt <= TRANSCODE_POLL_ATTEMPTS; attempt++) {
    onProgress({
      type: "progress",
      progress: { phase: "processing", totalBytes: track.source.fileSize, processingAttempt: attempt },
    });
    const response = await fetch("/api/yoto/tracks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "status", uploadId, url: track.source.url, source: track.source }),
      signal,
    });
    const body = await response.json().catch(() => ({})) as {
      error?: string;
      status?: "processing" | "complete";
      result?: IngestedTrack;
    };
    if (response.ok && body.status === "complete" && body.result) {
      onProgress({
        type: "progress",
        progress: {
          phase: "complete",
          bytesTransferred: track.source.fileSize,
          totalBytes: track.source.fileSize,
          transferPercent: 100,
        },
      });
      return body.result;
    }
    if (response.status !== 202) throw new Error(body.error ?? "Yoto processing check failed");
    await abortableDelay(TRANSCODE_POLL_INTERVAL_MS, signal);
  }
  throw new Error("Yoto took too long to process the audio");
}

async function streamTrackToYoto(
  track: BrowserTrack,
  signal: AbortSignal,
  onProgress: (progress: TrackStreamEvent & { type: "progress" }) => void,
): Promise<IngestedTrack> {
  const response = await fetch("/api/yoto/tracks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: track.source.url, source: track.source }),
    signal,
  });
  if (!response.ok || !response.body) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? "Track upload could not start");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffered = "";
  let uploadId: string | undefined;
  while (true) {
    const chunk = await reader.read();
    buffered += decoder.decode(chunk.value, { stream: !chunk.done });
    const lines = buffered.split("\n");
    buffered = lines.pop() ?? "";
    for (const line of lines) {
      if (!line) continue;
      const event = JSON.parse(line) as TrackStreamEvent;
      if (event.type === "progress") onProgress(event);
      if (event.type === "error") throw new Error(event.error);
      if (event.type === "uploaded") uploadId = event.uploadId;
    }
    if (chunk.done) break;
  }
  if (!uploadId) throw new Error("The upload ended before Yoto accepted the track");
  return waitForYotoTrack(track, uploadId, signal, onProgress);
}

function TrackRow({
  track,
  index,
  open,
  onOpen,
  onChange,
  onRemove,
  activeProgress,
}: {
  track: BrowserTrack;
  index: number;
  open: boolean;
  onOpen: (open: boolean) => void;
  onChange: (track: BrowserTrack) => void;
  onRemove: () => void;
  activeProgress?: UploadDocketState;
}) {
  const stateLabel = track.state === "uploaded"
    ? "On Yoto"
    : track.state === "uploading"
      ? "Sending"
      : track.state === "error" ? "Needs attention" : "Ready to send";
  const findIcons = (keyword?: string) =>
    jsonRequest<IconCandidate[]>(
      `/api/yoto/icons?title=${encodeURIComponent(track.source.title)}${keyword ? `&q=${encodeURIComponent(keyword)}` : ""}`,
    );
  const selectIcon = async (candidate: IconCandidate) => {
    onChange({
      ...track,
      icon: candidate.source === "yoto-library"
        ? { source: "yoto-library", mediaId: candidate.mediaId!, url: candidate.url }
        : { source: "yotoicons", id: candidate.id, url: candidate.url },
    });
  };
  return (
    <li data-testid={`track-${track.id}`} className={`file-in relative grid grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center gap-3 border-t border-ink-text/10 py-3 first:border-t-0 sm:grid-cols-[2rem_2rem_minmax(0,1fr)_auto] sm:py-3.5 ${open ? "z-[1000]" : "z-0"}`}>
      <span className="hidden font-mono text-sm font-medium text-ink-text/30 tabular-nums sm:block">{String(index + 1).padStart(2, "0")}</span>
      <div className="relative">
        <span className="absolute -left-1 -top-1 z-10 flex h-4 min-w-4 items-center justify-center rounded-full bg-ink px-1 font-mono text-[8px] font-medium text-paper tabular-nums sm:hidden">{index + 1}</span>
        <TrackIcon
          iconUrl={track.icon?.url}
          onFetchCandidates={findIcons}
          onSelect={selectIcon}
          open={open}
          onOpenChange={onOpen}
        />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-ink-text/85">{track.source.title}</p>
        <p className="mt-0.5 font-mono text-[10px] tracking-wide text-ink-text/45">
          {formatDuration(track.source.duration)} <span aria-hidden="true">·</span> {stateLabel}
        </p>
        {activeProgress?.phase === "streaming" && activeProgress.transferPercent !== undefined ? (
          <div className="mt-1.5 h-1 bg-ink-text/10 rounded-full overflow-hidden" aria-hidden="true">
            <div className="h-full bg-brass transition-[width] duration-200" style={{ width: `${activeProgress.transferPercent}%` }} />
          </div>
        ) : null}
        {track.error ? <p className="text-xs text-red-700 mt-1">{track.error}</p> : null}
      </div>
      <button type="button" onClick={onRemove} aria-label={`Remove ${track.source.title}`} className="press flex h-11 w-11 items-center justify-center rounded-sm font-mono text-lg text-ink-text/35 hover:bg-red-700/10 hover:text-red-800 sm:h-auto sm:w-auto sm:px-2 sm:py-1 sm:text-[10px]">
        <span aria-hidden="true" className="sm:hidden">×</span><span className="hidden sm:inline">Remove</span>
      </button>
    </li>
  );
}

export default function BrowserLibraryPage() {
  const [cards, setCards] = useState<BrowserCard[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [ready, setReady] = useState(false);
  const [trackInput, setTrackInput] = useState("");
  const [trackInputError, setTrackInputError] = useState<string>();
  const [lookingUp, setLookingUp] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [notice, setNotice] = useState<string>();
  const [openIcon, setOpenIcon] = useState<string>();
  const [uploadProgress, setUploadProgress] = useState<UploadDocketState>();
  const [uploadCardId, setUploadCardId] = useState<string>();
  const [uploadStartedAt, setUploadStartedAt] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const uploadController = useRef<AbortController | undefined>(undefined);
  const trackInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const stored = loadCatalog(window.localStorage);
      setCards(stored);
      setSelectedId(stored[0]?.id);
      setReady(true);
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  useEffect(() => {
    if (ready) saveCatalog(window.localStorage, cards);
  }, [cards, ready]);
  useEffect(() => {
    if (!publishing || !uploadStartedAt) return;
    const timer = window.setInterval(() => setElapsedMs(Date.now() - uploadStartedAt), 1_000);
    return () => window.clearInterval(timer);
  }, [publishing, uploadStartedAt]);

  const selected = useMemo(() => cards.find((card) => card.id === selectedId), [cards, selectedId]);
  const cardTitleReady = selected
    ? Boolean(selected.title.trim()) && selected.title.trim().toLowerCase() !== "untitled card"
    : false;
  const hasUnpublishedChanges = selected
    ? cardPublishFingerprint(selected) !== selected.publishedFingerprint
    : false;
  const replaceCard = (next: BrowserCard) => {
    next.updatedAt = new Date().toISOString();
    setCards((current) => current.map((card) => card.id === next.id ? next : card));
  };
  const updateTrack = (cardId: string, changed: BrowserTrack) => {
    setCards((current) => current.map((card) => card.id === cardId ? {
      ...card,
      updatedAt: new Date().toISOString(),
      tracks: card.tracks.map((track) => track.id === changed.id ? changed : track),
    } : card));
  };
  const removeTrack = (cardId: string, trackId: string) => {
    setCards((current) => current.map((card) => {
      if (card.id !== cardId) return card;
      return { ...removeBrowserTrack(card, trackId), updatedAt: new Date().toISOString() };
    }));
  };
  const createCard = () => {
    const card = newBrowserCard();
    setCards((current) => [card, ...current]);
    setSelectedId(card.id);
    setNotice(undefined);
    setOpenIcon(undefined);
  };
  const deleteCard = (card: BrowserCard) => {
    const name = card.title.trim() ? `“${card.title.trim()}”` : "this untitled card";
    if (!window.confirm(`Remove ${name} from this browser? This won’t delete anything already on Yoto.`)) return;
    const remaining = cards.filter((item) => item.id !== card.id);
    setCards(remaining);
    setSelectedId(remaining[0]?.id);
  };

  const addTrack = async (event: FormEvent) => {
    event.preventDefault();
    if (!selected || lookingUp) return;
    const videoId = extractVideoId(trackInput);
    if (!videoId) {
      setTrackInputError("Paste a YouTube watch link or an 11-character video ID.");
      return;
    }
    if (selected.tracks.some((track) => extractVideoId(track.source.url) === videoId)) {
      setTrackInputError("That video is already on this card.");
      return;
    }
    setLookingUp(true);
    setTrackInputError(undefined);
    setNotice(undefined);
    try {
      const source = await jsonRequest<BrowserTrack["source"]>("/api/youtube/metadata", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: videoId }),
      });
      const trackId = crypto.randomUUID();
      const inferCover = !selected.coverImageUrl && Boolean(source.thumbnail);
      replaceCard({
        ...selected,
        tracks: [...selected.tracks, { id: trackId, source, state: "draft" }],
        coverImageUrl: inferCover ? source.thumbnail : selected.coverImageUrl,
        coverSourceTrackId: inferCover ? trackId : selected.coverSourceTrackId,
      });
      setTrackInput("");
      requestAnimationFrame(() => trackInputRef.current?.focus());
    } catch (error) {
      setTrackInputError(error instanceof Error ? error.message : "Video lookup failed");
    } finally {
      setLookingUp(false);
    }
  };

  const publish = async ({ asCopy = false }: { asCopy?: boolean } = {}) => {
    if (!selected || selected.tracks.length === 0 || publishing) return;
    if (!cardTitleReady) {
      setNotice("Give this card a specific title before sending it to Yoto.");
      return;
    }
    if (asCopy && !window.confirm("Create a separate card in Yoto? The current Yoto card will remain unchanged.")) return;
    setPublishing(true);
    setNotice(undefined);
    setUploadCardId(selected.id);
    const controller = new AbortController();
    uploadController.current = controller;
    const startedAt = Date.now();
    setUploadStartedAt(startedAt);
    setElapsedMs(0);
    let next = selected;
    const trackCount = next.tracks.length;
    let completedTracks = next.tracks.filter((track) => track.ingested).length;
    const overall = (completed: number, fraction = 0) =>
      Math.min(99, ((completed + fraction) / (trackCount + 1)) * 100);
    setUploadProgress({
      phase: "authorizing",
      overallPercent: overall(completedTracks),
      trackCount,
    });
    try {
      await jsonRequest("/api/yoto/session", { method: "POST" });
      for (let trackIndex = 0; trackIndex < next.tracks.length; trackIndex++) {
        const track = next.tracks[trackIndex];
        if (track.ingested) continue;
        next = { ...next, tracks: next.tracks.map((item) => item.id === track.id ? { ...item, state: "uploading", error: undefined } : item) };
        replaceCard(next);
        try {
          const ingested = await streamTrackToYoto(track, controller.signal, (event) => {
            const progress = event.progress;
            const phaseFraction = progress.phase === "streaming"
              ? 0.08 + ((progress.transferPercent ?? 0) / 100) * 0.72
              : progress.phase === "processing" ? 0.9
                : progress.phase === "complete" ? 1 : 0.04;
            setUploadProgress({
              ...progress,
              phase: progress.phase,
              overallPercent: overall(completedTracks, phaseFraction),
              trackIndex: trackIndex + 1,
              trackCount,
              trackTitle: track.source.title,
            });
          });
          completedTracks++;
          next = { ...next, tracks: next.tracks.map((item) => item.id === track.id ? { ...item, ingested, state: "uploaded", error: undefined } : item) };
          replaceCard(next);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Track upload failed";
          next = { ...next, tracks: next.tracks.map((item) => item.id === track.id ? { ...item, state: "error", error: message } : item) };
          replaceCard(next);
          throw error;
        }
      }
      setUploadProgress({
        phase: "publishing",
        overallPercent: overall(trackCount, 0.45),
        trackCount,
      });
      const existingCardId = asCopy ? undefined : next.yotoCardId;
      const updatingExistingCard = Boolean(existingCardId);
      const result = await jsonRequest<{ yotoCardId: string; replacedDeletedCard?: boolean }>("/api/yoto/cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: next.title,
          tracks: next.tracks.map((track) => ({ ...track.ingested!, icon: track.icon })),
          existingCardId,
          coverImageUrl: next.coverImageUrl,
        }),
      });
      next = { ...next, yotoCardId: result.yotoCardId };
      next = { ...next, publishedFingerprint: cardPublishFingerprint(next) };
      replaceCard(next);
      setNotice(result.replacedDeletedCard
        ? "The original card was missing, so Yoto created a new copy."
        : asCopy ? "Copy created in Yoto. The original card is unchanged."
          : updatingExistingCard ? "Yoto card updated." : "Yoto card created.");
      setUploadProgress({ phase: "complete", overallPercent: 100, trackCount });
    } catch (error) {
      const cancelled = controller.signal.aborted;
      const message = cancelled ? "Upload stopped. Run it again to continue from completed tracks." : error instanceof Error ? error.message : "Publish failed";
      setNotice(message);
      setUploadProgress((current) => ({
        phase: cancelled ? "cancelled" : "error",
        overallPercent: current?.overallPercent ?? 0,
        trackCount,
        trackIndex: current?.trackIndex,
        trackTitle: current?.trackTitle,
        message,
      }));
    } finally {
      setPublishing(false);
      uploadController.current = undefined;
      setElapsedMs(Date.now() - startedAt);
    }
  };

  if (!ready) return <main className="mx-auto flex min-h-screen w-full max-w-6xl items-center justify-center p-8"><LoadingDots label="Loading your cards" /></main>;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-5 px-3 pb-10 pt-4 sm:gap-7 sm:p-8 lg:p-10 file-in">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 border-b border-paper/10 pb-5 sm:flex sm:justify-between sm:gap-5 sm:pb-6">
        <div className="min-w-0">
          <div className="route-mark font-mono text-[10px] font-medium tracking-[0.16em] text-signal">
            <span>YouTube audio</span><span className="col-start-3">Yoto cards</span>
          </div>
          <h1 className="mt-2 font-display text-[2.5rem] font-semibold leading-none tracking-[-0.045em] sm:text-5xl">yotube</h1>
          <p className="col-span-2 mt-2 max-w-xl text-sm leading-relaxed text-paper/65 sm:text-base">Build a card in your browser, then send each track straight to your Yoto library.</p>
        </div>
        <YotoConnectStatus />
      </header>

      <YotoOnboarding />

      <div className="grid min-w-0 items-start gap-4 md:grid-cols-[15rem_minmax(0,1fr)] lg:gap-7">
        <aside aria-label="Your cards" className="min-w-0">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h2 className="font-mono text-[10px] font-medium tracking-[0.16em] text-paper/45">Your cards</h2>
            <span className="font-mono text-[10px] text-paper/35">{cards.length}</span>
          </div>
          <div className="card-rail -mx-3 flex snap-x snap-mandatory gap-2 overflow-x-auto px-3 pb-2 md:mx-0 md:flex-col md:overflow-visible md:px-0">
            <button type="button" onClick={createCard} className="press min-h-12 min-w-32 shrink-0 snap-start rounded-sm border border-dashed border-paper/30 px-4 py-3 text-left font-mono text-[11px] text-paper/70 hover:border-signal hover:text-signal md:w-full">+ New card</button>
            {cards.map((card) => (
            <button key={card.id} type="button" aria-pressed={card.id === selectedId} onClick={() => {
              setSelectedId(card.id);
              setNotice(undefined);
              setOpenIcon(undefined);
            }} className={`press min-h-12 min-w-[11.5rem] max-w-[75vw] shrink-0 snap-start rounded-sm border p-3 text-left transition-colors md:w-full md:max-w-none ${card.id === selectedId ? "border-brass bg-paper text-ink-text shadow-lg shadow-black/10" : "border-paper/10 bg-ink-panel text-paper hover:border-signal/60"}`}>
              <span className="block truncate font-display text-sm font-semibold">{card.title || "Untitled card"}</span>
              <span className="mt-1 block font-mono text-[10px] opacity-50">{card.tracks.length} track{card.tracks.length === 1 ? "" : "s"}{card.yotoCardId ? " · On Yoto" : ""}</span>
            </button>
          ))}
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-paper/45 sm:mt-2 sm:text-xs">Saved only in this browser. Removing a draft here never deletes a card from Yoto.</p>
        </aside>

        {selected ? (
          <section aria-label="Card editor" className="card-shell min-w-0 overflow-visible rounded-md border border-white/40 border-t-4 border-t-brass bg-paper text-ink-text">
            <div className="flex flex-col gap-5 p-4 sm:gap-6 sm:p-7">
              <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-start gap-3 sm:grid-cols-[5.5rem_minmax(0,1fr)_auto] sm:gap-4">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="card-cover" className="font-mono text-[10px] font-medium tracking-wide text-ink-text/45">Cover</label>
                  <div
                    role="img"
                    aria-label={selected.coverImageUrl ? "Selected card image" : "No card image selected"}
                    className="aspect-[4/5] w-full rounded-sm border border-ink-text/15 bg-ink-text/[0.06] bg-cover bg-center"
                    style={selected.coverImageUrl ? { backgroundImage: `url(${JSON.stringify(selected.coverImageUrl).slice(1, -1)})` } : undefined}
                  >
                    {!selected.coverImageUrl ? <span className="h-full flex items-center justify-center font-mono text-[9px] text-ink-text/30">No image</span> : null}
                  </div>
                  <select
                    id="card-cover"
                    aria-label="Choose card image"
                    value={selected.coverSourceTrackId ?? ""}
                    disabled={!selected.tracks.some((track) => track.source.thumbnail)}
                    onChange={(event) => {
                      const track = selected.tracks.find((item) => item.id === event.target.value);
                      replaceCard({
                        ...selected,
                        coverImageUrl: track?.source.thumbnail,
                        coverSourceTrackId: track?.id,
                      });
                    }}
                    className="min-h-10 w-[calc(100vw-4rem)] max-w-[20rem] bg-transparent border-b border-ink-text/15 py-1 font-mono text-[9px] text-ink-text/55 outline-none focus:border-brass disabled:opacity-40 sm:min-h-8 sm:w-full"
                  >
                    {!selected.coverSourceTrackId ? <option value="">Use the first video image</option> : null}
                    {selected.tracks.filter((track) => track.source.thumbnail).map((track, index) => (
                      <option key={track.id} value={track.id}>{index + 1}. {track.source.title}</option>
                    ))}
                  </select>
                </div>
                <div className="min-w-0 flex flex-col gap-1.5">
                  <label htmlFor="card-title" className="font-mono text-[10px] font-medium tracking-wide text-ink-text/50">Card title</label>
                  <input
                    id="card-title"
                    value={selected.title}
                    onChange={(event) => replaceCard({ ...selected, title: event.target.value })}
                    placeholder="Give your card a name"
                    aria-required="true"
                    aria-describedby="card-title-help"
                    className="min-h-11 min-w-0 w-full border-b border-ink-text/15 bg-transparent py-1 font-display text-xl font-semibold tracking-[-0.025em] outline-none placeholder:text-ink-text/25 focus:border-brass sm:text-3xl"
                  />
                  <p id="card-title-help" className={`text-xs ${selected.title.trim() ? "text-ink-text/45" : "font-medium text-amber-800"}`}>
                    {selected.title.trim() ? "Shown in your Yoto library." : "Add a title before sending this card."}
                  </p>
                </div>
                <button type="button" onClick={() => deleteCard(selected)} className="press col-span-2 min-h-11 justify-self-start rounded-sm px-2 py-1 font-mono text-[10px] text-ink-text/40 hover:bg-red-700/10 hover:text-red-800 sm:col-span-1 sm:min-h-0 sm:justify-self-end">Remove from browser</button>
              </div>

              <form onSubmit={addTrack} className="flex flex-col gap-2 border-t border-ink-text/10 pt-5">
                <div className="flex items-baseline justify-between gap-3">
                  <label htmlFor="youtube-track" className="font-mono text-[10px] font-medium tracking-wide text-ink-text/50">Add a YouTube track</label>
                  <span className="hidden text-xs text-ink-text/35 sm:inline">Link or 11-character video ID</span>
                </div>
                <div className={`grid grid-cols-1 items-stretch overflow-hidden rounded-sm border bg-white/35 transition-colors focus-within:border-brass sm:grid-cols-[auto_1fr_auto] ${trackInputError ? "border-red-700/50" : "border-ink-text/15"}`}>
                  <span className="hidden sm:flex items-center px-3 border-r border-ink-text/10 font-mono text-[10px] uppercase tracking-wider text-ink-text/35" aria-hidden="true">youtube /</span>
                  <input
                    ref={trackInputRef}
                    id="youtube-track"
                    value={trackInput}
                    onChange={(event) => {
                      const raw = event.target.value;
                      setTrackInput(extractVideoId(raw) ?? raw);
                      setTrackInputError(undefined);
                    }}
                    onBlur={() => {
                      if (trackInput.trim() && !extractVideoId(trackInput)) {
                        setTrackInputError("Paste a YouTube watch link or an 11-character video ID.");
                      }
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        event.currentTarget.form?.requestSubmit();
                      }
                    }}
                    disabled={lookingUp}
                    inputMode="url"
                    autoComplete="off"
                    spellCheck={false}
                    aria-describedby="youtube-track-help"
                    aria-invalid={Boolean(trackInputError)}
                    placeholder="Qzi2R_uuk2E or youtube.com/watch?v=…"
                    className="min-h-12 min-w-0 bg-transparent px-3 py-3 font-mono text-xs outline-none placeholder:text-ink-text/30 disabled:opacity-50"
                  />
                  <button disabled={lookingUp || !extractVideoId(trackInput)} className="press min-h-11 border-t border-ink-text/10 bg-ink px-4 font-mono text-[11px] font-medium text-paper hover:bg-brass hover:text-ink-text disabled:cursor-not-allowed disabled:opacity-35 sm:min-h-0 sm:border-l sm:border-t-0 sm:text-[10px]">
                    {lookingUp ? "Reading video…" : "Add track"}
                  </button>
                </div>
                <p id="youtube-track-help" className={`text-[11px] ${trackInputError ? "text-red-700" : "text-ink-text/40"}`}>
                  {trackInputError ?? "We’ll read the title, length, and thumbnail before anything is sent."}
                </p>
              </form>

              {selected.tracks.length ? (
                <ol>
                  {selected.tracks.map((track, index) => (
                    <TrackRow key={track.id} track={track} index={index} open={openIcon === track.id} onOpen={(open) => setOpenIcon(open ? track.id : undefined)} onChange={(changed) => updateTrack(selected.id, changed)} onRemove={() => removeTrack(selected.id, track.id)} activeProgress={publishing && uploadCardId === selected.id && uploadProgress?.trackIndex === index + 1 ? uploadProgress : undefined} />
                  ))}
                </ol>
              ) : <div className="rounded-sm border border-dashed border-ink-text/15 px-5 py-8 text-center"><p className="font-display text-lg font-semibold text-ink-text/60">No tracks yet</p><p className="mt-1 text-sm text-ink-text/45">Paste a YouTube link above to build the running order.</p></div>}

              {uploadProgress && uploadCardId === selected.id ? (
                <UploadDocket
                  progress={uploadProgress}
                  elapsedMs={elapsedMs}
                  onCancel={publishing ? () => uploadController.current?.abort() : undefined}
                />
              ) : null}

              <div className="mobile-action-dock flex flex-wrap items-center gap-3 border-t border-ink-text/10 pt-4 sm:pt-5">
                <button type="button" onClick={() => void publish()} disabled={publishing || !cardTitleReady || selected.tracks.length === 0 || (Boolean(selected.yotoCardId) && !hasUnpublishedChanges)} className="press min-h-12 w-full rounded-sm bg-brass px-5 py-3 font-mono text-xs font-medium text-ink-text shadow-sm hover:bg-signal disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto">
                  {publishing ? <LoadingDots label="Sending card" className="text-ink-text" /> : selected.yotoCardId ? hasUnpublishedChanges ? "Update Yoto card" : "Yoto card is up to date" : "Send card to Yoto"}
                </button>
                {selected.yotoCardId ? (
                  <>
                    <a href={`https://my.yotoplay.com/card/${selected.yotoCardId}/edit`} target="_blank" rel="noreferrer" className="stage-stamp font-mono text-[10px] font-medium text-ink-text">Open in Yoto ↗</a>
                    <button
                      type="button"
                      disabled={publishing}
                      onClick={() => void publish({ asCopy: true })}
                      className="press rounded-sm px-2 py-1 font-mono text-[10px] text-ink-text/45 hover:bg-ink-text/5 hover:text-ink-text disabled:opacity-40"
                    >
                      Create a separate copy
                    </button>
                  </>
                ) : null}
                {notice ? <p role="status" className="basis-full text-sm text-ink-text/65 sm:basis-auto">{notice}</p> : null}
              </div>
            </div>
          </section>
        ) : (
          <section className="rounded-md border border-dashed border-paper/20 bg-ink-panel/50 p-10 text-center sm:p-16">
            <p className="font-display text-2xl font-semibold text-paper/85">Start with an empty card</p>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-paper/50">Add YouTube tracks, choose a cover and icons, then send the finished card to Yoto.</p>
            <button onClick={createCard} className="press mt-5 rounded-sm bg-brass px-5 py-3 font-mono text-xs font-medium text-ink-text hover:bg-signal">Create a card</button>
          </section>
        )}
      </div>
    </main>
  );
}
