import { NextRequest, NextResponse } from "next/server";
import { getUserById } from "@/lib/db";

const THREADS_API_BASE = "https://graph.threads.net/v1.0";

export async function GET(request: NextRequest) {
  try {
    const userId = Number(request.headers.get("x-user-id"));
    const user = await getUserById(userId);

    if (!user?.threads_access_token) {
      return NextResponse.json(
        { error: "設定画面からThreadsアクセストークンを登録してください" },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(Number(searchParams.get("limit")) || 25, 100);
    const since = searchParams.get("since") || "";

    const baseParams = `limit=${limit}&access_token=${user.threads_access_token}`;
    const sinceParam = since ? `&since=${Math.floor(new Date(since).getTime() / 1000)}` : "";

    // Use /me/threads instead of /{user-id}/threads to avoid permission issues
    const fieldSets = [
      "id,text,timestamp,like_count,reply_count",
      "id,text,timestamp",
    ];

    let res: Response | null = null;
    let lastErr = "";
    for (const fields of fieldSets) {
      res = await fetch(
        `${THREADS_API_BASE}/me/threads?fields=${fields}&${baseParams}${sinceParam}`
      );
      if (res.ok) break;
      lastErr = await res.text();
      console.error("Threads API error:", res.status, lastErr);
    }

    if (!res || !res.ok) {
      // Check for common permission issues
      const hint = lastErr.includes("missing permissions") || lastErr.includes("does not support")
        ? "\n\nアクセストークンに threads_basic スコープが必要です。Meta開発者ポータルでトークンを再生成してください。"
        : "";
      return NextResponse.json(
        { error: `Threads APIからの取得に失敗しました: ${res?.status || "unknown"}${hint}` },
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
