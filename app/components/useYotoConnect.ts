"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { readStoredYotoClientId, storeYotoClientId } from "@/lib/yoto-client-id";

/** Kicks off the Yoto OAuth flow and polls /api/yoto/status until it connects, errors,
 *  or times out. Shared by the header status widget and the getting-started checklist. */
export function useYotoConnect(onConnected?: () => void) {
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const connect = useCallback(async (suppliedClientId?: string) => {
    setConnecting(true);
    setError(null);
    const clientId = suppliedClientId === undefined
      ? readStoredYotoClientId()
      : storeYotoClientId(suppliedClientId);
    if (!clientId) {
      setConnecting(false);
      setError("Enter your Yoto Client ID first");
      return;
    }
    const authorizeWindow = window.open("about:blank", "_blank");
    if (!authorizeWindow) {
      setConnecting(false);
      setError("Allow pop-ups for this site, then connect again");
      return;
    }
    authorizeWindow.opener = null;
    const res = await fetch("/api/yoto/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      authorizeWindow.close();
      setConnecting(false);
      setError(body.error ?? "Failed to connect");
      return;
    }

    authorizeWindow.location.replace(body.authorizeUrl);

    let attempts = 0;
    pollRef.current = setInterval(async () => {
      attempts += 1;
      const statusRes = await fetch("/api/yoto/status");
      const statusBody = await statusRes.json().catch(() => ({}));
      if (statusBody.connected) {
        if (pollRef.current) clearInterval(pollRef.current);
        setConnecting(false);
        onConnected?.();
        return;
      }
      if (statusBody.error) {
        if (pollRef.current) clearInterval(pollRef.current);
        setConnecting(false);
        setError(statusBody.error);
        return;
      }
      if (attempts > 80) {
        if (pollRef.current) clearInterval(pollRef.current);
        setConnecting(false);
        setError("Timed out waiting for Yoto login");
      }
    }, 1500);
  }, [onConnected]);

  return { connect, connecting, error };
}
