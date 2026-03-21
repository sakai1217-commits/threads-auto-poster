import { NextRequest, NextResponse } from "next/server";
import { getUserById, updateUserKeys } from "@/lib/db";

function maskKey(key: string | null): string {
  if (!key) return "";
  if (key.length <= 8) return "****";
  return key.slice(0, 4) + "****" + key.slice(-4);
}

export async function GET(request: NextRequest) {
  try {
    const userId = Number(request.headers.get("x-user-id"));
    const user = await getUserById(userId);
    if (!user) {
      return NextResponse.json({ error: "ユーザーが見つかりません" }, { status: 404 });
    }

    return NextResponse.json({
      anthropicApiKey: maskKey(user.anthropic_api_key),
      threadsAccessToken: maskKey(user.threads_access_token),
      threadsUserId: user.threads_user_id || "",
      postTopic: user.post_topic || "",
      hasAnthropicKey: !!user.anthropic_api_key,
      hasThreadsToken: !!user.threads_access_token,
      hasThreadsUserId: !!user.threads_user_id,
    });
  } catch (error) {
    console.error("Get settings failed:", error);
    return NextResponse.json({ error: "設定の取得に失敗しました" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const userId = Number(request.headers.get("x-user-id"));
    const body = await request.json();
    const { anthropicApiKey, threadsAccessToken, threadsUserId, postTopic } = body;

    const updates: Record<string, string> = {};
    if (anthropicApiKey) updates.anthropic_api_key = anthropicApiKey;
    if (threadsAccessToken) updates.threads_access_token = threadsAccessToken;
    if (threadsUserId) updates.threads_user_id = threadsUserId;
    if (postTopic) updates.post_topic = postTopic;

    await updateUserKeys(userId, updates);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Update settings failed:", error);
    return NextResponse.json({ error: "設定の保存に失敗しました" }, { status: 500 });
  }
}
