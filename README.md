# Yotube

A local, single-user Next.js app that rips YouTube audio via `yt-dlp`/`ffmpeg`, organizes it into Yoto-card-ready MP3s with ID3 tags, and pushes finished cards straight into your Yoto account.

## What it does

1. Paste one or more YouTube URLs (or bare 11-char video IDs) into a new card — live title preview shows up as you type.
2. Tracks download and tag in the background (bounded 3-at-a-time queue), with retry/reorder/rename support.
3. "Finalize" re-encodes each track to a small mono 48kbps MP3 (down from whatever bitrate the source was) and writes it to `cards/<Card Title>/NN - Track Title.mp3`.
4. "Push to Yoto" uploads the finalized tracks to your Yoto account and creates the card there directly — no manual drag-and-drop into `my.yotoplay.com`.

No database — card/track state lives in `work/<card-id>/state.json` (JSON file is the source of truth; in-memory `Map` is just a read cache, survives dev-server reloads).

## Stack

Next.js (App Router) + TypeScript + Tailwind v4. Plain route handlers under `app/api/` (no Hono — tried it, removed it, not worth it for ~10 small endpoints).

## Key files

- [lib/jobs.ts](lib/jobs.ts) — Card/Track types, state persistence, processing queue, finalize logic, post-finalize cleanup.
- [lib/ytdlp.ts](lib/ytdlp.ts) — `yt-dlp`/`ffmpeg` wrappers: metadata fetch, audio download, tag-and-encode (48kbps mono MP3).
- [lib/yoto-auth.ts](lib/yoto-auth.ts) — Yoto OAuth (PKCE + loopback callback server on `127.0.0.1:8787`), token storage/refresh in `work/.yoto-auth.json`.
- [lib/yoto-api.ts](lib/yoto-api.ts) — uploads tracks to Yoto (presigned URL → PUT → poll transcode), then creates the card via `POST /content`.
- [lib/validate.ts](lib/validate.ts) — YouTube URL/ID parsing.
- [lib/format.ts](lib/format.ts) — duration formatting, cosmetic catalog numbers.
- Routes: [app/page.tsx](app/page.tsx) (new card), [app/cards/page.tsx](app/cards/page.tsx) (library list), [app/cards/[id]/page.tsx](app/cards/[id]/page.tsx) (card detail — reorder/rename/retry/finalize/push), `app/api/cards/...` (REST), `app/api/yoto/...` (connect/status).

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
