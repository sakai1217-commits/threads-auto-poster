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
    const includeReplies = searchParams.get("replies") === "1";

    const token = user.threads_access_token;

    // Try with rich fields, fall back to basic
    const fieldSets = [
      "id,text,timestamp,like_count,reply_count,media_type,permalink",
      "id,text,timestamp,like_count,reply_count",
      "id,text,timestamp",
    ];

    async function fetchEndpoint(endpoint: string, fetchLimit: number) {
      let res: Response | null = null;
      let lastErr = "";
      for (const fields of fieldSets) {
        res = await fetch(
          `${THREADS_API_BASE}/${endpoint}?fields=${fields}&limit=${fetchLimit}&access_token=${token}`
        );
        if (res.ok) break;
        lastErr = await res.text();
        console.error(`Threads API ${endpoint} error:`, res.status, lastErr);
      }
      if (!res || !res.ok) return { data: [], error: lastErr, status: res?.status };
      return { ...(await res.json()), error: null, status: res.status };
    }

    // Fetch main threads
    const mainData = await fetchEndpoint("me/threads", limit);
    if (mainData.error && !mainData.data?.length) {
      const hint = mainData.error.includes("missing permissions")
        ? "\n\nアクセストークンに threads_basic スコープが必要です。"
        : "";
      return NextResponse.json(
        { error: `Threads APIからの取得に失敗しました: ${mainData.status}${hint}` },
        { status: 502 }
      );
    }

    // Fetch replies (conversation threads) if requested
    let repliesData: Record<string, unknown>[] = [];
    if (includeReplies) {
      const repData = await fetchEndpoint("me/replies", limit);
      repliesData = repData.data || [];
    }

    function mapPost(item: Record<string, unknown>, isReply = false) {
      return {
        id: item.id || "",
        text: (item.text as string) || "",
        date: item.timestamp ? (item.timestamp as string).slice(0, 10) : "",
        timestamp: (item.timestamp as string) || "",
        likes: Number(item.like_count) || 0,
        replies: Number(item.reply_count) || 0,
        mediaType: (item.media_type as string) || "TEXT",
        permalink: (item.permalink as string) || "",
        isReply,
      };
    }

    const posts = (mainData.data || []).map((item: Record<string, unknown>) => mapPost(item, false));
    const replies = repliesData.map((item) => mapPost(item, true));

    return NextResponse.json({
      success: true,
      posts,
      replies,
      paging: mainData.paging || null,
    });
  } catch (error) {
    console.error("Threads posts fetch failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "投稿の取得に失敗しました" },
      { status: 500 }
    );
  }
}
