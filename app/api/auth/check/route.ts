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

  const apiConfigured =
    !!user.anthropic_api_key &&
    !!user.threads_access_token &&
    !!user.threads_user_id;

  return NextResponse.json({
    authenticated: true,
    apiConfigured,
    email: user.email,
  });
}
