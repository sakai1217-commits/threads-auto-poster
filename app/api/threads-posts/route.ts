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

    // Fetch main threads
    const mainFieldSets = [
      "id,text,timestamp,like_count,reply_count,media_type,permalink",
      "id,text,timestamp,media_type,permalink",
      "id,text,timestamp",
    ];

    const mainData = await fetchWithFallback("me/threads", limit, mainFieldSets, token);
    if (mainData.error && !mainData.data?.length) {
      const hint = mainData.error.includes("missing permissions")
        ? "\n\nアクセストークンに threads_basic スコープが必要です。"
        : "";
      return NextResponse.json(
        { error: `Threads APIからの取得に失敗しました: ${mainData.status}${hint}` },
        { status: 502 }
      );
    }

    const mainPosts: ThreadsPost[] = mainData.data || [];

    // Get authenticated user's username for filtering self-replies
    let myUsername = "";
    try {
      const meRes = await fetch(`${THREADS_API_BASE}/me?fields=id,username&access_token=${token}`);
      if (meRes.ok) {
        const meData = await meRes.json();
        myUsername = meData.username || "";
      }
    } catch { /* ignore */ }

    // Fetch insights (likes + views) for each post in parallel
    const postsWithInsights = await Promise.all(
      mainPosts.map(async (post) => {
        const postId = String(post.id);
        let likes = Number(post.like_count) || 0;
        let views = 0;

        // Fetch from Insights API (more reliable than like_count field)
        try {
          const insRes = await fetch(
            `${THREADS_API_BASE}/${postId}/insights?metric=views,likes&access_token=${token}`
          );
          if (insRes.ok) {
            const insData = await insRes.json();
            for (const metric of insData.data || []) {
              if (metric.name === "views") {
                views = metric.values?.[0]?.value || metric.total_value?.value || 0;
              }
              if (metric.name === "likes") {
                const insLikes = metric.values?.[0]?.value || metric.total_value?.value || 0;
                if (insLikes > likes) likes = insLikes;
              }
            }
          }
        } catch { /* ignore */ }

        return { ...post, _likes: likes, _views: views };
      })
    );

    // Fetch thread continuations for ALL posts (not just those with reply_count > 0)
    if (includeReplies) {
      const replyFieldSets = [
        "id,text,timestamp,like_count,username,permalink",
        "id,text,timestamp,username",
        "id,text,timestamp",
      ];

      // Fetch replies for each post (limit to first 30 to avoid rate limits)
      const postsToCheck = postsWithInsights.slice(0, 30);
      const replyResults = await Promise.allSettled(
        postsToCheck.map(async (post) => {
          const postId = String(post.id);
          const data = await fetchWithFallback(`${postId}/replies`, 25, replyFieldSets, token);
          const replies = (data.data || []) as ThreadsPost[];

          // Filter to self-replies only (thread continuations)
          let selfReplies: ThreadsPost[];
          if (myUsername) {
            selfReplies = replies.filter((r) => r.username === myUsername);
          } else {
            // If we don't know the username, include all
            selfReplies = replies;
          }

          // For each self-reply, also fetch its nested replies (deeper thread chains)
          const nestedReplies: ThreadsPost[] = [];
          for (const selfReply of selfReplies) {
            try {
              const nestedData = await fetchWithFallback(
                `${selfReply.id}/replies`, 10, replyFieldSets, token
              );
              const nested = (nestedData.data || []) as ThreadsPost[];
              const nestedSelf = myUsername
                ? nested.filter((r) => r.username === myUsername)
                : nested;
              nestedReplies.push(...nestedSelf);
            } catch { /* ignore */ }
          }

          // Sort all continuations by timestamp
          const allContinuations = [...selfReplies, ...nestedReplies];
          allContinuations.sort((a, b) =>
            (String(a.timestamp || "")).localeCompare(String(b.timestamp || ""))
          );

          return { postId, continuations: allContinuations };
        })
      );

      // Build continuation map
      const continuationMap = new Map<string, ThreadsPost[]>();
      for (const result of replyResults) {
        if (result.status === "fulfilled" && result.value.continuations.length > 0) {
          continuationMap.set(result.value.postId, result.value.continuations);
        }
      }

      // Merge everything into final posts
      const mergedPosts = postsWithInsights.map((post) => {
        const postId = String(post.id);
        const conts = continuationMap.get(postId);

        const baseText = String(post.text || "");
        let fullText = baseText;
        let totalLikes = post._likes;
        let continuationCount = 0;

        if (conts && conts.length > 0) {
          // Append continuation texts
          const contTexts = conts.map((c) => String(c.text || "")).filter(Boolean);
          fullText = [baseText, ...contTexts].filter(Boolean).join("\n\n");
          // Add continuation likes
          totalLikes += conts.reduce((sum, c) => sum + (Number(c.like_count) || 0), 0);
          continuationCount = conts.length;
        }

        return {
          id: postId,
          text: fullText,
          date: post.timestamp ? String(post.timestamp).slice(0, 10) : "",
          timestamp: String(post.timestamp || ""),
          likes: totalLikes,
          replies: Number(post.reply_count) || 0,
          views: post._views,
          mediaType: String(post.media_type || "TEXT"),
          permalink: String(post.permalink || ""),
          continuationCount,
        };
      });

      return NextResponse.json({
        success: true,
        posts: mergedPosts,
        paging: mainData.paging || null,
      });
    }

    // No replies requested — return simple posts with insights
    const posts = postsWithInsights.map((post) => ({
      id: String(post.id || ""),
      text: String(post.text || ""),
      date: post.timestamp ? String(post.timestamp).slice(0, 10) : "",
      timestamp: String(post.timestamp || ""),
      likes: post._likes,
      replies: Number(post.reply_count) || 0,
      views: post._views,
      mediaType: String(post.media_type || "TEXT"),
      permalink: String(post.permalink || ""),
      continuationCount: 0,
    }));

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

interface ThreadsPost {
  id?: string | number;
  text?: string;
  timestamp?: string;
  like_count?: number;
  reply_count?: number;
  media_type?: string;
  permalink?: string;
  username?: string;
  [key: string]: unknown;
}

async function fetchWithFallback(
  endpoint: string,
  fetchLimit: number,
  fieldSets: string[],
  token: string
): Promise<{ data?: ThreadsPost[]; paging?: unknown; error?: string; status?: number }> {
  let res: Response | null = null;
  let lastErr = "";

  for (const fields of fieldSets) {
    try {
      res = await fetch(
        `${THREADS_API_BASE}/${endpoint}?fields=${fields}&limit=${fetchLimit}&access_token=${token}`
      );
      if (res.ok) break;
      lastErr = await res.text();
    } catch (e) {
      lastErr = e instanceof Error ? e.message : "fetch failed";
    }
  }

  if (!res || !res.ok) {
    return { data: [], error: lastErr, status: res?.status };
  }

  const json = await res.json();
  return { ...json, error: undefined, status: res.status };
}
