import { NextRequest, NextResponse } from "next/server";
import { getUserData, saveUserData } from "@/lib/db";

const ALLOWED_KEYS = ["drafts", "postTypes", "scheduleEntries"];

export async function GET(request: NextRequest) {
  try {
    const userId = Number(request.headers.get("x-user-id"));
    const key = request.nextUrl.searchParams.get("key");

    if (!key || !ALLOWED_KEYS.includes(key)) {
      return NextResponse.json({ error: "無効なキーです" }, { status: 400 });
    }

    const data = await getUserData(userId, key);
    return NextResponse.json({ data });
  } catch (error) {
    console.error("Get data failed:", error);
    return NextResponse.json({ error: "データの取得に失敗しました" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const userId = Number(request.headers.get("x-user-id"));
    const body = await request.json();
    const { key, value } = body;

    if (!key || !ALLOWED_KEYS.includes(key)) {
      return NextResponse.json({ error: "無効なキーです" }, { status: 400 });
    }

    await saveUserData(userId, key, value);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Save data failed:", error);
    return NextResponse.json({ error: "データの保存に失敗しました" }, { status: 500 });
  }
}
