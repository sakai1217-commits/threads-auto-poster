const THREADS_API_BASE = "https://graph.threads.net/v1.0";

export async function publishToThreads(text: string): Promise<{ id: string }> {
  const accessToken = process.env.THREADS_ACCESS_TOKEN;

  if (!accessToken) {
    throw new Error("THREADS_ACCESS_TOKEN is required");
  }

  // Step 1: メディアコンテナを作成
  const createRes = await fetch(
    `${THREADS_API_BASE}/me/threads`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        media_type: "TEXT",
        text,
        access_token: accessToken,
      }),
    }
  );

  if (!createRes.ok) {
    const error = await createRes.text();
    throw new Error(`Failed to create media container: ${error}`);
  }

  const { id: creationId } = await createRes.json();

  // Step 2: 公開
  const publishRes = await fetch(
    `${THREADS_API_BASE}/me/threads_publish`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        creation_id: creationId,
        access_token: accessToken,
      }),
    }
  );

  if (!publishRes.ok) {
    const error = await publishRes.text();
    throw new Error(`Failed to publish thread: ${error}`);
  }

  return publishRes.json();
}
