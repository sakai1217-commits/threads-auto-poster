import { NextRequest, NextResponse } from "next/server";
import { getUserById } from "@/lib/db";

const THREADS_API_BASE = "https://graph.threads.net/v1.0";

export async function GET(request: NextRequest) {
  try {
    const userId = Number(request.headers.get("x-user-id"));
    const user = await getUserById(userId);

    if (!user?.threads_access_token) {
      return NextResponse.json({ error: "No token" }, { status: 400 });
    }

    const token = user.threads_access_token;

    // 1. Fetch main threads with all fields
    const mainFields = "id,text,timestamp,like_count,reply_count,media_type,permalink,is_reply";
    const mainRes = await fetch(
      `${THREADS_API_BASE}/me/threads?fields=${mainFields}&limit=5&access_token=${token}`
    );
    const mainRaw = mainRes.ok ? await mainRes.json() : { error: await mainRes.text(), status: mainRes.status };

    // 2. Fetch replies with replied_to
    const replyFields = "id,text,timestamp,like_count,reply_count,replied_to,media_type,permalink";
    const repRes = await fetch(
      `${THREADS_API_BASE}/me/replies?fields=${replyFields}&limit=10&access_token=${token}`
    );
    const repRaw = repRes.ok ? await repRes.json() : { error: await repRes.text(), status: repRes.status };

    // 3. Try insights for first post if available
    let insightsRaw = null;
    const firstPostId = mainRaw.data?.[0]?.id;
    if (firstPostId) {
      const insRes = await fetch(
        `${THREADS_API_BASE}/${firstPostId}/insights?metric=views&access_token=${token}`
      );
      insightsRaw = insRes.ok ? await insRes.json() : { error: await insRes.text(), status: insRes.status };
    }

    return NextResponse.json({
      mainPosts: mainRaw,
      replies: repRaw,
      insights: insightsRaw,
      mainFieldsUsed: mainFields,
      replyFieldsUsed: replyFields,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Debug failed" },
      { status: 500 }
    );
  }
}
