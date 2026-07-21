export const YOTO_CLIENT_ID_STORAGE_KEY = "yotube.yoto-client-id.v1";

export function normalizeYotoClientId(value: string): string {
  return value.trim();
}

export function isValidYotoClientId(value: string): boolean {
  const normalized = normalizeYotoClientId(value);
  return normalized.length >= 3 && normalized.length <= 256 && !/\s/.test(normalized);
}

export function readStoredYotoClientId(): string {
  if (typeof window === "undefined") return "";
  return normalizeYotoClientId(window.localStorage.getItem(YOTO_CLIENT_ID_STORAGE_KEY) ?? "");
}

export function storeYotoClientId(value: string): string {
  const normalized = normalizeYotoClientId(value);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(YOTO_CLIENT_ID_STORAGE_KEY, normalized);
  }
  return normalized;
}
