"use client";

import { useEffect, useRef, useState } from "react";
import LoadingDots from "@/app/components/LoadingDots";

export default function YotoConnectStatus() {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
    await fetch("/api/yoto/connect", { method: "DELETE" });
    setConnected(false);
  };

  if (connected === null) return null;

  if (connected) {
    return (
      <div className="flex items-center gap-2">
        <span className="pop-in font-mono text-xs uppercase tracking-wider text-green-500/80 flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
          Yoto connected
        </span>
        <button
          type="button"
          onClick={disconnectAccount}
          className="press font-mono text-xs uppercase tracking-wider text-paper/40 hover:text-red-400 transition-colors"
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {error && <span className="font-mono text-xs text-red-400">{error}</span>}
      <span className="h-1.5 w-1.5 rounded-full bg-red-500 shrink-0" />
      <button
        type="button"
        disabled={connecting}
        onClick={connect}
        className="press font-mono text-xs uppercase tracking-wider text-paper/70 hover:text-brass transition-colors disabled:opacity-50"
      >
        {connecting ? <LoadingDots label="Connecting" /> : "Connect Yoto account"}
      </button>
    </div>
  );
}
