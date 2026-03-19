import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";

// このエンドポイントはデータベースのテーブルを初期化するためのものです。
// デプロイ後に1回だけ呼び出してください。
// セキュリティのため、CRON_SECRETで保護しています。
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id            SERIAL PRIMARY KEY,
        email         VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        anthropic_api_key     TEXT,
        threads_access_token  TEXT,
        threads_user_id       TEXT,
        post_topic    TEXT DEFAULT 'テクノロジーとプログラミングに関する豆知識や tips',
        created_at    TIMESTAMP DEFAULT NOW(),
        updated_at    TIMESTAMP DEFAULT NOW()
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS user_data (
        id         SERIAL PRIMARY KEY,
        user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        data_key   VARCHAR(100) NOT NULL,
        data_value JSONB NOT NULL DEFAULT '[]'::jsonb,
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_id, data_key)
      )
    `;

    return NextResponse.json({ success: true, message: "テーブルを作成しました" });
  } catch (error) {
    console.error("Setup failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "セットアップに失敗しました" },
      { status: 500 }
    );
  }
}
