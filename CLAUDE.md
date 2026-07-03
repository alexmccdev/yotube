# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## What this is

A local, single-user Next.js app that rips YouTube audio via `yt-dlp`/`ffmpeg`, organizes it into Yoto-card-ready MP3s with ID3 tags, and pushes finished cards straight into the user's Yoto account. No database — card/track state lives in `work/<card-id>/state.json` (JSON file is the source of truth; the in-memory `Map` in [lib/jobs.ts](lib/jobs.ts) is just a read cache that survives dev-server reloads).

## Commands

```bash
npm run dev              # start dev server on :3000 (Next refuses a second instance per project dir)
npm run build             # production build
npm run lint               # eslint
npm test                     # vitest run (all *.test.ts, node environment)
npx vitest run lib/jobs.test.ts   # run a single test file
npx tsc --noEmit          # typecheck
```

Verification pattern after changes: `npx tsc --noEmit` + `npx eslint .` (both clean) + a live functional check against the running dev server. `electron/**` is excluded from eslint.

After adding new `app/api/.../route.ts` files, run `rm -rf .next && npx next typegen` before `tsc --noEmit` to avoid phantom `RouteContext` errors.

## Architecture

Plain route handlers under `app/api/` (no Hono — tried it, removed it, not worth it for ~10 small endpoints).

- [lib/jobs.ts](lib/jobs.ts) — `Card`/`Track` types, JSON state persistence, bounded-concurrency (3) processing queue, finalize logic, post-finalize icon/cover auto-assignment. This is the core module; almost everything else feeds into or reads from it.
- [lib/ytdlp.ts](lib/ytdlp.ts) — `yt-dlp`/`ffmpeg` wrappers: metadata fetch, audio download + loudness normalization (64kbps AAC). No ID3 tagging — Yoto gets track titles from the JSON payload in `pushCardToYoto`, not file metadata, so finalize just copies the file.
- [lib/yoto-auth.ts](lib/yoto-auth.ts) — Yoto OAuth (PKCE + loopback callback server on `127.0.0.1:8787`), token storage/refresh in `work/.yoto-auth.json`.
- [lib/yoto-api.ts](lib/yoto-api.ts) — uploads tracks to Yoto (presigned URL → PUT → poll transcode), then creates the card via `POST /content`.
- [lib/stage.ts](lib/stage.ts) — derives the 4-stage lifecycle UI (created/editing/staged/on-yoto) from card/track state.
- [lib/validate.ts](lib/validate.ts) — YouTube URL/ID parsing.
- [lib/format.ts](lib/format.ts) — duration formatting, cosmetic catalog numbers.
- [lib/track-status.ts](lib/track-status.ts) — the `TrackStatus` union shared across jobs/stage/UI.
- Routes: [app/new-card/page.tsx](app/new-card/page.tsx) (new card), [app/cards/page.tsx](app/cards/page.tsx) (library list), [app/cards/[id]/page.tsx](app/cards/[id]/page.tsx) (card detail — reorder/rename/retry/finalize/push), `app/api/cards/...` (REST), `app/api/yoto/...` (connect/status).

### Card lifecycle

Card states: draft (`finalized: false`) → tracks download through `queued → fetching → downloading → ready` (or `error`) — audio is already loudness-normalized at download time — → "Finalize" copies each ready track's file into `cards/<Card Title>/NN - Track Title.m4a`, marks it `done`, and sets `finalized: true` → "Push to Yoto" uploads and sets `yotoCardId`. A finalized card is locked (`isLocked()` in jobs.ts) — editing requires `unstageCard()` first, and unlinking from Yoto (`clearYotoCardId()`) also unstages it since the linked card no longer reflects local edits.

### Yoto integration

Uses Yoto's official developer API ([yoto.dev/api](https://yoto.dev/api/)). Auth is account-level, not per-card — connected once from the header (red/green dot indicates status). Client is registered at [dashboard.yoto.dev](https://dashboard.yoto.dev/) with `YOTO_CLIENT_ID` in `.env.local` (gitignored) and callback URL `http://127.0.0.1:8787/callback`.

## Design system

"Library card-catalog" identity — dark ink page background, paper-colored index-card panels with a brass left-tab accent and a cosmetic catalog number. Fraunces for titles, IBM Plex Sans for UI text, IBM Plex Mono for all data (durations, counts, status, catalog numbers).

## Known limitations

- Age-restricted videos fail (`yt-dlp`: "Sign in to confirm your age") — no browser cookies are passed to `yt-dlp`.
- Single-user, local-only — no auth on the app itself, no multi-card-library sharing.

## Electron app

`npm run electron` runs the packaged-style app against the dev build; `npm run electron:build`/`electron:dist` package it via `electron-builder` into `dist/` (requires `PYTHON_PATH` pointed at [build/python3-dmg-wrapper.sh](build/python3-dmg-wrapper.sh)). On macOS, packaged app data lives under `~/Library/Application Support/Yotube/` (see [electron/main.js](electron/main.js)) — separate from the repo's `work/`/`cards/` dirs used by `npm run dev`.

Two local-build quirks this repo works around:
- electron-builder skips code signing without a paid Developer ID cert, leaving the `.app` with a stale signature that fails to launch on Apple Silicon — [build/afterSign.js](build/afterSign.js) ad-hoc re-signs it after every build.
- Homebrew's `python3` pyexpat links against a libexpat newer than macOS ships, breaking dmg-builder — [build/python3-dmg-wrapper.sh](build/python3-dmg-wrapper.sh) points it at Homebrew's own `expat` lib instead.

`build/install-hooks.sh` (run once) enables a `post-commit` git hook that rebuilds and reinstalls `/Applications/Yotube.app` in the background after every commit (zip target only). Logs to `build/post-commit-install.log`.
