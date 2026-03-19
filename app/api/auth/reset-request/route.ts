import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { Resend } from "resend";
import { getUserByEmail, setResetToken } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email } = body;

    if (!email) {
      return NextResponse.json(
        { error: "メールアドレスを入力してください" },
        { status: 400 }
      );
    }

    const user = await getUserByEmail(email);

    // セキュリティ: ユーザーが存在しなくても同じレスポンスを返す
    if (!user) {
      return NextResponse.json({ success: true });
    }

    // リセットトークン生成（6桁の数字コード）
    const token = crypto.randomInt(100000, 999999).toString();
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30分有効

    await setResetToken(email, token, expiresAt);

    // メール送信
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || "noreply@resend.dev",
      to: email,
      subject: "パスワードリセット - Threads占い自動投稿AI",
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 2rem;">
          <h2 style="color: #7c3aed;">パスワードリセット</h2>
          <p>以下のコードを入力してパスワードをリセットしてください。</p>
          <div style="background: #f3f0ff; padding: 1.5rem; border-radius: 12px; text-align: center; margin: 1.5rem 0;">
            <span style="font-size: 2rem; font-weight: 700; letter-spacing: 0.3em; color: #7c3aed;">${token}</span>
          </div>
          <p style="color: #666; font-size: 0.85rem;">このコードは30分間有効です。</p>
          <p style="color: #666; font-size: 0.85rem;">心当たりがない場合は、このメールを無視してください。</p>
        </div>
      `,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Reset request failed:", error);
    return NextResponse.json(
      { error: "リセットメールの送信に失敗しました" },
      { status: 500 }
    );
  }
}
