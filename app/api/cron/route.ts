import { NextRequest, NextResponse } from "next/server";
import { generatePost } from "@/lib/generate";
import { publishToThreads } from "@/lib/threads";

export async function GET(request: NextRequest) {
  // Vercel Cron認証
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const topic = process.env.POST_TOPIC || "テクノロジー";

    // AIで投稿内容を生成
    const text = await generatePost(topic);
    console.log("Generated post:", text);

    // Threadsに投稿
    const result = await publishToThreads(text);
    console.log("Published:", result);

    return NextResponse.json({
      success: true,
      postId: result.id,
      text,
    });
  } catch (error) {
    console.error("Cron job failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
