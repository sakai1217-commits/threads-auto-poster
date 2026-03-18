import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { anthropicApiKey, topic, referenceData } = body;

    if (!anthropicApiKey || !topic) {
      return NextResponse.json(
        { error: "APIキーと投稿テーマを入力してください" },
        { status: 400 }
      );
    }

    const client = new Anthropic({ apiKey: anthropicApiKey });
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

    return NextResponse.json({ success: true, text: block.text });
  } catch (error) {
    console.error("Generate failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "不明なエラー" },
      { status: 500 }
    );
  }
}
