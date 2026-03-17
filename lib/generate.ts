import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

export async function generatePost(topic: string): Promise<string> {
  const message = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 300,
    messages: [
      {
        role: "user",
        content: `あなたはThreads（SNS）の投稿を作成するライターです。
以下のテーマに関する魅力的な投稿を1つ作成してください。

テーマ: ${topic}

ルール:
- 500文字以内
- 自然で親しみやすいトーン
- ハッシュタグは2〜3個
- 絵文字は適度に使用
- 宣伝っぽくならないこと
- 投稿本文のみを出力（説明や前置きは不要）`,
      },
    ],
  });

  const block = message.content[0];
  if (block.type !== "text") {
    throw new Error("Unexpected response type");
  }

  return block.text;
}
