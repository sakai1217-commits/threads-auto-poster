import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";

export async function GET() {
  const authed = await isAuthenticated();

  // Also check if server-side API keys are configured
  const apiConfigured =
    !!process.env.ANTHROPIC_API_KEY &&
    !!process.env.THREADS_ACCESS_TOKEN &&
    !!process.env.THREADS_USER_ID;

  return NextResponse.json({
    authenticated: authed,
    apiConfigured,
  });
}
