"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import LoadingDots from "@/app/components/LoadingDots";
import TrackIcon from "@/app/components/TrackIcon";
import YotoConnectStatus from "@/app/components/YotoConnectStatus";
import YotoOnboarding from "@/app/components/YotoOnboarding";
import UploadDocket, { type UploadDocketState } from "@/app/components/UploadDocket";
import {
  loadCatalog,
  newBrowserCard,
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
  | { type: "result"; result: IngestedTrack }
  | { type: "error"; error: string };

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
  let result: IngestedTrack | undefined;
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
      if (event.type === "result") result = event.result;
    }
    if (chunk.done) break;
  }
  if (!result) throw new Error("The upload ended before Yoto returned the track");
  return result;
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
    <li data-testid={`track-${track.id}`} className={`file-in relative flex items-center gap-3 border-t border-ink-text/10 py-3 first:border-t-0 ${open ? "z-[1000]" : "z-0"}`}>
      <span className="font-mono text-[10px] text-ink-text/35 w-5 tabular-nums">{String(index + 1).padStart(2, "0")}</span>
      <TrackIcon
        iconUrl={track.icon?.url}
        onFetchCandidates={findIcons}
        onSelect={selectIcon}
        open={open}
        onOpenChange={onOpen}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{track.source.title}</p>
        <p className="font-mono text-[10px] uppercase tracking-wider text-ink-text/40">
          {formatDuration(track.source.duration)} · {track.state === "uploaded" ? "On Yoto media" : track.state}
        </p>
        {activeProgress?.phase === "streaming" && activeProgress.transferPercent !== undefined ? (
          <div className="mt-1.5 h-1 bg-ink-text/10 rounded-full overflow-hidden" aria-hidden="true">
            <div className="h-full bg-brass transition-[width] duration-200" style={{ width: `${activeProgress.transferPercent}%` }} />
          </div>
        ) : null}
        {track.error ? <p className="text-xs text-red-700 mt-1">{track.error}</p> : null}
      </div>
      <button type="button" onClick={onRemove} className="press font-mono text-[10px] uppercase text-ink-text/35 hover:text-red-700">Remove</button>
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
      const tracks = card.tracks.filter((track) => track.id !== trackId);
      if (card.coverSourceTrackId !== trackId) {
        return { ...card, updatedAt: new Date().toISOString(), tracks };
      }
      const fallback = tracks.find((track) => track.source.thumbnail);
      return {
        ...card,
        updatedAt: new Date().toISOString(),
        tracks,
        coverImageUrl: fallback?.source.thumbnail,
        coverSourceTrackId: fallback?.id,
      };
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
    if (!window.confirm(`Remove “${card.title}” from this list? This won’t delete anything already on Yoto.`)) return;
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

  const publish = async () => {
    if (!selected || selected.tracks.length === 0 || publishing) return;
    if (!cardTitleReady) {
      setNotice("Give this card a specific title before sending it to Yoto.");
      return;
    }
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
      const result = await jsonRequest<{ yotoCardId: string; replacedDeletedCard?: boolean }>("/api/yoto/cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: next.title,
          tracks: next.tracks.map((track) => ({ ...track.ingested!, icon: track.icon })),
          existingCardId: next.yotoCardId,
          coverImageUrl: next.coverImageUrl,
        }),
      });
      next = { ...next, yotoCardId: result.yotoCardId };
      replaceCard(next);
      setNotice(result.replacedDeletedCard
        ? "The previous Yoto card was gone, so a replacement was filed with the current name."
        : "Filed on Yoto. You can keep editing and publish again.");
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

  if (!ready) return <main className="mx-auto max-w-5xl w-full p-8"><LoadingDots label="Opening your cards" /></main>;

  return (
    <main className="mx-auto max-w-5xl w-full p-5 sm:p-10 flex flex-col gap-7 file-in">
      <header className="flex items-start justify-between gap-5">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-brass">Make cards from YouTube</p>
          <h1 className="font-display text-4xl font-semibold">yotube</h1>
          <p className="text-paper/60 text-sm mt-1">Turn YouTube links into audio cards you can play on Yoto.</p>
        </div>
        <YotoConnectStatus />
      </header>

      <YotoOnboarding />

      <div className="grid md:grid-cols-[14rem_1fr] gap-5 items-start">
        <aside className="flex flex-col gap-2">
          <button type="button" onClick={createCard} className="press border border-dashed border-paper/30 hover:border-brass text-paper/70 hover:text-brass rounded-sm py-3 font-mono text-xs uppercase tracking-wider">+ New card</button>
          {cards.map((card) => (
            <button key={card.id} type="button" onClick={() => {
              setSelectedId(card.id);
              setNotice(undefined);
              setOpenIcon(undefined);
            }} className={`press text-left rounded-sm border-l-4 p-3 transition-colors ${card.id === selectedId ? "bg-paper text-ink-text border-brass" : "bg-ink-panel text-paper border-paper/15 hover:border-brass"}`}>
              <span className="block font-display font-semibold truncate">{card.title || "New card"}</span>
              <span className="font-mono text-[10px] uppercase opacity-50">{card.tracks.length} track{card.tracks.length === 1 ? "" : "s"}{card.yotoCardId ? " · on Yoto" : ""}</span>
            </button>
          ))}
          <p className="text-xs leading-relaxed text-paper/50 mt-2">This list stays on this device. Anything already sent to Yoto stays there.</p>
        </aside>

        {selected ? (
          <section className="bg-paper text-ink-text rounded-sm shadow-2xl shadow-black/30 border-l-4 border-brass overflow-visible">
            <div className="p-5 sm:p-7 flex flex-col gap-5">
              <div className="grid grid-cols-[5.5rem_1fr_auto] gap-4 items-start">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="card-cover" className="font-mono text-[9px] uppercase tracking-[0.16em] text-ink-text/45">Card image</label>
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
                    className="w-full bg-transparent border-b border-ink-text/15 py-1 font-mono text-[9px] text-ink-text/55 outline-none focus:border-brass disabled:opacity-40"
                  >
                    {!selected.coverSourceTrackId ? <option value="">Use the first video image</option> : null}
                    {selected.tracks.filter((track) => track.source.thumbnail).map((track, index) => (
                      <option key={track.id} value={track.id}>{index + 1}. {track.source.title}</option>
                    ))}
                  </select>
                </div>
                <div className="min-w-0 flex flex-col gap-1.5">
                  <label htmlFor="card-title" className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-text/55">Card name</label>
                  <input
                    id="card-title"
                    value={selected.title}
                    onChange={(event) => replaceCard({ ...selected, title: event.target.value })}
                    placeholder="Give your card a name"
                    aria-required="true"
                    className="font-display text-2xl font-semibold bg-transparent border-b border-ink-text/15 outline-none min-w-0 py-1 placeholder:text-ink-text/25 focus:border-brass"
                  />
                  <p className="text-[11px] text-ink-text/40">This is the name you’ll see in Yoto.</p>
                </div>
                <button type="button" onClick={() => deleteCard(selected)} className="font-mono text-[10px] uppercase text-ink-text/35 hover:text-red-700">Remove card</button>
              </div>

              <form onSubmit={addTrack} className="flex flex-col gap-1.5">
                <label htmlFor="youtube-track" className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-text/45">Add a track</label>
                <div className={`grid grid-cols-[auto_1fr_auto] items-stretch rounded-sm border bg-ink-text/[0.04] overflow-hidden transition-colors focus-within:border-brass ${trackInputError ? "border-red-700/50" : "border-ink-text/15"}`}>
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
                    className="min-w-0 bg-transparent outline-none px-3 py-3 font-mono text-xs placeholder:text-ink-text/30 disabled:opacity-50"
                  />
                  <button disabled={lookingUp || !extractVideoId(trackInput)} className="press bg-ink text-paper hover:bg-brass hover:text-ink-text disabled:opacity-35 px-4 font-mono text-[10px] uppercase tracking-wider">
                    {lookingUp ? "Reading…" : "Add track"}
                  </button>
                </div>
                <p id="youtube-track-help" className={`text-[11px] ${trackInputError ? "text-red-700" : "text-ink-text/40"}`}>
                  {trackInputError ?? "Paste a link or video ID. Press Enter to keep adding."}
                </p>
              </form>

              {selected.tracks.length ? (
                <ol>
                  {selected.tracks.map((track, index) => (
                    <TrackRow key={track.id} track={track} index={index} open={openIcon === track.id} onOpen={(open) => setOpenIcon(open ? track.id : undefined)} onChange={(changed) => updateTrack(selected.id, changed)} onRemove={() => removeTrack(selected.id, track.id)} activeProgress={publishing && uploadCardId === selected.id && uploadProgress?.trackIndex === index + 1 ? uploadProgress : undefined} />
                  ))}
                </ol>
              ) : <p className="text-sm text-ink-text/45 py-5 text-center">Add one or more YouTube links to get started. You can choose an icon for each audio track if you’d like.</p>}

              {uploadProgress && uploadCardId === selected.id ? (
                <UploadDocket
                  progress={uploadProgress}
                  elapsedMs={elapsedMs}
                  onCancel={publishing ? () => uploadController.current?.abort() : undefined}
                />
              ) : null}

              <div className="flex flex-wrap items-center gap-3 border-t border-ink-text/10 pt-5">
                <button type="button" onClick={publish} disabled={publishing || !cardTitleReady || selected.tracks.length === 0} className="press bg-brass text-ink-text disabled:opacity-40 rounded-sm px-5 py-3 font-mono text-xs uppercase tracking-wider font-medium">
                  {publishing ? <LoadingDots label="Routing to Yoto" className="text-ink-text" /> : selected.yotoCardId ? "Update on Yoto" : "Send to Yoto"}
                </button>
                {selected.yotoCardId ? (
                  <>
                    <a href={`https://my.yotoplay.com/card/${selected.yotoCardId}/edit`} target="_blank" rel="noreferrer" className="stage-stamp font-mono text-[10px] uppercase tracking-wider text-ink-text">Filed · open ↗</a>
                    <button
                      type="button"
                      disabled={publishing}
                      onClick={() => {
                        replaceCard({ ...selected, yotoCardId: undefined });
                        setUploadProgress(undefined);
                        setUploadCardId(undefined);
                        setNotice("The old Yoto link is cleared. Send to Yoto to create a replacement with this name.");
                      }}
                      className="press font-mono text-[9px] uppercase tracking-wider text-ink-text/35 hover:text-red-700 disabled:opacity-40"
                    >
                      Card deleted? Create replacement
                    </button>
                  </>
                ) : null}
                {notice ? <p className="text-xs text-ink-text/60">{notice}</p> : null}
              </div>
            </div>
          </section>
        ) : (
          <section className="border border-dashed border-paper/20 rounded-sm p-12 text-center">
            <p className="font-display text-2xl text-paper/70">Make your first card.</p>
            <button onClick={createCard} className="press mt-4 text-brass font-mono text-xs uppercase tracking-wider">Create the first card →</button>
          </section>
        )}
      </div>
    </main>
  );
}
