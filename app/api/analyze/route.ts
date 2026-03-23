import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getUserById } from "@/lib/db";

function tryParseJSON(text: string): unknown {
  // 1. Try direct parse
  try { return JSON.parse(text); } catch {}

  // 2. Extract from ```json ... ```
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    try { return JSON.parse(fenceMatch[1].trim()); } catch {}
  }

  // 3. Extract JSON object
  const objMatch = text.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try { return JSON.parse(objMatch[0]); } catch {}

    // 4. Try to fix truncated JSON by closing brackets
    let candidate = objMatch[0];
    // Count open/close braces and brackets
    const openBraces = (candidate.match(/\{/g) || []).length;
    const closeBraces = (candidate.match(/\}/g) || []).length;
    const openBrackets = (candidate.match(/\[/g) || []).length;
    const closeBrackets = (candidate.match(/\]/g) || []).length;

    // Remove trailing comma or incomplete value
    candidate = candidate.replace(/,\s*$/, "");
    // Remove incomplete last object/entry
    candidate = candidate.replace(/,\s*\{[^}]*$/, "");

    // Close missing brackets/braces
    for (let i = 0; i < openBrackets - closeBrackets; i++) candidate += "]";
    for (let i = 0; i < openBraces - closeBraces; i++) candidate += "}";

    try { return JSON.parse(candidate); } catch {}
  }

  return null;
}

export async function POST(request: NextRequest) {
  try {
    const userId = Number(request.headers.get("x-user-id"));
    const user = await getUserById(userId);

    if (!user?.anthropic_api_key) {
      return NextResponse.json(
        { error: "設定画面からAnthropic APIキーを登録してください" },
        { status: 400 }
      );
    }

    const body = await request.json();
    let { posts } = body;

    if (!posts || posts.length === 0) {
      return NextResponse.json(
        { error: "投稿データが必要です" },
        { status: 400 }
      );
    }

    // Limit posts to avoid token overflow
    if (posts.length > 50) {
      posts = posts.slice(0, 50);
    }

    const client = new Anthropic({ apiKey: user.anthropic_api_key });
    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2048,
      messages: [
        {
          role: "user",
          content: `以下はThreadsアカウントの過去投稿${posts.length}件です。投稿タイプに分類してください。

投稿一覧:
${posts.map((p: { text: string; date: string; likes: number; replies: number }, i: number) => `[${i + 1}] ${p.date} (${p.likes}いいね/${p.replies}返信)\n${p.text}`).join("\n\n")}

純粋なJSONのみ出力。説明文やコードフェンスは不要:
{"types":[{"id":"type_1","name":"タイプ名","description":"特徴","postIndices":[1,3],"avgLikes":25,"avgReplies":5,"recommendedFrequency":"毎日","bestTime":"09:00"}]}

ルール:
- 3〜6タイプに分類
- 各タイプに最低1つの投稿を割り当て
- recommendedFrequencyは「毎日」「週3回」「週2回」「週1回」のいずれか`,
        },
      ],
    });

    const block = message.content[0];
    if (block.type !== "text") {
      throw new Error("AIからの応答が不正です");
    }

    const parsed = tryParseJSON(block.text.trim());
    if (!parsed || typeof parsed !== "object") {
      console.error("Failed to parse AI response:", block.text.slice(0, 500));
      throw new Error("AIの応答をJSONとして解析できませんでした。再度お試しください。");
    }

    return NextResponse.json({ success: true, analysis: parsed });
  } catch (error) {
    console.error("Analyze failed:", error);
    const msg = error instanceof Error ? error.message : String(error);
    let userMsg = "分析に失敗しました";
    if (msg.includes("credit balance is too low") || msg.includes("billing")) {
      userMsg = "Anthropic APIのクレジット残高が不足しています。Anthropicの管理画面でクレジットを追加してください。";
    } else if (msg.includes("invalid_api_key") || msg.includes("authentication")) {
      userMsg = "Anthropic APIキーが無効です。設定画面で正しいキーを入力してください。";
    } else if (msg.includes("rate_limit") || msg.includes("429")) {
      userMsg = "APIのリクエスト制限に達しました。しばらく待ってから再度お試しください。";
    } else {
      userMsg = msg;
    }
    return NextResponse.json(
      { error: userMsg },
      { status: 500 }
    );
  }
}
