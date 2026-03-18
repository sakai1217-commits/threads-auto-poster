import { NextRequest, NextResponse } from "next/server";

const THREADS_API_BASE = "https://graph.threads.net/v1.0";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { threadsAccessToken, threadsUserId, text } = body;

    if (!threadsAccessToken || !threadsUserId || !text) {
      return NextResponse.json(
        { error: "Threads APIの設定と投稿内容が必要です" },
        { status: 400 }
      );
    }

    // Step 1 - メディアコンテナ作成
    const createRes = await fetch(
      `${THREADS_API_BASE}/${threadsUserId}/threads`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          media_type: "TEXT",
          text,
          access_token: threadsAccessToken,
        }),
      }
    );

    if (!createRes.ok) {
      const error = await createRes.text();
      throw new Error(`Threadsメディアコンテナ作成失敗: ${error}`);
    }

    const { id: creationId } = await createRes.json();

    // Step 2 - 公開
    const publishRes = await fetch(
      `${THREADS_API_BASE}/${threadsUserId}/threads_publish`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creation_id: creationId,
          access_token: threadsAccessToken,
        }),
      }
    );

    if (!publishRes.ok) {
      const error = await publishRes.text();
      throw new Error(`Threads投稿公開失敗: ${error}`);
    }

    const result = await publishRes.json();

    return NextResponse.json({
      success: true,
      postId: result.id,
    });
  } catch (error) {
    console.error("Publish failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "不明なエラー" },
      { status: 500 }
    );
  }
}
