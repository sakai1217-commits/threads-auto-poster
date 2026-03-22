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

    // Fetch main threads - try field sets from richest to simplest
    const mainFieldSets = [
      "id,text,timestamp,like_count,reply_count,media_type,permalink",
      "id,text,timestamp,like_count,reply_count,permalink",
      "id,text,timestamp,like_count,reply_count",
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
    let debugInfo: Record<string, unknown> = {
      mainPostCount: mainPosts.length,
      mainFieldsUsed: mainData._fieldsUsed,
    };

    if (includeReplies && mainPosts.length > 0) {
      // Approach: For each main post, fetch its replies via {post_id}/replies
      // Then filter to self-replies (thread continuations)
      // This is more reliable than me/replies + replied_to chain walking

      // First, get the authenticated user's Threads user ID
      const meRes = await fetch(
        `${THREADS_API_BASE}/me?fields=id&access_token=${token}`
      );
      const meData = meRes.ok ? await meRes.json() : null;
      const myUserId = meData?.id ? String(meData.id) : null;

      const replyFieldSets = [
        "id,text,timestamp,like_count,reply_count,username,permalink",
        "id,text,timestamp,like_count,reply_count,username",
        "id,text,timestamp,username",
        "id,text,timestamp",
      ];

      // Fetch replies for posts that have reply_count > 0 (limit to first 20 posts to avoid rate limits)
      const postsToFetchReplies = mainPosts
        .filter((p) => Number(p.reply_count) > 0)
        .slice(0, 20);

      const replyResults = await Promise.allSettled(
        postsToFetchReplies.map(async (post) => {
          const postId = String(post.id);
          const data = await fetchWithFallback(
            `${postId}/replies`,
            25,
            replyFieldSets,
            token
          );
          return { postId, replies: (data.data || []) as ThreadsPost[], fieldsUsed: data._fieldsUsed };
        })
      );

      // Build map: parent post ID -> self-reply texts
      const continuationMap = new Map<string, ThreadsPost[]>();

      for (const result of replyResults) {
        if (result.status !== "fulfilled") continue;
        const { postId, replies } = result.value;

        // Filter to self-replies only (thread continuations from the same user)
        const selfReplies = myUserId
          ? replies.filter((r) => String(r.username) === String(meData?.username) || String(r.id) !== "")
          : replies; // If we can't get user ID, include all (best effort)

        // Actually, {post_id}/replies returns ALL replies to that post.
        // We want only the user's OWN replies (thread continuations).
        // If we have username, filter by it. Otherwise include all.
        const filtered = myUserId
          ? replies.filter((r) => {
              // If username field is available, match it
              if (r.username && meData?.username) {
                return r.username === meData.username;
              }
              // If no username field, include all (fallback - may include others' replies)
              return true;
            })
          : replies;

        if (filtered.length > 0) {
          // Sort by timestamp (oldest first)
          filtered.sort((a, b) =>
            ((a.timestamp as string) || "").localeCompare((b.timestamp as string) || "")
          );
          continuationMap.set(postId, filtered);

          // Recursively fetch replies of self-replies (nested continuations)
          for (const selfReply of filtered) {
            if (Number(selfReply.reply_count) > 0) {
              try {
                const nestedData = await fetchWithFallback(
                  `${selfReply.id}/replies`,
                  10,
                  replyFieldSets,
                  token
                );
                const nestedReplies = (nestedData.data || []) as ThreadsPost[];
                const nestedSelf = myUserId && meData?.username
                  ? nestedReplies.filter((r) => r.username === meData.username || !r.username)
                  : nestedReplies;
                if (nestedSelf.length > 0) {
                  nestedSelf.sort((a, b) =>
                    ((a.timestamp as string) || "").localeCompare((b.timestamp as string) || "")
                  );
                  const existing = continuationMap.get(postId) || [];
                  continuationMap.set(postId, [...existing, ...nestedSelf]);
                }
              } catch {
                // Nested fetch failed, skip
              }
            }
          }
        }
      }

      debugInfo = {
        ...debugInfo,
        myUserId,
        myUsername: meData?.username,
        postsWithReplies: postsToFetchReplies.length,
        continuationsFound: Array.from(continuationMap.entries()).map(([id, conts]) => ({
          postId: id,
          count: conts.length,
        })),
      };

      // Merge continuations into parent posts
      const mergedPosts = mainPosts.map((post) => {
        const postId = String(post.id);
        const conts = continuationMap.get(postId);

        if (!conts || conts.length === 0) {
          return buildPost(post, 0);
        }

        // Combine text: parent text + all continuation texts
        const allTexts = [
          (post.text as string) || "",
          ...conts.map((c) => (c.text as string) || ""),
        ].filter(Boolean);

        // Sum likes across parent + continuations
        const totalLikes =
          (Number(post.like_count) || 0) +
          conts.reduce((sum, c) => sum + (Number(c.like_count) || 0), 0);

        const totalReplies = Number(post.reply_count) || 0;

        return {
          id: postId,
          text: allTexts.join("\n\n"),
          date: post.timestamp ? String(post.timestamp).slice(0, 10) : "",
          timestamp: String(post.timestamp || ""),
          likes: totalLikes,
          replies: totalReplies,
          mediaType: String(post.media_type || "TEXT"),
          permalink: String(post.permalink || ""),
          continuationCount: conts.length,
        };
      });

      return NextResponse.json({
        success: true,
        posts: mergedPosts,
        paging: mainData.paging || null,
        _debug: debugInfo,
      });
    }

    // No replies requested
    const posts = mainPosts.map((item) => buildPost(item, 0));

    return NextResponse.json({
      success: true,
      posts,
      paging: mainData.paging || null,
      _debug: debugInfo,
    });
  } catch (error) {
    console.error("Threads posts fetch failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "投稿の取得に失敗しました" },
      { status: 500 }
    );
  }
}

// Types
interface ThreadsPost {
  id?: string | number;
  text?: string;
  timestamp?: string;
  like_count?: number;
  reply_count?: number;
  media_type?: string;
  permalink?: string;
  username?: string;
  replied_to?: { id?: string };
  [key: string]: unknown;
}

// Fetch with field set fallback
async function fetchWithFallback(
  endpoint: string,
  fetchLimit: number,
  fieldSets: string[],
  token: string
): Promise<{ data?: ThreadsPost[]; paging?: unknown; error?: string; status?: number; _fieldsUsed?: string }> {
  let res: Response | null = null;
  let lastErr = "";
  let fieldsUsed = "";

  for (const fields of fieldSets) {
    try {
      res = await fetch(
        `${THREADS_API_BASE}/${endpoint}?fields=${fields}&limit=${fetchLimit}&access_token=${token}`
      );
      if (res.ok) {
        fieldsUsed = fields;
        break;
      }
      lastErr = await res.text();
      console.error(`Threads API ${endpoint} [${fields}] error:`, res.status, lastErr);
    } catch (e) {
      lastErr = e instanceof Error ? e.message : "fetch failed";
      console.error(`Threads API ${endpoint} [${fields}] exception:`, lastErr);
    }
  }

  if (!res || !res.ok) {
    return { data: [], error: lastErr, status: res?.status, _fieldsUsed: "none" };
  }

  const json = await res.json();
  return { ...json, error: undefined, status: res.status, _fieldsUsed: fieldsUsed };
}

// Build a post object from raw API data
function buildPost(item: ThreadsPost, continuationCount: number) {
  return {
    id: String(item.id || ""),
    text: String(item.text || ""),
    date: item.timestamp ? String(item.timestamp).slice(0, 10) : "",
    timestamp: String(item.timestamp || ""),
    likes: Number(item.like_count) || 0,
    replies: Number(item.reply_count) || 0,
    mediaType: String(item.media_type || "TEXT"),
    permalink: String(item.permalink || ""),
    continuationCount,
  };
}
