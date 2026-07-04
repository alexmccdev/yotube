<p align="center">
  <img src="build/icon.png" alt="Yotube" width="160">
</p>

# Yotube

A local, single-user Next.js app that rips YouTube audio via `yt-dlp`/`ffmpeg`, organizes it into Yoto-card-ready `.m4a` tracks, and pushes finished cards straight into your Yoto account.

## Getting started

1. **Install the audio tools**: `brew install yt-dlp ffmpeg` (or your platform's equivalent). The app checks for both on startup and warns (without blocking) if either is missing.
2. **Register a Yoto app** at [dashboard.yoto.dev](https://dashboard.yoto.dev/), setting the redirect URI to `http://127.0.0.1:8787/callback`.
3. **Add the client ID** — paste it into `/settings` once the app is running, or set `YOTO_CLIENT_ID` in `.env.local` (gitignored).
4. **Connect your Yoto account** from the header's "Connect Yoto" button — it opens Yoto's login in a new tab; a loopback server on `127.0.0.1:8787` catches the OAuth callback.
5. `npm install && npm run dev`, then open [localhost:3000](http://localhost:3000).

A "Getting started" checklist on the library home page walks through steps 1–4 live and disappears once everything's connected; a slim banner separately warns if `yt-dlp`/`ffmpeg` goes missing later.

## What it does

1. Paste one or more YouTube URLs (or bare 11-char video IDs) into a new card — live title preview shows up as you type.
2. Tracks download in the background (bounded 3-at-a-time queue), with retry/reorder/rename support.
3. "Finalize" copies each ready track into `cards/<Card Title>/NN - Track Title.m4a` (128kbps AAC, already normalized at download time) and locks the card for editing.
4. "Push to Yoto" uploads the finalized tracks to your Yoto account and creates the card there directly — no manual drag-and-drop into `my.yotoplay.com`.

No database — card/track state lives in `work/<card-id>/state.json` (JSON file is the source of truth; in-memory `Map` is just a read cache, survives dev-server reloads).

## Stack

Next.js (App Router) + TypeScript + Tailwind v4. Plain route handlers under `app/api/` (no Hono — tried it, removed it, not worth it for ~10 small endpoints).

## Key files

- [lib/jobs.ts](lib/jobs.ts) — Card/Track types, state persistence, processing queue, finalize logic, post-finalize cleanup.
- [lib/ytdlp.ts](lib/ytdlp.ts) — `yt-dlp`/`ffmpeg` wrappers: metadata fetch, audio download (128kbps AAC `.m4a`, matching Yoto's own transcode target), binary presence check (`checkBinaries`).
- [lib/yoto-auth.ts](lib/yoto-auth.ts) — Yoto OAuth (PKCE + loopback callback server on `127.0.0.1:8787`), token storage/refresh in `work/.yoto-auth.json`.
- [lib/yoto-api.ts](lib/yoto-api.ts) — uploads tracks to Yoto (presigned URL → PUT → poll transcode), then creates the card via `POST /content`.
- [lib/validate.ts](lib/validate.ts) — YouTube URL/ID parsing.
- [lib/format.ts](lib/format.ts) — duration formatting, cosmetic catalog numbers.
- [lib/onboarding.ts](lib/onboarding.ts) — localStorage state (view counts) backing the contextual hints below.
- [app/components/GettingStarted.tsx](app/components/GettingStarted.tsx), [DependencyBanner.tsx](app/components/DependencyBanner.tsx), [Hint.tsx](app/components/Hint.tsx) — the onboarding UI described above.
- Routes: [app/new-card/page.tsx](app/new-card/page.tsx) (new card), [app/cards/page.tsx](app/cards/page.tsx) (library list), [app/cards/[id]/page.tsx](app/cards/[id]/page.tsx) (card detail — reorder/rename/retry/finalize/push), `app/api/cards/...` (REST), `app/api/yoto/...` (connect/status), `app/api/health` (`{ ytDlpOk, ffmpegOk }`).

## Yoto integration

Uses Yoto's official developer API ([yoto.dev](https://yoto.dev)). Auth is account-level, not per-card — connect once from the header on the home page or library page (shows a red dot when disconnected, green when connected). Client is registered at [dashboard.yoto.dev](https://dashboard.yoto.dev) with `YOTO_CLIENT_ID` set in `.env.local` (gitignored) and callback URL `http://127.0.0.1:8787/callback`.

Once connected, any finalized card shows a "Push to Yoto" button. On success it shows an "On Yoto" pill (card detail and library list) linking to the card's edit page on `my.yotoplay.com`. If the card gets deleted on Yoto's side, "Reset Yoto status" clears the local link without affecting anything remote.

## Design system

"Library card-catalog" identity — dark ink page background, paper-colored index-card panels with a brass left-tab accent and a cosmetic catalog number. Fraunces for titles, IBM Plex Sans for UI text, IBM Plex Mono for all data (durations, counts, status, catalog numbers).

## Known limitations

- **Age-restricted videos fail** (`yt-dlp`: "Sign in to confirm your age") — no browser cookies are passed to `yt-dlp`. Not yet implemented; would be an opt-in `YT_DLP_COOKIES_FROM_BROWSER` env var if added.
- Single-user, local-only — no auth on the app itself, no multi-card-library sharing.

## Dev notes

- `npm run dev` runs on port 3000; Next refuses a second instance per project directory.
- After adding new `app/api/.../route.ts` files, run `rm -rf .next && npx next typegen` before `tsc --noEmit` to avoid phantom `RouteContext` errors.
- Verification pattern: `npx tsc --noEmit` + `npx eslint .` (both clean) + a live functional check against the running dev server.

## Electron app

`npm run electron` runs the packaged-style app against the dev build; `npm run electron:dist` builds and packages it via `electron-builder` into `dist/`. On macOS, app data lives under `~/Library/Application Support/Yotube/` (see [electron/main.js](electron/main.js)) — separate from the repo's `work/`/`cards/` dirs used by `npm run dev`, and untouched by reinstalling the app.

Two local-build quirks this repo works around:
- electron-builder skips code signing without a paid Developer ID cert, which leaves the `.app` with a stale signature that fails to launch on Apple Silicon. [build/afterSign.js](build/afterSign.js) ad-hoc re-signs it after every build.
- Homebrew's `python3` pyexpat is linked against a libexpat newer than macOS ships, which breaks dmg-builder. [build/python3-dmg-wrapper.sh](build/python3-dmg-wrapper.sh) (used by `electron:build`/`electron:dist` via `PYTHON_PATH`) points it at Homebrew's own `expat` lib instead.

Run `build/install-hooks.sh` once to enable a `post-commit` git hook that rebuilds and reinstalls `/Applications/Yotube.app` in the background after every commit (zip target only, skips the slower DMG step). Logs to `build/post-commit-install.log`.
