import { cookies } from "next/headers";

const AUTH_SECRET = process.env.AUTH_SECRET || "dev-fallback-secret-change-me";

export function computeSessionToken(): string {
  // Deterministic session value: no server-side storage needed
  const crypto = require("crypto");
  return crypto
    .createHmac("sha256", AUTH_SECRET)
    .update("authenticated")
    .digest("hex");
}

export function verifySessionToken(token: string): boolean {
  const expected = computeSessionToken();
  if (token.length !== expected.length) return false;
  const crypto = require("crypto");
  return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}

export async function isAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session) return false;
  return verifySessionToken(session.value);
}
