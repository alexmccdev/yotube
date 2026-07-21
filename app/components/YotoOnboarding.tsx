"use client";

import { useState } from "react";
import LoadingDots from "@/app/components/LoadingDots";
import { useYotoConnect } from "@/app/components/useYotoConnect";
import { useYotoStatus } from "@/app/components/useYotoStatus";
import { isValidYotoClientId, readStoredYotoClientId, storeYotoClientId } from "@/lib/yoto-client-id";

export default function YotoOnboarding() {
  const [clientId, setClientId] = useState(readStoredYotoClientId);
  const [copied, setCopied] = useState(false);
  const { connected, error: statusError, setConnected } = useYotoStatus();
  const { connect, connecting, error: connectError } = useYotoConnect(() => setConnected(true));

  if (connected !== false) return null;

  const error = connectError ?? statusError;
  const callbackUrl = `${window.location.origin}/api/yoto/callback`;
  const clientIdReady = isValidYotoClientId(clientId);

  return (
    <section
      aria-labelledby="connect-yoto-title"
      className="file-in overflow-hidden rounded-sm border-l-4 border-brass bg-ink-panel shadow-xl shadow-black/20"
    >
      <div className="grid gap-6 p-5 lg:grid-cols-[1.08fr_0.92fr] lg:items-start sm:p-7">
        <div className="max-w-xl">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-brass">
            One-time setup
          </p>
          <h2 id="connect-yoto-title" className="mt-1 font-display text-2xl font-semibold text-paper">
            Let’s connect your Yoto account
          </h2>
          <p className="mt-2 max-w-lg text-base leading-relaxed text-paper/75">
            This lets you send the cards you make here to your Yoto library. You only need to do this once on this device.
          </p>

          <ol className="mt-5 flex flex-col gap-4" aria-label="Yoto connection steps">
            <li className="flex gap-3 rounded-sm bg-black/10 p-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brass font-mono text-xs font-semibold text-ink-text">1</span>
              <div>
                <h3 className="font-semibold text-paper">Create a Yoto developer app</h3>
                <p className="mt-0.5 text-sm leading-relaxed text-paper/70">
                  Open the{" "}
                  <a href="https://dashboard.yoto.dev/" target="_blank" rel="noreferrer" className="text-brass underline decoration-brass/35 underline-offset-2 hover:text-paper">
                    Yoto Developer Dashboard ↗
                  </a>{" "}
                  and create an app.
                </p>
              </div>
            </li>
            <li className="flex gap-3 rounded-sm bg-black/10 p-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brass font-mono text-xs font-semibold text-ink-text">2</span>
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold text-paper">Tell Yoto where to send you back</h3>
                <p className="mt-0.5 text-sm leading-relaxed text-paper/70">
                  Find <strong className="font-semibold text-paper/75">Allowed Callback URLs</strong> in your new app and paste this address:
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <code className="min-w-0 flex-1 overflow-x-auto rounded-sm bg-black/20 px-2 py-1.5 font-mono text-[10px] text-paper/80">{callbackUrl}</code>
                  <button
                    type="button"
                    onClick={async () => {
                      await navigator.clipboard.writeText(callbackUrl);
                      setCopied(true);
                      window.setTimeout(() => setCopied(false), 1500);
                    }}
                    className="press shrink-0 rounded-sm border border-brass/40 px-2 py-1.5 font-mono text-[9px] uppercase tracking-wider text-brass hover:border-brass hover:text-paper"
                  >
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
              </div>
            </li>
          </ol>
        </div>

        <form
          className="rounded-sm border border-paper/15 bg-paper/[0.06] p-5"
          onSubmit={(event) => {
            event.preventDefault();
            void connect(clientId);
          }}
        >
          <div className="flex items-start gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brass font-mono text-xs font-semibold text-ink-text">3</span>
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold text-paper">Paste your Client ID</h3>
              <label htmlFor="yoto-client-id" className="mt-0.5 block text-sm leading-relaxed text-paper/70">
                Copy the long Client ID shown in your new Yoto app, then paste it below.
              </label>
              <input
                id="yoto-client-id"
                type="text"
                value={clientId}
                autoComplete="off"
                spellCheck={false}
                placeholder="Paste your Client ID"
                onChange={(event) => setClientId(storeYotoClientId(event.target.value))}
                className="mt-2 w-full rounded-sm border border-paper/20 bg-ink px-3 py-2.5 font-mono text-sm text-paper outline-none transition-colors placeholder:text-paper/25 focus:border-brass"
              />
              <p className="mt-2 text-xs leading-relaxed text-paper/55">
                This identifies the Yoto app you just created. It is not your password.
              </p>
            </div>
          </div>
          <button
            type="submit"
            disabled={connecting || !clientIdReady}
            className="press mt-4 w-full rounded-sm bg-brass px-5 py-3 font-mono text-xs uppercase tracking-wider text-ink-text transition-colors hover:bg-paper disabled:cursor-not-allowed disabled:opacity-40"
          >
            {connecting ? <LoadingDots label="Waiting for Yoto" /> : "Continue with Yoto"}
          </button>
        </form>
      </div>

      {error ? (
        <p role="alert" className="border-t border-red-300/15 bg-red-950/25 px-5 py-3 text-xs leading-relaxed text-red-200 sm:px-6">
          {error}
        </p>
      ) : null}
    </section>
  );
}
