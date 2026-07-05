import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import { getValidAccessToken } from "./yoto-auth";

// API reference: https://yoto.dev/api/
const API_BASE = "https://api.yotoplay.com";

// Bounds simultaneous track uploads/transcodes so a large card doesn't fire dozens of
// concurrent requests at once — separate from jobs.ts's download queue, a different concern.
const UPLOAD_CONCURRENCY = 3;

async function mapWithLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    for (let i = next++; i < items.length; i = next++) {
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

interface UploadUrlResponse {
  upload: { uploadId: string; uploadUrl: string };
}

interface TranscodedInfo {
  duration?: number;
  fileSize?: number;
  channels?: string;
  format?: string;
}

interface TranscodedResponse {
  transcode: { transcodedSha256?: string; transcodedInfo?: TranscodedInfo };
}

async function uploadAudioFile(
  accessToken: string,
  filePath: string,
): Promise<{ transcodedSha256: string; transcodedInfo?: TranscodedInfo }> {
  console.log(`[yoto] requesting upload URL for ${filePath}`);
  const urlRes = await fetch(`${API_BASE}/media/transcode/audio/uploadUrl`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!urlRes.ok) {
    const text = await urlRes.text();
    console.error(`[yoto] failed to get upload URL (${urlRes.status}): ${text}`);
    throw new Error(`Failed to get upload URL: ${text}`);
  }
  const { upload } = (await urlRes.json()) as UploadUrlResponse;

  const fileBuffer = await fs.readFile(filePath);
  console.log(`[yoto] uploading ${filePath} (${fileBuffer.byteLength} bytes), uploadId=${upload.uploadId}`);
  const putRes = await fetch(upload.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": "audio/mp4" },
    body: fileBuffer,
  });
  if (!putRes.ok) {
    const text = await putRes.text();
    console.error(`[yoto] failed to upload audio file (${putRes.status}): ${text}`);
    throw new Error(`Failed to upload audio file: ${text}`);
  }

  // Transcode time scales with audio length — a 2-minute cap (the old 24 * 5s) was too
  // tight for longer tracks, which would still be mid-transcode when we gave up.
  console.log(`[yoto] waiting for transcode of uploadId=${upload.uploadId}`);
  let lastBody: unknown;
  for (let attempt = 0; attempt < 120; attempt++) {
    const pollRes = await fetch(
      `${API_BASE}/media/upload/${upload.uploadId}/transcoded?loudnorm=false`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (pollRes.ok) {
      const body = (await pollRes.json()) as TranscodedResponse;
      lastBody = body;
      const sha256 = body.transcode?.transcodedSha256;
      if (sha256) {
        console.log(`[yoto] transcode done for uploadId=${upload.uploadId} after ${attempt + 1} poll(s): sha256=${sha256}`);
        return { transcodedSha256: sha256, transcodedInfo: body.transcode?.transcodedInfo };
      }
    } else {
      lastBody = await pollRes.text();
    }
    if (attempt > 0 && attempt % 6 === 0) {
      console.log(`[yoto] still waiting on transcode of uploadId=${upload.uploadId} (${attempt * 5}s elapsed)`);
    }
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  console.error(`[yoto] timed out waiting for transcode of uploadId=${upload.uploadId}: ${JSON.stringify(lastBody)}`);
  throw new Error(
    `Timed out waiting for Yoto to transcode audio. Last response: ${JSON.stringify(lastBody)}`,
  );
}

// Yoto's media-upload endpoints reject webp outright. YouTube thumbnails are commonly
// served as webp (`i.ytimg.com/vi_webp/<id>/<name>.webp`), but ytimg serves the identical
// thumbnail as a native jpg at the same path with `vi` swapped in — that's YouTube's own
// encode, not a re-compression of the webp, so prefer it over transcoding ourselves.
function preferNativeJpegThumbnail(url: string): string {
  return url.replace("/vi_webp/", "/vi/").replace(/\.webp($|\?)/, ".jpg$1");
}

/** Fetches an image and POSTs it to a Yoto media-upload endpoint, never throwing — image
 *  assignment is best-effort and shouldn't fail the whole card push. */
async function uploadImage(
  accessToken: string,
  imageUrl: string,
  uploadUrl: string,
  defaultContentType: string,
): Promise<unknown | undefined> {
  try {
    const imgRes = await fetch(preferNativeJpegThumbnail(imageUrl), {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; yotube/1.0)" },
    });
    if (!imgRes.ok) {
      console.error(`[yoto] image fetch failed (${imgRes.status}) for ${imageUrl}`);
      return undefined;
    }
    const buffer = Buffer.from(await imgRes.arrayBuffer());
    const contentType = imgRes.headers.get("content-type") ?? defaultContentType;

    const res = await fetch(uploadUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": contentType },
      body: new Uint8Array(buffer),
    });
    if (!res.ok) {
      console.error(`[yoto] image upload failed (${res.status}) for ${imageUrl}: ${await res.text()}`);
      return undefined;
    }
    return res.json();
  } catch (err) {
    console.error(`[yoto] image upload threw for ${imageUrl}:`, err);
    return undefined;
  }
}

async function uploadCustomIcon(accessToken: string, imageUrl: string): Promise<string | undefined> {
  const body = (await uploadImage(
    accessToken,
    imageUrl,
    `${API_BASE}/media/displayIcons/user/me/upload`,
    "image/png",
  )) as { displayIcon?: { mediaId?: string } } | undefined;
  return body?.displayIcon?.mediaId;
}

async function uploadCoverImage(accessToken: string, imageUrl: string): Promise<string | undefined> {
  // coverType tells Yoto what dimensions to resize/crop to; per yoto.dev's MYO cover-image
  // guide it's required alongside autoconvert=true — without it the upload can succeed but
  // the image never gets attached/displayed correctly on the card.
  const body = (await uploadImage(
    accessToken,
    imageUrl,
    `${API_BASE}/media/coverImage/user/me/upload?autoconvert=true&coverType=default`,
    "image/jpeg",
  )) as { coverImage?: { mediaUrl?: string } } | undefined;
  return body?.coverImage?.mediaUrl;
}

export interface YotoTrackInput {
  title: string;
  filePath: string;
  duration: number;
  trackNumber: number;
  iconUrl?: string;
  iconMediaId?: string;
}

export interface PushCardResult {
  yotoCardId: string;
}

interface YotoChapter {
  key: string;
  title: string;
  display: { icon16x16?: string };
  defaultTrackDisplay: string;
  defaultTrackAmbient: string;
  tracks: unknown[];
}

/** `POST /content` is create-or-update: passing an existing `cardId` updates that card
 *  in place rather than creating a new one (confirmed against the live API — undocumented
 *  in yoto.dev's reference, but this is how we get the card to appear immediately and then
 *  fill in track-by-track instead of only showing up once everything's uploaded). */
async function createOrUpdateCard(
  accessToken: string,
  title: string,
  chapters: YotoChapter[],
  cardId?: string,
  coverMediaUrl?: string,
): Promise<string> {
  const res = await fetch(`${API_BASE}/content`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ...(cardId ? { cardId } : {}),
      title,
      content: { chapters },
      ...(coverMediaUrl ? { metadata: { cover: { imageL: coverMediaUrl } } } : {}),
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error(`[yoto] failed to create/update card (${res.status}): ${text}`);
    throw new Error(`Failed to create Yoto card: ${text}`);
  }
  const body = await res.json();
  return body.card?.cardId ?? body.cardId;
}

export async function pushCardToYoto(
  title: string,
  tracks: YotoTrackInput[],
  coverImageUrl?: string,
  onProgress?: (completed: number, total: number) => void,
  onCardCreated?: (yotoCardId: string) => void,
  existingYotoCardId?: string,
): Promise<PushCardResult> {
  console.log(`[yoto] pushing card "${title}" with ${tracks.length} track(s)`);
  const accessToken = await getValidAccessToken();

  const yotoCardId =
    existingYotoCardId ?? (await createOrUpdateCard(accessToken, title, []));
  console.log(`[yoto] card "${title}" ready: yotoCardId=${yotoCardId}`);
  onCardCreated?.(yotoCardId);

  const slots: YotoChapter[] = [];
  let completed = 0;

  await mapWithLimit(tracks, UPLOAD_CONCURRENCY, async (track) => {
    const { transcodedSha256, transcodedInfo } = await uploadAudioFile(accessToken, track.filePath);
    const trackKey = String(track.trackNumber).padStart(2, "0");

    const iconMediaId = track.iconMediaId
      ? track.iconMediaId
      : track.iconUrl
        ? await uploadCustomIcon(accessToken, track.iconUrl)
        : undefined;
    const display = iconMediaId ? { icon16x16: `yoto:#${iconMediaId}` } : {};

    const chapter: YotoChapter = {
      key: trackKey,
      title: track.title,
      display,
      defaultTrackDisplay: trackKey,
      defaultTrackAmbient: trackKey,
      tracks: [
        {
          key: trackKey,
          uid: randomUUID(),
          title: track.title,
          trackUrl: `yoto:#${transcodedSha256}`,
          type: "audio",
          // Sourced from Yoto's own transcode response, not our pre-upload file — trackUrl
          // points at Yoto's transcoded copy, and the physical player trusts these declared
          // fields (not the actual stream) for track length, so a mismatch here made tracks
          // play fine in the app (which reads the real stream) but appear 0s long on-device.
          format: transcodedInfo?.format ?? "aac",
          channels: transcodedInfo?.channels,
          duration: transcodedInfo?.duration ?? track.duration,
          fileSize: transcodedInfo?.fileSize ?? (await fs.stat(track.filePath)).size,
          display,
        },
      ],
    };

    slots[track.trackNumber - 1] = chapter;
    completed++;
    onProgress?.(completed, tracks.length);

    // Best-effort — a failed incremental update shouldn't fail the whole push, since the
    // final update below (outside this loop) is authoritative and always runs.
    await createOrUpdateCard(accessToken, title, slots.filter(Boolean), yotoCardId).catch((err) => {
      console.error(`[yoto] incremental card update failed:`, err);
    });
  });

  const coverMediaUrl = coverImageUrl ? await uploadCoverImage(accessToken, coverImageUrl) : undefined;

  console.log(`[yoto] finalizing card "${title}" with ${tracks.length} chapter(s)`);
  await createOrUpdateCard(accessToken, title, slots, yotoCardId, coverMediaUrl);

  return { yotoCardId };
}
