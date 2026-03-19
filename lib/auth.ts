import { cookies } from "next/headers";

const AUTH_SECRET = process.env.AUTH_SECRET || "dev-fallback-secret-change-me";
const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days in seconds

// --- Node.js crypto (for API routes) ---

export function createSessionToken(userId: number): string {
  const crypto = require("crypto");
  const exp = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE;
  const payload = Buffer.from(JSON.stringify({ uid: userId, exp })).toString("base64url");
  const sig = crypto.createHmac("sha256", AUTH_SECRET).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

export function verifySessionToken(token: string): { userId: number } | null {
  const crypto = require("crypto");
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;

  const expected = crypto.createHmac("sha256", AUTH_SECRET).update(payload).digest("hex");
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;

  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (data.exp < Math.floor(Date.now() / 1000)) return null;
    return { userId: data.uid };
  } catch {
    return null;
  }
}

export async function getAuthUserId(): Promise<number | null> {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session) return null;
  const result = verifySessionToken(session.value);
  return result?.userId ?? null;
}

// --- Edge-compatible (for middleware, uses Web Crypto API) ---

export async function verifySessionTokenEdge(token: string, secret: string): Promise<{ userId: number } | null> {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sigBytes = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  const expected = Array.from(new Uint8Array(sigBytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  if (sig !== expected) return null;

  try {
    const data = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    if (data.exp < Math.floor(Date.now() / 1000)) return null;
    return { userId: data.uid };
  } catch {
    return null;
  }
}
