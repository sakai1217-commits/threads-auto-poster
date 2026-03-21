import { NextRequest, NextResponse } from "next/server";
import { getUserById } from "@/lib/db";

const THREADS_API_BASE = "https://graph.threads.net/v1.0";

export async function GET(request: NextRequest) {
  try {
    const userId = Number(request.headers.get("x-user-id"));
    const user = await getUserById(userId);

    if (!user?.threads_access_token || !user?.threads_user_id) {
      return NextResponse.json(
        { error: "設定画面からThreads APIを登録してください" },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(Number(searchParams.get("limit")) || 25, 100);
    const since = searchParams.get("since") || ""; // YYYY-MM-DD

    // Step 1: Get user's threads (media IDs)
    let url = `${THREADS_API_BASE}/${user.threads_user_id}/threads?fields=id,text,timestamp,like_count,reply_count&limit=${limit}&access_token=${user.threads_access_token}`;
    if (since) {
      url += `&since=${since}`;
    }

    const res = await fetch(url);
    if (!res.ok) {
      const errText = await res.text();
      console.error("Threads API error:", errText);
      return NextResponse.json(
        { error: `Threads APIからの取得に失敗しました: ${res.status}` },
        { status: 502 }
      );
    }

    const data = await res.json();
    const posts = (data.data || []).map((item: { id: string; text?: string; timestamp?: string; like_count?: number; reply_count?: number }) => ({
      id: item.id,
      text: item.text || "",
      date: item.timestamp ? item.timestamp.slice(0, 10) : "",
      timestamp: item.timestamp || "",
      likes: item.like_count || 0,
      replies: item.reply_count || 0,
    }));

    return NextResponse.json({
      success: true,
      posts,
      paging: data.paging || null,
    });
  } catch (error) {
    console.error("Threads posts fetch failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "投稿の取得に失敗しました" },
      { status: 500 }
    );
  }
}
