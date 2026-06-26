"use client";

import { useEffect, useRef, useState } from "react";
import LoadingDots from "@/app/components/LoadingDots";

export default function YotoConnectStatus() {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetch("/api/yoto/status")
      .then((res) => res.json())
      .then((body) => setConnected(body.connected))
      .catch(() => setConnected(false));
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const connect = async () => {
    setConnecting(true);
    setError(null);
    const res = await fetch("/api/yoto/connect", { method: "POST" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setConnecting(false);
      setError(body.error ?? "Failed to connect");
      return;
    }

    window.open(body.authorizeUrl, "_blank");

    let attempts = 0;
    pollRef.current = setInterval(async () => {
      attempts += 1;
      const statusRes = await fetch("/api/yoto/status");
      const statusBody = await statusRes.json().catch(() => ({}));
      if (statusBody.connected) {
        if (pollRef.current) clearInterval(pollRef.current);
        setConnecting(false);
        setConnected(true);
        return;
      }
      if (statusBody.error) {
        if (pollRef.current) clearInterval(pollRef.current);
        setConnecting(false);
        setError(statusBody.error);
        return;
      }
      if (attempts > 80) {
        if (pollRef.current) clearInterval(pollRef.current);
        setConnecting(false);
        setError("Timed out waiting for Yoto login");
      }
    }, 1500);
  };

  const disconnectAccount = async () => {
    setMenuOpen(false);
    await fetch("/api/yoto/connect", { method: "DELETE" });
    setConnected(false);
  };

  if (connected === null) return null;

  if (connected) {
    return (
      <div className="relative">
        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          title="Yoto account"
          className="press pop-in font-mono text-xs uppercase tracking-wider text-green-500/80 hover:text-green-400 transition-colors flex items-center gap-1.5"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-green-500 shrink-0" />
          Yoto
        </button>

        {menuOpen && (
          <div className="pop-in absolute z-10 top-full right-0 mt-1.5 w-44 bg-paper text-ink-text border border-ink-text/15 rounded-sm shadow-xl p-1.5 flex flex-col">
            <p className="font-mono text-[10px] uppercase tracking-wider text-ink-text/40 px-2 pt-1 pb-1.5">
              Account connected
            </p>
            <button
              type="button"
              onClick={disconnectAccount}
              className="press text-left font-mono text-xs uppercase tracking-wider text-ink-text/60 hover:text-red-700 transition-colors px-2 py-1 rounded-sm hover:bg-ink-text/5"
            >
              Disconnect
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {error && <span className="font-mono text-xs text-red-400">{error}</span>}
      <button
        type="button"
        disabled={connecting}
        onClick={connect}
        className="press font-mono text-xs uppercase tracking-wider text-paper/70 hover:text-brass transition-colors disabled:opacity-50 flex items-center gap-1.5"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-red-500 shrink-0" />
        {connecting ? <LoadingDots label="Connecting" /> : "Connect Yoto"}
      </button>
    </div>
  );
}
