import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import { getValidAccessToken } from "./yoto-auth";

// API reference: https://yoto.dev/api/
const API_BASE = "https://api.yotoplay.com";

interface UploadUrlResponse {
  upload: { uploadId: string; uploadUrl: string };
}

interface TranscodedResponse {
  transcode: { transcodedSha256?: string };
}

async function uploadAudioFile(
  accessToken: string,
  filePath: string,
): Promise<{ transcodedSha256: string }> {
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
        return { transcodedSha256: sha256 };
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

/** Fetches an image and POSTs it to a Yoto media-upload endpoint, never throwing — image
 *  assignment is best-effort and shouldn't fail the whole card push. */
async function uploadImage(
  accessToken: string,
  imageUrl: string,
  uploadUrl: string,
  defaultContentType: string,
): Promise<unknown | undefined> {
  try {
    const imgRes = await fetch(imageUrl, {
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

export async function pushCardToYoto(
  title: string,
  tracks: YotoTrackInput[],
  coverImageUrl?: string,
): Promise<PushCardResult> {
  console.log(`[yoto] pushing card "${title}" with ${tracks.length} track(s)`);
  const accessToken = await getValidAccessToken();

  const chapters = [];
  for (const track of tracks) {
    const { transcodedSha256 } = await uploadAudioFile(accessToken, track.filePath);
    const trackKey = String(track.trackNumber).padStart(2, "0");

    const iconMediaId = track.iconMediaId
      ? track.iconMediaId
      : track.iconUrl
        ? await uploadCustomIcon(accessToken, track.iconUrl)
        : undefined;
    const display = iconMediaId ? { icon16x16: `yoto:#${iconMediaId}` } : {};

    chapters.push({
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
          format: "aac",
          duration: track.duration,
          fileSize: (await fs.stat(track.filePath)).size,
          display,
        },
      ],
    });
  }

  const coverMediaUrl = coverImageUrl ? await uploadCoverImage(accessToken, coverImageUrl) : undefined;

  console.log(`[yoto] creating card "${title}" with ${chapters.length} chapter(s)`);
  const res = await fetch(`${API_BASE}/content`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title,
      content: { chapters },
      ...(coverMediaUrl ? { metadata: { cover: { imageL: coverMediaUrl } } } : {}),
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error(`[yoto] failed to create card (${res.status}): ${text}`);
    throw new Error(`Failed to create Yoto card: ${text}`);
  }
  const body = await res.json();
  const yotoCardId = body.card?.cardId ?? body.cardId;
  console.log(`[yoto] card "${title}" created: yotoCardId=${yotoCardId}`);
  return { yotoCardId };
}
