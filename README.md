# Yotube

Yotube is a stateless Next.js web app that streams selected YouTube audio directly into a user's Yoto account. It does not stage audio, keep a server-side catalog, run a database, or persist OAuth tokens on the server.

## Data model

- The card catalog, track metadata, chosen icons, upload checkpoints, Yoto card IDs, and the user's own Yoto Client ID live in the user's browser under versioned `localStorage` keys.
- Yoto access and refresh tokens plus the user's Client ID live in an encrypted, `HttpOnly`, `SameSite=Lax` cookie. Vercel receives the cookie for a request but has no session store.
- `yt-dlp` writes the selected M4A to stdout. The route pipes that stream into Yoto's signed upload with its exact `Content-Length`; it never creates a temporary audio file or accumulates the whole file in memory.
- Upload is one track per request. The browser checkpoints each accepted track and runs uploads sequentially before publishing or updating the Yoto card.
- Community icons are fetched only from a reconstructed, validated `yotoicons.com` URL and immediately uploaded to Yoto. Official Yoto icons use their existing media IDs.

Clearing browser site data removes the local catalog and login cookie. It does not remove cards or media already stored in Yoto.

## Local development

Requirements: Node.js 22+ and `yt-dlp` on `PATH`. Each user supplies their own Yoto developer application Client ID in the browser onboarding.

```bash
npm install
npm run dev
```

Create `.env.local`:

```dotenv
WEB_SESSION_SECRET=a_random_secret_at_least_32_characters_long
APP_ORIGIN=http://127.0.0.1:3000
```

Each user registers `http://127.0.0.1:3000/api/yoto/callback` as an allowed callback in their own Yoto developer application, then pastes that application's Client ID into the onboarding panel. Local development and production use the same browser-based login flow.

## Vercel Hobby deployment

Import the repository into Vercel with the Next.js framework preset and leave the build and output settings at their detected defaults. The project pins the Vercel runtime to Node.js 24 LTS.

Vercel's Hobby plan is for personal, non-commercial use. Use a paid plan or another host if this deployment supports commercial activity.

Set these environment variables for Production (and for Preview only if the preview has its own stable domain and matching Yoto callback):

```dotenv
APP_ORIGIN=https://your-canonical-domain.example
WEB_SESSION_SECRET=a_random_secret_at_least_32_characters_long
```

Every user registers `<APP_ORIGIN>/api/yoto/callback` in their own Yoto developer application. For `https://yotube.tech`, the exact callback is `https://yotube.tech/api/yoto/callback`. `APP_ORIGIN` must not have a trailing path. `WEB_SESSION_SECRET` must be stable across deployments or existing encrypted login cookies become unreadable. Generate it locally with `openssl rand -base64 32`; do not commit the value.

The `postinstall` script downloads the pinned official Linux `yt-dlp` release, verifies its SHA-256 checksum, and Next's output tracing includes it only in the two routes that execute it. Track transfer declares Hobby's 60-second maximum function duration and enforces a 50-second internal deadline. Yoto transcoding is then polled with short stateless requests, so its processing time does not hold one function open. A source transfer that cannot finish within 50 seconds will still need a retry or a deployment target with longer-running compute.

After the first deployment, verify `/api/youtube/metadata` with a public YouTube URL, then connect a Yoto account and send one short track before relying on longer media. Preview deployments use the production `APP_ORIGIN` when they share its environment variables, so their OAuth redirect intentionally returns to the canonical production deployment.

The deployment is public. There is intentionally no Yotube account or server-held user profile; authorization to mutate Yoto comes only from the encrypted Yoto cookie. For a higher-abuse deployment, add platform-level rate limiting or access control without introducing an application database.

## Architecture

- `lib/browser-catalog.ts` — versioned Browser Catalog Module and localStorage adapter.
- `lib/yoto-session.ts` — stateless PKCE login, encrypted Yoto Session, and explicit token refresh.
- `lib/track-ingest.ts` — metadata probe and one-track direct streaming ingest.
- `lib/yoto-publisher.ts` — icon materialization and ordered Yoto Card publishing.
- `app/page.tsx` — browser-owned catalog and serialized upload workflow.
- `app/api/youtube/metadata`, `app/api/yoto/tracks`, `app/api/yoto/cards`, `app/api/yoto/icons` — narrow stateless route seams.

The browser-first Next.js app is the only supported product surface. The retired desktop implementation remains available in git history.
