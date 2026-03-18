import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { anthropicApiKey, posts } = body;

    if (!anthropicApiKey || !posts || posts.length === 0) {
      return NextResponse.json(
        { error: "APIキーと投稿データが必要です" },
        { status: 400 }
      );
    }

    const client = new Anthropic({ apiKey: anthropicApiKey });
    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      messages: [
        {
          role: "user",
          content: `以下はThreadsの占い・スピリチュアル系アカウントの過去投稿です。
これらの投稿を分析して「投稿タイプ（型）」に分類してください。

投稿一覧:
${posts.map((p: { text: string; date: string; likes: number; replies: number }, i: number) => `[${i + 1}] ${p.date} (${p.likes}いいね/${p.replies}返信)\n${p.text}`).join("\n\n")}

以下のJSON形式で出力してください。他のテキストは一切含めないでください:
{
  "types": [
    {
      "id": "type_1",
      "name": "タイプ名（例: 星座占い）",
      "description": "このタイプの特徴を1文で",
      "postIndices": [1, 3],
      "avgLikes": 25,
      "avgReplies": 5,
      "recommendedFrequency": "毎日",
      "bestTime": "09:00"
    }
  ]
}

ルール:
- 3〜6タイプに分類
- 各タイプに最低1つの投稿を割り当て
- 反応数(いいね・返信)の傾向も考慮
- recommendedFrequencyは「毎日」「週3回」「週2回」「週1回」のいずれか
- bestTimeは投稿に最適な時間帯`,
        },
      ],
    });

    const block = message.content[0];
    if (block.type !== "text") {
      throw new Error("AIからの応答が不正です");
    }

    const parsed = JSON.parse(block.text);
    return NextResponse.json({ success: true, analysis: parsed });
  } catch (error) {
    console.error("Analyze failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "分析に失敗しました" },
      { status: 500 }
    );
  }
}
