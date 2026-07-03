"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import LoadingDots from "@/app/components/LoadingDots";
import { useHealthStatus } from "@/app/components/useHealthStatus";
import { useYotoConnect } from "@/app/components/useYotoConnect";
import { useYotoStatus } from "@/app/components/useYotoStatus";

function Step({
  done,
  title,
  children,
}: {
  done: boolean;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <span
          className={`font-mono text-xs w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${
            done ? "bg-brass text-ink-text" : "border border-paper/25 text-transparent"
          }`}
        >
          ✓
        </span>
        <span className={`text-sm ${done ? "text-paper/40 line-through" : "text-paper/90"}`}>
          {title}
        </span>
      </div>
      {!done && children && <div className="pl-6 flex flex-col gap-1.5">{children}</div>}
    </div>
  );
}

export default function GettingStarted() {
  const [clientId, setClientId] = useState<string | null>(null);
  const [howOpen, setHowOpen] = useState(false);
  const { ytDlpOk, ffmpegOk } = useHealthStatus();
  const { connected, setConnected } = useYotoStatus();
  const { connect, connecting, error } = useYotoConnect(() => setConnected(true));

  useEffect(() => {
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;
    const poll = async () => {
      const settings = await fetch("/api/settings").then((r) => r.json()).catch(() => null);
      if (cancelled) return;
      const id = settings?.clientId ?? "";
      setClientId(id);
      // Client ID rarely changes mid-session once set — nothing left to watch.
      if (id && interval) {
        clearInterval(interval);
        interval = null;
      }
    };
    poll();
    interval = setInterval(poll, 5000);
    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, []);

  const loaded = ytDlpOk !== null && ffmpegOk !== null && clientId !== null && connected !== null;

  if (!loaded) return null;

  const depsReady = ytDlpOk && ffmpegOk;
  const hasClientId = Boolean(clientId);
  const allDone = depsReady && hasClientId && connected;

  if (allDone) return null;

  return (
    <div className="pop-in bg-brass/10 text-paper border-l-4 border-brass rounded-sm px-4 py-3 flex flex-col gap-3">
      <h2 className="font-mono text-xs uppercase tracking-wider text-brass">Getting started</h2>

      <Step done={Boolean(depsReady)} title="Dependencies ready">
        {!ytDlpOk && (
          <p className="font-mono text-xs text-paper/60">
            Missing <span className="text-brass">yt-dlp</span> — <code>brew install yt-dlp</code>
          </p>
        )}
        {!ffmpegOk && (
          <p className="font-mono text-xs text-paper/60">
            Missing <span className="text-brass">ffmpeg</span> — <code>brew install ffmpeg</code>
          </p>
        )}
      </Step>

      <Step done={hasClientId} title="Add your Yoto Client ID">
        <button
          type="button"
          onClick={() => setHowOpen((open) => !open)}
          className="press self-start font-mono text-xs uppercase tracking-wider text-paper/50 hover:text-brass transition-colors"
        >
          {howOpen ? "Hide how ▲" : "How ▼"}
        </button>
        {howOpen && (
          <ol className="list-decimal list-inside text-xs text-paper/60 flex flex-col gap-0.5">
            <li>
              Register an app at{" "}
              <a
                href="https://dashboard.yoto.dev/"
                target="_blank"
                rel="noreferrer"
                className="text-brass hover:underline"
              >
                dashboard.yoto.dev
              </a>
            </li>
            <li>
              Set redirect URI to <code>http://127.0.0.1:8787/callback</code>
            </li>
            <li>Copy the client ID</li>
            <li>
              Paste it in{" "}
              <Link href="/settings" className="text-brass hover:underline">
                Settings
              </Link>
            </li>
          </ol>
        )}
      </Step>

      <Step done={Boolean(connected)} title="Connect your Yoto account">
        {hasClientId ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={connecting}
              onClick={connect}
              className="press font-mono text-xs uppercase tracking-wider bg-brass text-ink-text px-3 py-1.5 rounded-sm hover:bg-brass/80 transition-colors disabled:opacity-50"
            >
              {connecting ? <LoadingDots label="Connecting" className="font-mono text-xs text-ink-text" /> : "Connect Yoto"}
            </button>
            {error && <span className="font-mono text-xs text-red-400">{error}</span>}
          </div>
        ) : (
          <p className="font-mono text-xs text-paper/50">Add a client ID first.</p>
        )}
      </Step>
    </div>
  );
}
