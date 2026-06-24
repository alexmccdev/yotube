import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";

const CLIENT_ID = process.env.YOTO_CLIENT_ID;
const REDIRECT_URI = "http://127.0.0.1:8787/callback";
const AUTHORIZE_URL = "https://login.yotoplay.com/authorize";
const TOKEN_URL = "https://login.yotoplay.com/oauth/token";
const AUDIENCE = "https://api.yotoplay.com";
const SCOPES = "user:content:manage user:content:view user:icons:manage offline_access";

const TOKEN_PATH = path.join(process.cwd(), "work", ".yoto-auth.json");

let activeCallbackServer: http.Server | undefined;
let lastConnectError: string | undefined;

interface StoredTokens {
  accessToken: string;
  refreshToken: string;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
}

function base64url(input: Buffer): string {
  return input.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeJwtExpiry(jwt: string): number | undefined {
  const parts = jwt.split(".");
  if (parts.length < 2) return undefined;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64").toString("utf8"));
    return typeof payload.exp === "number" ? payload.exp : undefined;
  } catch {
    return undefined;
  }
}

async function readTokens(): Promise<StoredTokens | undefined> {
  try {
    const raw = await fs.readFile(TOKEN_PATH, "utf8");
    return JSON.parse(raw) as StoredTokens;
  } catch {
    return undefined;
  }
}

async function writeTokens(tokens: StoredTokens): Promise<void> {
  await fs.mkdir(path.dirname(TOKEN_PATH), { recursive: true });
  await fs.writeFile(TOKEN_PATH, JSON.stringify(tokens, null, 2));
}

export async function isConnected(): Promise<boolean> {
  return (await readTokens()) !== undefined;
}

export function getLastConnectError(): string | undefined {
  return lastConnectError;
}

export async function disconnect(): Promise<void> {
  await fs.rm(TOKEN_PATH, { force: true });
}

async function exchangeCodeForTokens(code: string, codeVerifier: string): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: CLIENT_ID!,
      code_verifier: codeVerifier,
      code,
      redirect_uri: REDIRECT_URI,
    }),
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${await res.text()}`);
  return res.json();
}

async function refreshTokens(refreshToken: string): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: CLIENT_ID!,
      refresh_token: refreshToken,
    }),
  });
  if (!res.ok) throw new Error(`Token refresh failed: ${await res.text()}`);
  return res.json();
}

/**
 * Starts the PKCE + loopback-server login flow and returns the URL for the
 * caller's own browser to open. Waiting for the redirect on 127.0.0.1:8787
 * and exchanging the code for tokens happens in the background — poll
 * `isConnected()` / `getLastConnectError()` to learn the outcome.
 */
export function startConnectYotoAccount(): { authorizeUrl: string } {
  if (!CLIENT_ID) throw new Error("YOTO_CLIENT_ID is not set");

  if (activeCallbackServer) {
    activeCallbackServer.close();
    activeCallbackServer = undefined;
  }
  lastConnectError = undefined;

  const codeVerifier = base64url(randomBytes(32));
  const codeChallenge = base64url(createHash("sha256").update(codeVerifier).digest());

  const authorizeUrl = new URL(AUTHORIZE_URL);
  authorizeUrl.searchParams.set("audience", AUDIENCE);
  authorizeUrl.searchParams.set("scope", SCOPES);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("client_id", CLIENT_ID);
  authorizeUrl.searchParams.set("code_challenge", codeChallenge);
  authorizeUrl.searchParams.set("code_challenge_method", "S256");
  authorizeUrl.searchParams.set("redirect_uri", REDIRECT_URI);

  const codePromise = new Promise<string>((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? "/", REDIRECT_URI);
      if (url.pathname !== "/callback") {
        res.writeHead(404).end();
        return;
      }
      const code = url.searchParams.get("code");
      const error = url.searchParams.get("error");
      res.writeHead(200, { "Content-Type": "text/html" }).end(
        "<html><body>Yoto connected — you can close this tab.</body></html>",
      );
      server.close();
      activeCallbackServer = undefined;
      if (code) resolve(code);
      else reject(new Error(error ?? "No code received from Yoto"));
    });
    activeCallbackServer = server;
    server.listen(8787, "127.0.0.1");
    server.on("error", reject);
    setTimeout(() => {
      server.close();
      activeCallbackServer = undefined;
      reject(new Error("Timed out waiting for Yoto login"));
    }, 120_000);
  });

  void codePromise
    .then((code) => exchangeCodeForTokens(code, codeVerifier))
    .then((tokens) => writeTokens({ accessToken: tokens.access_token, refreshToken: tokens.refresh_token }))
    .catch((err) => {
      lastConnectError = err instanceof Error ? err.message : String(err);
    });

  return { authorizeUrl: authorizeUrl.toString() };
}

export async function getValidAccessToken(): Promise<string> {
  const stored = await readTokens();
  if (!stored) throw new Error("Not connected to Yoto. Connect your account first.");

  const expiry = decodeJwtExpiry(stored.accessToken);
  const expiringSoon = expiry !== undefined && Date.now() / 1000 > expiry - 30;
  if (!expiringSoon) return stored.accessToken;

  const refreshed = await refreshTokens(stored.refreshToken);
  await writeTokens({ accessToken: refreshed.access_token, refreshToken: refreshed.refresh_token });
  return refreshed.access_token;
}
