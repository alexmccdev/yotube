import { createHash, randomBytes } from "node:crypto";
import { openCookie, sealCookie } from "./sealed-cookie";
import { isValidYotoClientId, normalizeYotoClientId } from "./yoto-client-id";

const AUTHORIZE_URL = "https://login.yotoplay.com/authorize";
const TOKEN_URL = "https://login.yotoplay.com/oauth/token";
const AUDIENCE = "https://api.yotoplay.com";
const SCOPES = "user:content:manage user:content:view user:icons:manage offline_access";

export const YOTO_SESSION_COOKIE = "yotube_yoto_session";
export const YOTO_FLOW_COOKIE = "yotube_yoto_flow";

interface OAuthFlow {
  clientId: string;
  state: string;
  codeVerifier: string;
  redirectUri: string;
  createdAt: number;
}

export interface YotoSession {
  clientId: string;
  accessToken: string;
  refreshToken: string;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
}

export class YotoSessionError extends Error {
  constructor(message: string, readonly code: "not_connected" | "refresh_required" | "invalid_flow") {
    super(message);
  }
}

function base64url(input: Buffer): string {
  return input.toString("base64url");
}

function decodeJwtExpiry(jwt: string): number | undefined {
  const payload = jwt.split(".")[1];
  if (!payload) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return typeof parsed.exp === "number" ? parsed.exp : undefined;
  } catch {
    return undefined;
  }
}

function configuredOrigin(requestUrl: string, browserOrigin?: string | null): string {
  if (process.env.APP_ORIGIN) return new URL(process.env.APP_ORIGIN).origin;
  if (process.env.NODE_ENV === "production") throw new Error("APP_ORIGIN is required in production");
  if (browserOrigin) return new URL(browserOrigin).origin;
  return new URL(requestUrl).origin;
}

async function exchangeToken(parameters: URLSearchParams): Promise<TokenResponse> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: parameters,
  });
  if (!response.ok) throw new Error(`Yoto token exchange failed (${response.status})`);
  return response.json();
}

export async function beginYotoSession(
  requestUrl: string,
  suppliedClientId: string,
  browserOrigin?: string | null,
): Promise<{
  authorizeUrl: string;
  flowCookie: string;
}> {
  const clientId = normalizeYotoClientId(suppliedClientId);
  if (!isValidYotoClientId(clientId)) throw new Error("Enter a valid Yoto Client ID");
  const redirectUri = `${configuredOrigin(requestUrl, browserOrigin)}/api/yoto/callback`;
  const codeVerifier = base64url(randomBytes(32));
  const codeChallenge = base64url(createHash("sha256").update(codeVerifier).digest());
  const state = base64url(randomBytes(18));
  const authorizeUrl = new URL(AUTHORIZE_URL);
  authorizeUrl.searchParams.set("audience", AUDIENCE);
  authorizeUrl.searchParams.set("scope", SCOPES);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("code_challenge", codeChallenge);
  authorizeUrl.searchParams.set("code_challenge_method", "S256");

  return {
    authorizeUrl: authorizeUrl.toString(),
    flowCookie: sealCookie({ clientId, state, codeVerifier, redirectUri, createdAt: Date.now() } satisfies OAuthFlow),
  };
}

export async function completeYotoSession(
  callbackUrl: string,
  sealedFlow: string | undefined,
): Promise<string> {
  const flow = openCookie<OAuthFlow>(sealedFlow);
  const callback = new URL(callbackUrl);
  const code = callback.searchParams.get("code");
  const state = callback.searchParams.get("state");
  if (
    !flow ||
    !code ||
    !state ||
    state !== flow.state ||
    Date.now() - flow.createdAt > 10 * 60_000
  ) {
    throw new YotoSessionError("Yoto login could not be verified", "invalid_flow");
  }

  const tokens = await exchangeToken(
    new URLSearchParams({
      grant_type: "authorization_code",
      client_id: flow.clientId,
      code_verifier: flow.codeVerifier,
      code,
      redirect_uri: flow.redirectUri,
    }),
  );
  if (!tokens.refresh_token) throw new Error("Yoto did not return a refresh token");
  return sealCookie({
    clientId: flow.clientId,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
  } satisfies YotoSession);
}

export function hasYotoSession(sealedSession: string | undefined): boolean {
  return openCookie<YotoSession>(sealedSession) !== undefined;
}

export function readYotoAccessToken(sealedSession: string | undefined): string {
  const session = openCookie<YotoSession>(sealedSession);
  if (!session) throw new YotoSessionError("Connect your Yoto account first", "not_connected");
  const expiry = decodeJwtExpiry(session.accessToken);
  if (expiry !== undefined && Date.now() / 1000 > expiry - 90) {
    throw new YotoSessionError("Refresh the Yoto session before continuing", "refresh_required");
  }
  return session.accessToken;
}

export async function refreshYotoSession(sealedSession: string | undefined): Promise<string> {
  const session = openCookie<YotoSession>(sealedSession);
  if (!session) throw new YotoSessionError("Connect your Yoto account first", "not_connected");
  if (!isValidYotoClientId(session.clientId)) {
    throw new YotoSessionError("Reconnect your Yoto account with its Client ID", "not_connected");
  }
  const tokens = await exchangeToken(
    new URLSearchParams({
      grant_type: "refresh_token",
      client_id: session.clientId,
      refresh_token: session.refreshToken,
    }),
  );
  return sealCookie({
    clientId: session.clientId,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? session.refreshToken,
  } satisfies YotoSession);
}
