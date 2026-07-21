import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const VERSION = "v1";

declare global {
  var __yotubeDevSessionSecret: string | undefined;
}

function sessionSecret(): string {
  const configured = process.env.WEB_SESSION_SECRET;
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("WEB_SESSION_SECRET is required in production");
  }
  globalThis.__yotubeDevSessionSecret ??= randomBytes(32).toString("base64url");
  return globalThis.__yotubeDevSessionSecret;
}

function key(): Buffer {
  return createHash("sha256").update(sessionSecret()).digest();
}

function decodeBase64url(value: string, expectedLength?: number): Buffer | undefined {
  const decoded = Buffer.from(value, "base64url");
  if (decoded.toString("base64url") !== value) return undefined;
  if (expectedLength !== undefined && decoded.length !== expectedLength) return undefined;
  return decoded;
}

export function sealCookie(value: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const plaintext = Buffer.from(JSON.stringify(value));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), ciphertext.toString("base64url"), tag.toString("base64url")].join(".");
}

export function openCookie<T>(sealed: string | undefined): T | undefined {
  if (!sealed) return undefined;
  const [version, ivValue, ciphertextValue, tagValue, extra] = sealed.split(".");
  if (version !== VERSION || !ivValue || !ciphertextValue || !tagValue || extra) return undefined;
  try {
    const iv = decodeBase64url(ivValue, 12);
    const ciphertext = decodeBase64url(ciphertextValue);
    const tag = decodeBase64url(tagValue, 16);
    if (!iv || !ciphertext || !tag) return undefined;
    const decipher = createDecipheriv("aes-256-gcm", key(), iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
    return JSON.parse(plaintext.toString("utf8")) as T;
  } catch {
    return undefined;
  }
}
