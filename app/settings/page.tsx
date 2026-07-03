"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import LoadingDots from "@/app/components/LoadingDots";

export default function SettingsPage() {
  const [clientId, setClientId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const applySettings = (body: { clientId?: string }) => {
    setClientId(body.clientId ?? "");
    setDraft(body.clientId ?? "");
  };

  const reload = async () => {
    const res = await fetch("/api/settings");
    applySettings(await res.json());
  };

  useEffect(() => {
    let cancelled = false;
    fetch("/api/settings")
      .then((res) => res.json())
      .then((body) => {
        if (!cancelled) applySettings(body);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const save = async () => {
    const value = draft.trim();
    if (!value || value === clientId) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: value }),
    });
    const body = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setError(body.error ?? "Failed to save");
      return;
    }
    setMessage("Saved — reconnect your Yoto account to use it.");
    await reload();
  };

  const clear = async () => {
    setClearing(true);
    setError(null);
    setMessage(null);
    await fetch("/api/settings", { method: "DELETE" });
    setClearing(false);
    setMessage("Client ID cleared — you'll need to set one before connecting Yoto.");
    await reload();
  };

  if (clientId === null) {
    return (
      <main className="mx-auto max-w-2xl w-full p-6 sm:p-10 flex flex-col gap-6">
        <LoadingDots label="Pulling up settings…" />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl w-full p-6 sm:p-10 flex flex-col gap-6 file-in">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold text-paper">Settings</h1>
        <Link
          href="/"
          className="press font-mono text-xs uppercase tracking-wider text-paper/70 hover:text-brass transition-colors inline-block"
        >
          ← Library
        </Link>
      </div>

      <div className="bg-paper text-ink-text rounded-sm shadow-xl shadow-black/30 overflow-hidden">
        <div className="border-l-4 border-brass px-6 sm:px-8 pt-6 pb-7 flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="font-display text-lg font-semibold">Yoto Client ID</h2>
            <p className="text-sm text-ink-text/60">
              Used to connect your Yoto account. Register an app and get a client ID from{" "}
              <a
                href="https://dashboard.yoto.dev/"
                target="_blank"
                rel="noreferrer"
                className="text-brass hover:underline"
              >
                dashboard.yoto.dev
              </a>
              . See the{" "}
              <a
                href="https://yoto.dev/api/"
                target="_blank"
                rel="noreferrer"
                className="text-brass hover:underline"
              >
                API reference
              </a>{" "}
              for details.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <input
              className="flex-1 font-mono text-sm border-b border-ink-text/15 focus:border-brass outline-none bg-transparent py-1.5 placeholder:text-ink-text/30 transition-colors"
              placeholder="Client ID"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") save();
              }}
            />
            <button
              type="button"
              disabled={saving || !draft.trim() || draft.trim() === clientId}
              onClick={save}
              className="press shrink-0 bg-ink text-paper font-mono text-xs uppercase tracking-wider px-4 py-2 rounded-sm hover:bg-brass hover:text-ink-text transition-colors disabled:opacity-50"
            >
              {saving ? <LoadingDots label="Saving" className="font-mono text-xs text-paper" /> : "Save"}
            </button>
          </div>

          <div className="flex items-center justify-between">
            <p className="font-mono text-[11px] text-ink-text/40">
              {clientId ? "Custom client ID set." : "No client ID set."}
            </p>
            {clientId && (
              <button
                type="button"
                disabled={clearing}
                onClick={clear}
                className="press font-mono text-[11px] uppercase tracking-wider text-ink-text/40 hover:text-red-700 transition-colors disabled:opacity-50"
              >
                {clearing ? "Clearing…" : "Clear"}
              </button>
            )}
          </div>

          {message && <p className="pop-in text-sm text-brass">{message}</p>}
          {error && <p className="text-sm text-red-700">{error}</p>}
        </div>
      </div>
    </main>
  );
}
