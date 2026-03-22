import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

const THREADS_API_BASE = "https://graph.threads.net/v1.0";

export async function GET() {
  try {
    // Get the first user with a threads token (no auth required for debugging)
    const result = await sql`SELECT id, threads_access_token FROM users WHERE threads_access_token IS NOT NULL LIMIT 1`;
    const user = result.rows[0];

    if (!user?.threads_access_token) {
      return NextResponse.json({ error: "No user with threads token found" });
    }

    const token = user.threads_access_token as string;
    const output: Record<string, unknown> = {};

    // 1. Test /me endpoint
    try {
      const meRes = await fetch(`${THREADS_API_BASE}/me?fields=id,username&access_token=${token}`);
      output.me = meRes.ok ? await meRes.json() : { status: meRes.status, body: await meRes.text() };
    } catch (e) {
      output.me = { error: String(e) };
    }

    // 2. Fetch main threads - try each field set separately to see which works
    const mainFieldSets = [
      "id,text,timestamp,like_count,reply_count,media_type,permalink",
      "id,text,timestamp,like_count,reply_count",
      "id,text,timestamp",
    ];

    for (const fields of mainFieldSets) {
      const key = `main_${fields.replace(/,/g, "_")}`;
      try {
        const res = await fetch(
          `${THREADS_API_BASE}/me/threads?fields=${fields}&limit=3&access_token=${token}`
        );
        if (res.ok) {
          const data = await res.json();
          output[key] = { success: true, count: data.data?.length, sample: data.data?.slice(0, 2) };
          // Store the successful field set
          if (!output.mainPostsSample) {
            output.mainPostsSample = data.data?.slice(0, 3);
            output.mainFieldsUsed = fields;
          }
        } else {
          output[key] = { success: false, status: res.status, body: await res.text() };
        }
      } catch (e) {
        output[key] = { error: String(e) };
      }
    }

    // 3. Test {post_id}/replies for the first post with reply_count > 0
    const posts = (output.mainPostsSample as Record<string, unknown>[]) || [];
    const postWithReplies = posts.find((p) => Number(p.reply_count) > 0);

    if (postWithReplies) {
      const postId = String(postWithReplies.id);
      output.testPostId = postId;
      output.testPostReplyCount = postWithReplies.reply_count;

      const replyFieldSets = [
        "id,text,timestamp,like_count,reply_count,username,permalink",
        "id,text,timestamp,like_count,username",
        "id,text,timestamp,username",
        "id,text,timestamp",
      ];

      for (const fields of replyFieldSets) {
        const key = `replies_${fields.replace(/,/g, "_")}`;
        try {
          const res = await fetch(
            `${THREADS_API_BASE}/${postId}/replies?fields=${fields}&limit=5&access_token=${token}`
          );
          if (res.ok) {
            const data = await res.json();
            output[key] = { success: true, count: data.data?.length, data: data.data };
            if (!output.repliesSample) {
              output.repliesSample = data.data;
              output.replyFieldsUsed = fields;
            }
          } else {
            output[key] = { success: false, status: res.status, body: await res.text() };
          }
        } catch (e) {
          output[key] = { error: String(e) };
        }
      }
    } else {
      output.repliesNote = "No posts with reply_count > 0 found in first 3 posts";

      // Try fetching replies for the first post anyway
      if (posts.length > 0) {
        const firstPostId = String(posts[0].id);
        output.testFirstPostId = firstPostId;
        try {
          const res = await fetch(
            `${THREADS_API_BASE}/${firstPostId}/replies?fields=id,text,timestamp,username&limit=5&access_token=${token}`
          );
          output.firstPostReplies = res.ok
            ? { success: true, data: await res.json() }
            : { success: false, status: res.status, body: await res.text() };
        } catch (e) {
          output.firstPostReplies = { error: String(e) };
        }
      }
    }

    // 4. Test insights for first post
    if (posts.length > 0) {
      const firstPostId = String(posts[0].id);
      try {
        const res = await fetch(
          `${THREADS_API_BASE}/${firstPostId}/insights?metric=views&access_token=${token}`
        );
        output.insights = res.ok
          ? { success: true, data: await res.json() }
          : { success: false, status: res.status, body: await res.text() };
      } catch (e) {
        output.insights = { error: String(e) };
      }
    }

    return NextResponse.json(output);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Debug failed" },
      { status: 500 }
    );
  }
}
