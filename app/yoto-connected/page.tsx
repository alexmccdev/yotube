"use client";

import { useEffect } from "react";

export default function YotoConnectedPage() {
  useEffect(() => {
    const timer = window.setTimeout(() => window.close(), 600);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <main className="min-h-screen flex items-center justify-center p-8">
      <div className="rounded-md border border-signal/30 bg-ink-panel px-8 py-7 text-center shadow-2xl shadow-black/30">
        <span className="mx-auto mb-3 block h-2 w-2 rounded-full bg-signal shadow-[0_0_18px_var(--color-signal)]" />
        <h1 className="font-display text-2xl font-semibold tracking-[-0.025em] text-paper">Yoto connected</h1>
        <p className="mt-2 text-sm text-paper/55">You can close this window and return to your card.</p>
      </div>
    </main>
  );
}
