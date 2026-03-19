import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const THREADS_API_BASE = "https://graph.threads.net/v1.0";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { topic, referenceData } = body;

    const threadsAccessToken = process.env.THREADS_ACCESS_TOKEN;
    const threadsUserId = process.env.THREADS_USER_ID;

    if (!threadsAccessToken || !threadsUserId) {
      return NextResponse.json(
        { error: "Threads APIがサーバーに設定されていません" },
        { status: 500 }
      );
    }

    if (!topic) {
      return NextResponse.json(
        { error: "投稿テーマを入力してください" },
        { status: 400 }
      );
    }

    // AIで投稿内容を生成
    const client = new Anthropic();
    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 300,
      messages: [
        {
          role: "user",
          content: `あなたはThreads（SNS）の占い・スピリチュアル系アカウントの投稿を作成するライターです。
以下のテーマに関する魅力的な投稿を1つ作成してください。

テーマ: ${topic}
${referenceData ? `\n参考データ（競合投稿やトレンド情報）:\n${referenceData}\n\n上記の参考データを分析し、差別化しつつトレンドを押さえた投稿を作成してください。` : ""}

ルール:
- 500文字以内
- スピリチュアル・占い系の温かく神秘的なトーン
- ハッシュタグは2〜3個
- 絵文字は適度に使用
- 宣伝っぽくならないこと
- 投稿本文のみを出力（説明や前置きは不要）`,
        },
      ],
    });

    const block = message.content[0];
    if (block.type !== "text") {
      throw new Error("AIからの応答が不正です");
    }
    const text = block.text;

    // Threadsに投稿: Step 1 - メディアコンテナ作成
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
      text,
    });
  } catch (error) {
    console.error("Post failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "不明なエラー" },
      { status: 500 }
    );
  }
}
