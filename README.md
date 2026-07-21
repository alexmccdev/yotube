# Yotube

Yotube turns YouTube links into personal audio cards in a user's Yoto library. It is a stateless, browser-first Next.js app: tracks stream directly from YouTube to Yoto, while card drafts stay on the user's device. There is no Yotube account, database, or server-side media library.

## Product flow

1. Connect Yoto with a Client ID from the user's own Yoto developer app.
2. Create a card, paste YouTube links, and choose a cover or track icons.
3. Send the card to Yoto. Tracks upload one at a time and completed tracks are checkpointed for safe retries.

The interface is designed as a compact audio workbench: cards form the local shelf, the selected card becomes an editable running order, and live progress explains each transfer without exposing implementation details.

Sending an already-published card updates its stored Yoto card ID in place. The update action remains disabled while the browser's title, cover, ordered tracks, and icons match the last successful publish. “Create a separate copy” deliberately omits the existing ID, leaving the original card unchanged and making the new copy the one this browser edits next. If an in-place update discovers that the original card was deleted in Yoto, Yotube automatically creates and remembers a replacement.

## Data model

- The card catalog, track metadata, chosen icons, upload checkpoints, Yoto card IDs, and the user's own Yoto Client ID live in the user's browser under versioned `localStorage` keys.
- Yoto access and refresh tokens plus the user's Client ID live in an encrypted, `HttpOnly`, `SameSite=Lax` cookie. Vercel receives the cookie for a request but has no session store.
- `yt-dlp` writes the selected M4A to stdout. The route pipes that stream into Yoto's signed upload with its exact `Content-Length`; it never creates a temporary audio file or accumulates the whole file in memory.
- Upload is one track per request. The browser checkpoints each accepted track and runs uploads sequentially before publishing or updating the Yoto card.
- Community icons are fetched only from a reconstructed, validated `yotoicons.com` URL and immediately uploaded to Yoto. Official Yoto icons use their existing media IDs.

Clearing browser site data removes the local catalog and login cookie. It does not remove cards or media already stored in Yoto.

## Local development

Requirements: Node.js 24 and `yt-dlp` on `PATH`. Each user supplies their own Yoto developer application Client ID in the browser onboarding.

Local development always uses `YT_DLP_PATH` when set, otherwise it runs `yt-dlp` from `PATH`. The Linux executable under `vendor/` is deployment-only and is used only when Vercel sets its runtime environment.

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

Every user registers `<APP_ORIGIN>/api/yoto/callback` in their own Yoto developer application. For `https://yotube.tech`, the exact callback is `https://yotube.tech/api/yoto/callback`. `APP_ORIGIN` must not have a trailing path. `WEB_SESSION_SECRET` must be stable across deployments or existing encrypted login cookies become unreadable. Production rejects secrets shorter than 32 bytes. Generate it locally with `openssl rand -base64 32`; do not commit the value.

The `postinstall` script downloads the pinned official Linux `yt-dlp` release, verifies its SHA-256 checksum, and Next's output tracing includes it only in the two routes that execute it. Track transfer declares Hobby's 60-second maximum function duration and enforces a 50-second internal deadline. Yoto transcoding is then polled with short stateless requests, so its processing time does not hold one function open. A source transfer that cannot finish within 50 seconds will still need a retry or a deployment target with longer-running compute.

After the first deployment, verify `/api/youtube/metadata` with a public YouTube URL, then connect a Yoto account and send one short track before relying on longer media. Preview deployments use the production `APP_ORIGIN` when they share its environment variables, so their OAuth redirect intentionally returns to the canonical production deployment.

The deployment is public. There is intentionally no Yotube account or server-held user profile; authorization to mutate Yoto comes only from the encrypted Yoto cookie. Expensive routes include a per-IP, per-function-instance rate-limit backstop, but serverless instances do not share those counters. Before sharing the deployment publicly, configure the Hobby plan's single global [Vercel Firewall rate-limit rule](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting):

1. Open the Vercel project, then **Firewall → Configure → New Rule**.
2. Match request paths beginning with `/api/`.
3. Choose **Rate Limit**, a **Fixed Window** of 60 seconds, a limit of 60 requests, and the IP counting key.
4. Keep the default `429` action, save the rule, review the change, and publish it.

The in-app limits are intentionally tighter for metadata lookup, upload starts, icon search, and card publishing while allowing frequent Yoto transcode status polling. A `429` response includes `Retry-After`, so clients can back off cleanly.

## Architecture

- `lib/browser-catalog.ts` — versioned Browser Catalog Module and localStorage adapter.
- `lib/yoto-session.ts` — stateless PKCE login, encrypted Yoto Session, and explicit token refresh.
- `lib/track-ingest.ts` — metadata probe and one-track direct streaming ingest.
- `lib/yoto-publisher.ts` — icon materialization and ordered Yoto Card publishing.
- `app/page.tsx` — browser-owned catalog and serialized upload workflow.
- `app/api/youtube/metadata`, `app/api/yoto/tracks`, `app/api/yoto/cards`, `app/api/yoto/icons` — narrow stateless route seams.

The browser-first Next.js app is the only supported product surface. The retired desktop implementation remains available in git history.

## Verification

Before shipping a change, run:

```bash
npx tsc --noEmit
npx eslint .
npm test
npm run build
```

For interface changes, also exercise onboarding, link normalization, browser persistence, upload progress, and the empty-card state in a local production build. Do not trigger a real Yoto upload during a smoke test unless the connected account owner explicitly intends it.
