import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getUserByResetToken, resetPassword } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token, newPassword } = body;

    if (!token || !newPassword) {
      return NextResponse.json(
        { error: "コードと新しいパスワードを入力してください" },
        { status: 400 }
      );
    }

    if (newPassword.length < 8) {
      return NextResponse.json(
        { error: "パスワードは8文字以上にしてください" },
        { status: 400 }
      );
    }

    const user = await getUserByResetToken(token);
    if (!user) {
      return NextResponse.json(
        { error: "コードが無効または期限切れです" },
        { status: 400 }
      );
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await resetPassword(user.id, passwordHash);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Reset confirm failed:", error);
    return NextResponse.json(
      { error: "パスワードのリセットに失敗しました" },
      { status: 500 }
    );
  }
}
