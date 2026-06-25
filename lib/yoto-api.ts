import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import { getValidAccessToken } from "./yoto-auth";

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
  const urlRes = await fetch(`${API_BASE}/media/transcode/audio/uploadUrl`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!urlRes.ok) throw new Error(`Failed to get upload URL: ${await urlRes.text()}`);
  const { upload } = (await urlRes.json()) as UploadUrlResponse;

  const fileBuffer = await fs.readFile(filePath);
  const putRes = await fetch(upload.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": "audio/mp4" },
    body: fileBuffer,
  });
  if (!putRes.ok) throw new Error(`Failed to upload audio file: ${await putRes.text()}`);

  let lastBody: unknown;
  for (let attempt = 0; attempt < 24; attempt++) {
    const pollRes = await fetch(
      `${API_BASE}/media/upload/${upload.uploadId}/transcoded?loudnorm=false`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (pollRes.ok) {
      const body = (await pollRes.json()) as TranscodedResponse;
      lastBody = body;
      const sha256 = body.transcode?.transcodedSha256;
      if (sha256) return { transcodedSha256: sha256 };
    } else {
      lastBody = await pollRes.text();
    }
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  throw new Error(
    `Timed out waiting for Yoto to transcode audio. Last response: ${JSON.stringify(lastBody)}`,
  );
}

async function uploadCustomIcon(accessToken: string, imageUrl: string): Promise<string | undefined> {
  try {
    const imgRes = await fetch(imageUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; yotube/1.0)" },
    });
    if (!imgRes.ok) return undefined;
    const buffer = Buffer.from(await imgRes.arrayBuffer());

    const res = await fetch(`${API_BASE}/media/displayIcons/user/me/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "image/png" },
      body: new Uint8Array(buffer),
    });
    if (!res.ok) return undefined;
    const body = await res.json();
    return body.displayIcon?.mediaId;
  } catch {
    return undefined;
  }
}

async function uploadCoverImage(accessToken: string, imageUrl: string): Promise<string | undefined> {
  try {
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) return undefined;
    const buffer = Buffer.from(await imgRes.arrayBuffer());
    const contentType = imgRes.headers.get("content-type") ?? "image/jpeg";

    const res = await fetch(`${API_BASE}/media/coverImage/user/me/upload?autoconvert=true`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": contentType },
      body: buffer,
    });
    if (!res.ok) return undefined;
    const body = await res.json();
    return body.coverImage?.mediaUrl;
  } catch {
    return undefined;
  }
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
  if (!res.ok) throw new Error(`Failed to create Yoto card: ${await res.text()}`);
  const body = await res.json();
  return { yotoCardId: body.card?.cardId ?? body.cardId };
}
