import { sql } from "@vercel/postgres";

export { sql };

export interface DbUser {
  id: number;
  email: string;
  password_hash: string;
  anthropic_api_key: string | null;
  threads_access_token: string | null;
  threads_user_id: string | null;
  post_topic: string | null;
  created_at: Date;
  reset_token: string | null;
  reset_token_expires: Date | null;
  updated_at: Date;
}

export async function getUserByEmail(email: string): Promise<DbUser | null> {
  const result = await sql`SELECT * FROM users WHERE email = ${email} LIMIT 1`;
  return (result.rows[0] as DbUser) || null;
}

export async function getUserById(id: number): Promise<DbUser | null> {
  const result = await sql`SELECT * FROM users WHERE id = ${id} LIMIT 1`;
  return (result.rows[0] as DbUser) || null;
}

export async function createUser(email: string, passwordHash: string): Promise<DbUser> {
  const result = await sql`
    INSERT INTO users (email, password_hash)
    VALUES (${email}, ${passwordHash})
    RETURNING *
  `;
  return result.rows[0] as DbUser;
}

export async function updateUserKeys(
  userId: number,
  keys: {
    anthropic_api_key?: string;
    threads_access_token?: string;
    threads_user_id?: string;
    post_topic?: string;
  }
): Promise<void> {
  await sql`
    UPDATE users SET
      anthropic_api_key = COALESCE(${keys.anthropic_api_key ?? null}, anthropic_api_key),
      threads_access_token = COALESCE(${keys.threads_access_token ?? null}, threads_access_token),
      threads_user_id = COALESCE(${keys.threads_user_id ?? null}, threads_user_id),
      post_topic = COALESCE(${keys.post_topic ?? null}, post_topic),
      updated_at = NOW()
    WHERE id = ${userId}
  `;
}

export async function setResetToken(email: string, token: string, expiresAt: Date): Promise<void> {
  await sql`
    UPDATE users SET
      reset_token = ${token},
      reset_token_expires = ${expiresAt.toISOString()},
      updated_at = NOW()
    WHERE email = ${email}
  `;
}

export async function getUserByResetToken(token: string): Promise<DbUser | null> {
  const result = await sql`
    SELECT * FROM users
    WHERE reset_token = ${token} AND reset_token_expires > NOW()
    LIMIT 1
  `;
  return (result.rows[0] as DbUser) || null;
}

export async function resetPassword(userId: number, passwordHash: string): Promise<void> {
  await sql`
    UPDATE users SET
      password_hash = ${passwordHash},
      reset_token = NULL,
      reset_token_expires = NULL,
      updated_at = NOW()
    WHERE id = ${userId}
  `;
}

export async function getUserData(userId: number, key: string): Promise<unknown> {
  const result = await sql`
    SELECT data_value FROM user_data
    WHERE user_id = ${userId} AND data_key = ${key}
    LIMIT 1
  `;
  return result.rows[0]?.data_value ?? [];
}

export async function saveUserData(userId: number, key: string, value: unknown): Promise<void> {
  const jsonValue = JSON.stringify(value);
  await sql`
    INSERT INTO user_data (user_id, data_key, data_value)
    VALUES (${userId}, ${key}, ${jsonValue}::jsonb)
    ON CONFLICT (user_id, data_key)
    DO UPDATE SET data_value = ${jsonValue}::jsonb, updated_at = NOW()
  `;
}
