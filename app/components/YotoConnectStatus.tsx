"use client";

import { useState } from "react";
import { useYotoStatus } from "@/app/components/useYotoStatus";

export default function YotoConnectStatus() {
  const { connected, setConnected } = useYotoStatus();
  const [menuOpen, setMenuOpen] = useState(false);

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
    <button
      type="button"
      onClick={() => {
        document.getElementById("yoto-client-id")?.scrollIntoView({ behavior: "smooth", block: "center" });
        document.getElementById("yoto-client-id")?.focus({ preventScroll: true });
      }}
      className="press font-mono text-xs uppercase tracking-wider text-paper/70 hover:text-brass transition-colors flex items-center gap-1.5"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-red-500 shrink-0" />
      Set up Yoto
    </button>
  );
}
