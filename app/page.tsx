"use client";

import { useState } from "react";

export default function Home() {
  const [threadsAccessToken, setThreadsAccessToken] = useState("");
  const [threadsUserId, setThreadsUserId] = useState("");
  const [anthropicApiKey, setAnthropicApiKey] = useState("");
  const [topic, setTopic] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [result, setResult] = useState<{ text?: string; postId?: string; error?: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("loading");
    setResult(null);

    try {
      const res = await fetch("/api/post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadsAccessToken,
          threadsUserId,
          anthropicApiKey,
          topic,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setStatus("error");
        setResult({ error: data.error });
        return;
      }

      setStatus("success");
      setResult({ text: data.text, postId: data.postId });
    } catch {
      setStatus("error");
      setResult({ error: "リクエストに失敗しました" });
    }
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0a0a0a",
      color: "#ededed",
      display: "flex",
      justifyContent: "center",
      padding: "2rem",
    }}>
      <div style={{ maxWidth: 560, width: "100%" }}>
        <h1 style={{
          fontSize: "1.8rem",
          fontWeight: 700,
          marginBottom: "0.25rem",
        }}>
          Threads Auto Poster
        </h1>
        <p style={{ color: "#888", marginBottom: "2rem", fontSize: "0.95rem" }}>
          AIが生成した投稿をThreadsに自動投稿します
        </p>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <Field
            label="Threads Access Token"
            value={threadsAccessToken}
            onChange={setThreadsAccessToken}
            placeholder="IGQVJx..."
            type="password"
          />
          <Field
            label="Threads User ID"
            value={threadsUserId}
            onChange={setThreadsUserId}
            placeholder="1234567890"
          />
          <Field
            label="Anthropic API Key"
            value={anthropicApiKey}
            onChange={setAnthropicApiKey}
            placeholder="sk-ant-..."
            type="password"
          />
          <Field
            label="投稿テーマ"
            value={topic}
            onChange={setTopic}
            placeholder="例: テクノロジー、日常、旅行..."
          />

          <button
            type="submit"
            disabled={status === "loading"}
            style={{
              padding: "0.75rem 1.5rem",
              fontSize: "1rem",
              fontWeight: 600,
              borderRadius: 8,
              border: "none",
              cursor: status === "loading" ? "not-allowed" : "pointer",
              background: status === "loading" ? "#333" : "#fff",
              color: status === "loading" ? "#888" : "#0a0a0a",
              transition: "background 0.2s",
            }}
          >
            {status === "loading" ? "生成・投稿中..." : "投稿を生成して公開"}
          </button>
        </form>

        {result && (
          <div style={{
            marginTop: "1.5rem",
            padding: "1rem",
            borderRadius: 8,
            background: status === "error" ? "#2a1215" : "#0f2a1a",
            border: `1px solid ${status === "error" ? "#5c2327" : "#1a4a2e"}`,
          }}>
            {status === "error" && (
              <p style={{ color: "#f87171" }}>{result.error}</p>
            )}
            {status === "success" && (
              <>
                <p style={{ color: "#4ade80", fontWeight: 600, marginBottom: "0.5rem" }}>
                  投稿完了! (ID: {result.postId})
                </p>
                <p style={{
                  color: "#d1d5db",
                  whiteSpace: "pre-wrap",
                  fontSize: "0.9rem",
                  lineHeight: 1.6,
                }}>
                  {result.text}
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  type?: string;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
      <span style={{ fontSize: "0.85rem", color: "#aaa", fontWeight: 500 }}>{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required
        style={{
          padding: "0.65rem 0.75rem",
          fontSize: "0.95rem",
          borderRadius: 8,
          border: "1px solid #333",
          background: "#141414",
          color: "#ededed",
          outline: "none",
        }}
      />
    </label>
  );
}
