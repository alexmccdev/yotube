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
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          title="Yoto account"
          className="press pop-in flex min-h-11 items-center gap-2 rounded-full border border-signal/25 bg-signal/10 px-3 py-1.5 font-mono text-[10px] text-signal transition-colors hover:border-signal/50 hover:text-paper sm:min-h-0 sm:text-[11px]"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-green-500 shrink-0" />
          Yoto connected
        </button>

        {menuOpen && (
          <div role="menu" className="pop-in absolute right-0 top-full z-20 mt-2 flex w-48 flex-col rounded-sm border border-ink-text/15 bg-paper p-1.5 text-ink-text shadow-xl">
            <p className="px-2 pb-1.5 pt-1 font-mono text-[10px] text-ink-text/45">
              Account connected
            </p>
            <button
              type="button"
              role="menuitem"
              onClick={disconnectAccount}
              className="press min-h-11 rounded-sm px-2 py-1.5 text-left font-mono text-xs text-ink-text/60 transition-colors hover:bg-red-700/10 hover:text-red-800"
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
      className="press flex min-h-11 items-center gap-2 rounded-full border border-paper/15 px-3 py-1.5 font-mono text-[10px] text-paper/70 transition-colors hover:border-signal/50 hover:text-signal sm:min-h-0 sm:text-[11px]"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-red-500 shrink-0" />
      Set up Yoto
    </button>
  );
}
