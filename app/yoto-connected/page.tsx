"use client";

import { useEffect } from "react";

export default function YotoConnectedPage() {
  useEffect(() => {
    const timer = window.setTimeout(() => window.close(), 600);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <main className="min-h-screen flex items-center justify-center p-8">
      <div className="stage-stamp bg-paper text-ink-text font-mono text-sm uppercase tracking-wider">
        Yoto connected
      </div>
    </main>
  );
}
