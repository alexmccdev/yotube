# CLAUDE.md

@AGENTS.md

## Product

Yotube is a browser-first Next.js app that turns YouTube links into audio cards in a user's own Yoto account. This web workflow is the sole supported product surface.

The app deliberately has no database, account system, server-side catalog, or staged media files:

- The Browser Catalog and each user's Yoto Client ID persist in versioned `localStorage`.
- Yoto OAuth tokens live in an encrypted, `HttpOnly`, `SameSite=Lax` cookie with no server-side session record.
- `yt-dlp` sends the selected M4A to stdout and the Track Ingest Module streams it directly to Yoto's signed upload URL.
- Yoto owns the published media and cards. Clearing browser data removes only the local catalog and login cookie.

Read [CONTEXT.md](CONTEXT.md) before changing domain behavior or terminology.

## Commands

```bash
npm run dev
npm run build
npm run lint
npm test
npx tsc --noEmit
npx vitest run lib/<module>.test.ts
```

After adding an `app/api/**/route.ts` file, regenerate Next's route types before typechecking if `.next` contains stale route declarations:

```bash
npx next typegen
```

## Architecture

- [app/page.tsx](app/page.tsx) is the Browser Catalog UI and coordinates the serialized upload workflow.
- [lib/browser-catalog.ts](lib/browser-catalog.ts) owns the versioned localStorage data model and migrations.
- [lib/yoto-session.ts](lib/yoto-session.ts) owns per-user PKCE login, sealed cookie sessions, and token refresh.
- [lib/track-ingest.ts](lib/track-ingest.ts) probes one source and streams one track directly to Yoto.
- [lib/yoto-publisher.ts](lib/yoto-publisher.ts) materializes icons and creates or updates an ordered Yoto Card.
- `app/api/youtube/metadata` and `app/api/yoto/**` are narrow, stateless route seams around those modules.

Keep browser-owned state in the Browser Catalog. Do not introduce server persistence, temporary media files, or a shared Yoto Client ID. Each user must connect with their own Yoto developer application.

## Local configuration

Create `.env.local` with:

```dotenv
WEB_SESSION_SECRET=a_random_secret_at_least_32_characters_long
APP_ORIGIN=http://127.0.0.1:3000
```

Every user registers `http://127.0.0.1:3000/api/yoto/callback` in their own Yoto developer application and enters that application's Client ID during onboarding. Production uses the same flow with `<APP_ORIGIN>/api/yoto/callback`.

## Verification

For user-facing work, run `npx next typegen`, `npx tsc --noEmit`, `npx eslint .`, `npm test`, and `npm run build`, then check the live browser workflow. A real upload requires the user's Yoto session and is not safe to simulate silently.

## Known limitations

- Age-restricted or sign-in-gated YouTube sources can fail because browser cookies are not passed to `yt-dlp`.
- The catalog belongs to one browser profile and is not synchronized between devices.
- Vercel function duration and bandwidth limits still apply even though media is never staged on disk.
