export {};

declare global {
  type DesktopCookieBrowser = "none" | "chrome" | "firefox" | "edge" | "brave" | "safari";

  interface Window {
    yotubeDesktop?: {
      platform: string;
      probeYoutube(input: { url: string; browser: DesktopCookieBrowser }): Promise<import("@/lib/track-ingest").TrackSource>;
      uploadYoutube(input: {
        operationId: string;
        source: import("@/lib/track-ingest").TrackSource;
        browser: DesktopCookieBrowser;
      }): Promise<{ uploadId: string }>;
      cancelUpload(operationId: string): Promise<boolean>;
      onUploadProgress(callback: (progress: {
        operationId: string;
        bytesTransferred: number;
        totalBytes: number;
        transferPercent: number;
      }) => void): () => void;
    };
  }
}
