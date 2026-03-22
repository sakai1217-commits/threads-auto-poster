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

    // Field sets for main posts
    const mainFieldSets = [
      "id,text,timestamp,like_count,reply_count,media_type,permalink,is_reply",
      "id,text,timestamp,like_count,reply_count,permalink",
      "id,text,timestamp,like_count,reply_count",
      "id,text,timestamp",
    ];

    // Field sets for replies - include replied_to to link continuations to parents
    const replyFieldSets = [
      "id,text,timestamp,like_count,reply_count,media_type,permalink,replied_to",
      "id,text,timestamp,like_count,reply_count,permalink,replied_to",
      "id,text,timestamp,like_count,reply_count,replied_to",
      "id,text,timestamp,replied_to",
    ];

    async function fetchEndpoint(endpoint: string, fetchLimit: number, fieldSets: string[]) {
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
    const mainData = await fetchEndpoint("me/threads", limit, mainFieldSets);
    if (mainData.error && !mainData.data?.length) {
      const hint = mainData.error.includes("missing permissions")
        ? "\n\nアクセストークンに threads_basic スコープが必要です。"
        : "";
      return NextResponse.json(
        { error: `Threads APIからの取得に失敗しました: ${mainData.status}${hint}` },
        { status: 502 }
      );
    }

    // Fetch thread continuations and merge with parent posts
    const mainPosts: Record<string, unknown>[] = mainData.data || [];

    if (includeReplies) {
      const repData = await fetchEndpoint("me/replies", limit, replyFieldSets);
      const replies: Record<string, unknown>[] = repData.data || [];

      // Build a map of parent post ID -> continuations
      const continuationMap = new Map<string, Record<string, unknown>[]>();
      const mainPostIds = new Set(mainPosts.map((p) => String(p.id)));

      for (const reply of replies) {
        const repliedTo = reply.replied_to as { id?: string } | undefined;
        const parentId = repliedTo?.id ? String(repliedTo.id) : null;

        if (parentId && mainPostIds.has(parentId)) {
          if (!continuationMap.has(parentId)) continuationMap.set(parentId, []);
          continuationMap.get(parentId)!.push(reply);
        }
      }

      // Sort continuations by timestamp (oldest first) so text reads in order
      for (const [, contList] of continuationMap) {
        contList.sort((a, b) =>
          ((a.timestamp as string) || "").localeCompare((b.timestamp as string) || "")
        );
      }

      // Merge continuations into parent posts
      const mergedPosts = mainPosts.map((post) => {
        const postId = String(post.id);
        const conts = continuationMap.get(postId);

        if (!conts || conts.length === 0) {
          return mapPost(post, 0);
        }

        // Combine text: parent text + continuation texts
        const allTexts = [
          (post.text as string) || "",
          ...conts.map((c) => (c.text as string) || ""),
        ].filter(Boolean);

        // Sum likes across all parts
        const totalLikes =
          (Number(post.like_count) || 0) +
          conts.reduce((sum, c) => sum + (Number(c.like_count) || 0), 0);

        // Sum replies (parent only, since continuation replies are part of the thread)
        const totalReplies = Number(post.reply_count) || 0;

        return {
          id: postId,
          text: allTexts.join("\n\n---\n\n"),
          date: post.timestamp ? (post.timestamp as string).slice(0, 10) : "",
          timestamp: (post.timestamp as string) || "",
          likes: totalLikes,
          replies: totalReplies,
          mediaType: (post.media_type as string) || "TEXT",
          permalink: (post.permalink as string) || "",
          continuationCount: conts.length,
        };
      });

      return NextResponse.json({
        success: true,
        posts: mergedPosts,
        paging: mainData.paging || null,
      });
    }

    // No replies requested — return simple posts
    const posts = mainPosts.map((item) => mapPost(item, 0));

    return NextResponse.json({
      success: true,
      posts,
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

function mapPost(item: Record<string, unknown>, continuationCount: number) {
  return {
    id: item.id || "",
    text: (item.text as string) || "",
    date: item.timestamp ? (item.timestamp as string).slice(0, 10) : "",
    timestamp: (item.timestamp as string) || "",
    likes: Number(item.like_count) || 0,
    replies: Number(item.reply_count) || 0,
    mediaType: (item.media_type as string) || "TEXT",
    permalink: (item.permalink as string) || "",
    continuationCount,
  };
}
