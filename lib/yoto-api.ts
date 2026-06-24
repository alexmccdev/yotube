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
  for (let attempt = 0; attempt < 60; attempt++) {
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
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error(
    `Timed out waiting for Yoto to transcode audio. Last response: ${JSON.stringify(lastBody)}`,
  );
}

export interface YotoTrackInput {
  title: string;
  filePath: string;
  duration: number;
  trackNumber: number;
}

export interface PushCardResult {
  yotoCardId: string;
}

export async function pushCardToYoto(
  title: string,
  tracks: YotoTrackInput[],
): Promise<PushCardResult> {
  const accessToken = await getValidAccessToken();

  const chapters = [];
  for (const track of tracks) {
    const { transcodedSha256 } = await uploadAudioFile(accessToken, track.filePath);
    const trackKey = String(track.trackNumber).padStart(2, "0");
    chapters.push({
      key: trackKey,
      title: track.title,
      display: {},
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
          display: {},
        },
      ],
    });
  }

  const res = await fetch(`${API_BASE}/content`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title,
      content: { chapters },
    }),
  });
  if (!res.ok) throw new Error(`Failed to create Yoto card: ${await res.text()}`);
  const body = await res.json();
  return { yotoCardId: body.card?.cardId ?? body.cardId };
}
