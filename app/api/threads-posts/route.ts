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

    // Threads API: get user's threads with basic fields first
    // like_count/reply_count may not be available on listing; try with, fallback without
    const baseParams = `limit=${limit}&access_token=${user.threads_access_token}`;
    const sinceParam = since ? `&since=${Math.floor(new Date(since).getTime() / 1000)}` : "";

    let res = await fetch(
      `${THREADS_API_BASE}/${user.threads_user_id}/threads?fields=id,text,timestamp,like_count,reply_count&${baseParams}${sinceParam}`
    );

    // If 400, retry without engagement fields (permissions may not include them)
    if (res.status === 400) {
      res = await fetch(
        `${THREADS_API_BASE}/${user.threads_user_id}/threads?fields=id,text,timestamp&${baseParams}${sinceParam}`
      );
    }

    if (!res.ok) {
      const errText = await res.text();
      console.error("Threads API error:", res.status, errText);
      return NextResponse.json(
        { error: `Threads APIからの取得に失敗しました: ${res.status} - ${errText}` },
        { status: 502 }
      );
    }

    const data = await res.json();
    const posts = (data.data || []).map((item: Record<string, unknown>) => ({
      id: item.id || "",
      text: (item.text as string) || "",
      date: item.timestamp ? (item.timestamp as string).slice(0, 10) : "",
      timestamp: (item.timestamp as string) || "",
      likes: Number(item.like_count) || 0,
      replies: Number(item.reply_count) || 0,
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
