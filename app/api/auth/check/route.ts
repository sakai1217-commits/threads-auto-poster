import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth";
import { getUserById } from "@/lib/db";

export async function GET() {
  const userId = await getAuthUserId();
  if (!userId) {
    return NextResponse.json({ authenticated: false, apiConfigured: false });
  }

  const user = await getUserById(userId);
  if (!user) {
    return NextResponse.json({ authenticated: false, apiConfigured: false });
  }

  return NextResponse.json({
    authenticated: true,
    apiConfigured: !!user.anthropic_api_key && !!user.threads_access_token,
    hasAnthropicKey: !!user.anthropic_api_key,
    hasThreadsToken: !!user.threads_access_token,
    email: user.email,
  });
}
