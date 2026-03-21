import { NextRequest, NextResponse } from "next/server";
import { getUserById } from "@/lib/db";

const THREADS_API_BASE = "https://graph.threads.net/v1.0";

export async function GET(request: NextRequest) {
  try {
    const userId = Number(request.headers.get("x-user-id"));
    const user = await getUserById(userId);

    if (!user?.threads_access_token) {
      return NextResponse.json(
        { error: "先にアクセストークンを保存してください" },
        { status: 400 }
      );
    }

    const res = await fetch(
      `${THREADS_API_BASE}/me?fields=id,username,name&access_token=${user.threads_access_token}`
    );

    if (!res.ok) {
      const errText = await res.text();
      console.error("Threads /me error:", res.status, errText);
      return NextResponse.json(
        { error: `アクセストークンが無効です (${res.status}): ${errText}` },
        { status: 400 }
      );
    }

    const data = await res.json();

    return NextResponse.json({
      success: true,
      userId: String(data.id),
      username: data.username || "",
      name: data.name || "",
    });
  } catch (error) {
    console.error("Threads /me failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "ユーザー情報の取得に失敗しました" },
      { status: 500 }
    );
  }
}
