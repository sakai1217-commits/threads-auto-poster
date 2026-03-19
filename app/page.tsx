"use client";

import { useState, useEffect, useCallback, useRef } from "react";

// --- Types ---
interface UploadedFile {
  name: string;
  size: number;
  content: string;
  uploadedAt: Date;
}

interface ScheduleItem {
  id: string;
  topic: string;
  scheduledAt: string;
  status: "scheduled" | "posted" | "failed";
}

interface PostRecord {
  text: string;
  date: string;
  likes: number;
  replies: number;
}

interface DraftPost {
  id: string;
  text: string;
  topic: string;
  createdAt: Date;
  status: "pending" | "approved" | "published" | "rejected";
}

interface PostType {
  id: string;
  name: string;
  description: string;
  postIndices: number[];
  avgLikes: number;
  avgReplies: number;
  recommendedFrequency: string;
  bestTime: string;
}

interface ScheduleEntry {
  id: string;
  dayOfWeek: string;
  time: string;
  postTypeId: string;
  postTypeName: string;
}

// --- Mock data ---
const MOCK_POSTS: PostRecord[] = [
  { text: "今日の満月はあなたの心を浄化する特別な夜。窓を開けて月光を浴びながら、深呼吸してみてください。宇宙があなたに贈る癒しの時間です。\n\n#満月 #スピリチュアル", date: "2026-03-16", likes: 24, replies: 5 },
  { text: "牡羊座の方へ。今週は直感を信じて行動すると、思いがけない幸運が訪れそう。心の声に耳を澄ませて。\n\n#星座占い #今日の運勢", date: "2026-03-15", likes: 31, replies: 8 },
  { text: "タロットからのメッセージ: 塔のカードは崩壊ではなく再生の始まり。古い殻を脱ぎ捨てる勇気を持って。\n\n#タロット #スピリチュアル", date: "2026-03-14", likes: 18, replies: 3 },
  { text: "春分の日が近づいています。宇宙のエネルギーが大きく切り替わるこの時期、新しい意図を設定するのに最適です。\n\n#春分 #宇宙エネルギー #スピリチュアル", date: "2026-03-13", likes: 42, replies: 12 },
  { text: "数秘術で見る今週のキーナンバーは「7」。内省と直感の週です。瞑想の時間を大切に。\n\n#数秘術 #今日の運勢", date: "2026-03-12", likes: 15, replies: 2 },
];

const MOCK_SCHEDULE: ScheduleItem[] = [
  { id: "1", topic: "今日の12星座占い", scheduledAt: "2026-03-18 09:00", status: "scheduled" },
  { id: "2", topic: "タロット・ワンオラクル", scheduledAt: "2026-03-18 18:00", status: "scheduled" },
  { id: "3", topic: "満月のメッセージ", scheduledAt: "2026-03-19 09:00", status: "scheduled" },
  { id: "4", topic: "数秘術で読む今週の運勢", scheduledAt: "2026-03-17 09:00", status: "posted" },
  { id: "5", topic: "春分のスピリチュアルメッセージ", scheduledAt: "2026-03-16 12:00", status: "posted" },
];

// --- Styles ---
const card: React.CSSProperties = {
  background: "var(--card-bg)",
  backdropFilter: "blur(8px)",
  borderRadius: 16,
  border: "1px solid var(--card-border)",
  boxShadow: "0 2px 16px rgba(107, 33, 168, 0.06)",
  padding: "1.5rem",
};

const sectionTitle: React.CSSProperties = {
  fontSize: "0.8rem",
  fontWeight: 600,
  color: "var(--text-secondary)",
  letterSpacing: "0.04em",
  marginBottom: "1rem",
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
};

const inputStyle: React.CSSProperties = {
  padding: "0.6rem 0.75rem",
  fontSize: "0.9rem",
  borderRadius: 10,
  border: "1px solid var(--input-border)",
  background: "var(--input-bg)",
  color: "var(--text-primary)",
  outline: "none",
  width: "100%",
  fontFamily: "inherit",
};

const statBox: React.CSSProperties = {
  textAlign: "center" as const,
  padding: "1rem 0.5rem",
  borderRadius: 12,
  background: "rgba(107, 33, 168, 0.04)",
  flex: 1,
};

const btnPrimary: React.CSSProperties = {
  padding: "0.6rem 1.25rem",
  fontSize: "0.85rem",
  fontWeight: 600,
  borderRadius: 10,
  border: "none",
  cursor: "pointer",
  background: "linear-gradient(135deg, #7c3aed, #b8860b)",
  color: "#fff",
  fontFamily: "inherit",
  transition: "opacity 0.2s",
};

const btnSecondary: React.CSSProperties = {
  padding: "0.5rem 1rem",
  fontSize: "0.8rem",
  fontWeight: 500,
  borderRadius: 8,
  border: "1px solid var(--input-border)",
  cursor: "pointer",
  background: "var(--input-bg)",
  color: "var(--text-primary)",
  fontFamily: "inherit",
};

type TabKey = "dashboard" | "files" | "analytics" | "schedule" | "recent" | "review" | "settings";

// --- Helper: handle 401 responses ---
async function authFetch(url: string, options: RequestInit, onUnauth: () => void): Promise<Response> {
  const res = await fetch(url, options);
  if (res.status === 401) {
    onUnauth();
    throw new Error("セッションが切れました。再ログインしてください。");
  }
  return res;
}

// --- Debounced server save hook ---
function useServerData<T>(
  key: string,
  fallback: T,
  authenticated: boolean,
  onUnauth: () => void,
): [T, (val: T | ((prev: T) => T)) => void, boolean] {
  const [data, setData] = useState<T>(fallback);
  const [loaded, setLoaded] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestData = useRef(data);
  latestData.current = data;

  // Load from server
  useEffect(() => {
    if (!authenticated) return;
    authFetch(`/api/data?key=${key}`, {}, onUnauth)
      .then((r) => r.json())
      .then((d) => {
        if (d.data && (Array.isArray(d.data) ? d.data.length > 0 : true)) {
          setData(d.data as T);
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [key, authenticated, onUnauth]);

  // Debounced save to server
  const setDataAndSave = useCallback(
    (val: T | ((prev: T) => T)) => {
      setData((prev) => {
        const next = typeof val === "function" ? (val as (prev: T) => T)(prev) : val;
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => {
          authFetch("/api/data", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ key, value: next }),
          }, onUnauth).catch(() => {});
        }, 500);
        return next;
      });
    },
    [key, onUnauth],
  );

  return [data, setDataAndSave, loaded];
}

// --- Auth Screen (Login + Register + Reset) ---
function AuthScreen({ onLogin }: { onLogin: () => void }) {
  const [mode, setMode] = useState<"login" | "register" | "reset-request" | "reset-confirm">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const handleResetRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/reset-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      setSuccess("リセットコードをメールに送信しました");
      setMode("reset-confirm");
    } catch { setError("送信に失敗しました"); }
    finally { setLoading(false); }
  };

  const handleResetConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/reset-confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: resetCode, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      setSuccess("パスワードを変更しました。ログインしてください。");
      setMode("login");
      setPassword("");
      setResetCode("");
      setNewPassword("");
    } catch { setError("リセットに失敗しました"); }
    finally { setLoading(false); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    if (mode === "register" && password !== confirmPassword) {
      setError("パスワードが一致しません");
      setLoading(false);
      return;
    }

    try {
      const url = mode === "login" ? "/api/auth/login" : "/api/auth/register";
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "エラーが発生しました");
        return;
      }

      if (mode === "register") {
        setSuccess("登録が完了しました。ログインしてください。");
        setMode("login");
        setPassword("");
        setConfirmPassword("");
      } else {
        onLogin();
      }
    } catch {
      setError("通信に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  const darkInput: React.CSSProperties = {
    ...inputStyle,
    marginBottom: "0.75rem",
    background: "rgba(255, 255, 255, 0.06)",
    border: "1px solid rgba(168, 85, 247, 0.3)",
    color: "#e9d5ff",
  };

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "linear-gradient(135deg, #1a0533 0%, #2d1b4e 50%, #1a0533 100%)",
    }}>
      <div style={{
        ...card,
        width: "100%",
        maxWidth: 420,
        padding: "2.5rem",
        background: "rgba(45, 27, 78, 0.85)",
        border: "1px solid rgba(168, 85, 247, 0.2)",
      }}>
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <h1 style={{
            fontSize: "1.3rem",
            fontWeight: 700,
            background: "linear-gradient(135deg, #c084fc, #fde68a)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            marginBottom: "0.5rem",
          }}>
            Threads占い 自動投稿AI
          </h1>
          <p style={{ fontSize: "0.78rem", color: "#a89bbe" }}>
            {mode === "login" && "ログインしてください"}
            {mode === "register" && "新規アカウント登録"}
            {mode === "reset-request" && "パスワードリセット"}
            {mode === "reset-confirm" && "リセットコードを入力"}
          </p>
        </div>

        {(mode === "login" || mode === "register") && (
          <form onSubmit={handleSubmit}>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="メールアドレス" style={darkInput} autoFocus />
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="パスワード" style={darkInput} />
            {mode === "register" && (
              <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="パスワード（確認）" style={darkInput} />
            )}
            <button type="submit" disabled={loading || !email || !password} style={{ ...btnPrimary, width: "100%", padding: "0.75rem", opacity: loading ? 0.6 : 1, cursor: loading ? "not-allowed" : "pointer", marginBottom: "1rem" }}>
              {loading ? (mode === "login" ? "ログイン中..." : "登録中...") : (mode === "login" ? "ログイン" : "アカウントを作成")}
            </button>
          </form>
        )}

        {mode === "reset-request" && (
          <form onSubmit={handleResetRequest}>
            <p style={{ fontSize: "0.82rem", color: "#c4b5d9", marginBottom: "1rem" }}>
              登録したメールアドレスにリセットコードを送信します
            </p>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="メールアドレス" style={darkInput} autoFocus />
            <button type="submit" disabled={loading || !email} style={{ ...btnPrimary, width: "100%", padding: "0.75rem", opacity: loading ? 0.6 : 1, cursor: loading ? "not-allowed" : "pointer", marginBottom: "1rem" }}>
              {loading ? "送信中..." : "リセットコードを送信"}
            </button>
          </form>
        )}

        {mode === "reset-confirm" && (
          <form onSubmit={handleResetConfirm}>
            <p style={{ fontSize: "0.82rem", color: "#c4b5d9", marginBottom: "1rem" }}>
              メールに届いた6桁のコードと新しいパスワードを入力してください
            </p>
            <input type="text" value={resetCode} onChange={(e) => setResetCode(e.target.value)} placeholder="6桁のリセットコード" style={{ ...darkInput, textAlign: "center", fontSize: "1.2rem", letterSpacing: "0.3em" }} autoFocus />
            <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="新しいパスワード（8文字以上）" style={darkInput} />
            <button type="submit" disabled={loading || !resetCode || !newPassword} style={{ ...btnPrimary, width: "100%", padding: "0.75rem", opacity: loading ? 0.6 : 1, cursor: loading ? "not-allowed" : "pointer", marginBottom: "1rem" }}>
              {loading ? "変更中..." : "パスワードを変更"}
            </button>
          </form>
        )}

        <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {mode === "login" && (
            <button
              onClick={() => { setMode("reset-request"); setError(""); setSuccess(""); }}
              style={{
                background: "none", border: "none", color: "#a89bbe", fontSize: "0.78rem", cursor: "pointer", fontFamily: "inherit",
              }}>
              パスワードを忘れた方
            </button>
          )}
          <button
            onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); setSuccess(""); setResetCode(""); setNewPassword(""); }}
            style={{
              background: "none", border: "none", color: "#c084fc", fontSize: "0.82rem", cursor: "pointer", textDecoration: "underline", fontFamily: "inherit",
            }}
          >
            {mode === "login" || mode === "reset-request" || mode === "reset-confirm" ? "アカウントを新規作成" : "ログインはこちら"}
          </button>
          {(mode === "reset-request" || mode === "reset-confirm") && (
            <button
              onClick={() => { setMode("login"); setError(""); setSuccess(""); }}
              style={{
                background: "none", border: "none", color: "#a89bbe", fontSize: "0.78rem", cursor: "pointer", fontFamily: "inherit",
              }}
            >
              ログインに戻る
            </button>
          )}
        </div>

        {error && (
          <p style={{ fontSize: "0.82rem", color: "#ef4444", marginTop: "0.75rem", textAlign: "center" }}>
            {error}
          </p>
        )}
        {success && (
          <p style={{ fontSize: "0.82rem", color: "#86efac", marginTop: "0.75rem", textAlign: "center" }}>
            {success}
          </p>
        )}
      </div>
    </div>
  );
}

// --- Main Component ---
export default function Home() {
  const [authChecked, setAuthChecked] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [apiConfigured, setApiConfigured] = useState(false);
  const [userEmail, setUserEmail] = useState("");

  const [activeTab, setActiveTab] = useState<TabKey>("dashboard");
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);

  const handleUnauth = useCallback(() => setAuthenticated(false), []);

  const [drafts, setDrafts, draftsLoaded] = useServerData<DraftPost[]>("drafts", [], authenticated, handleUnauth);
  const [postTypes, setPostTypes] = useServerData<PostType[]>("postTypes", [], authenticated, handleUnauth);
  const [scheduleEntries, setScheduleEntries] = useServerData<ScheduleEntry[]>("scheduleEntries", [], authenticated, handleUnauth);

  // Check auth on mount
  useEffect(() => {
    fetch("/api/auth/check")
      .then((r) => r.json())
      .then((d) => {
        setAuthenticated(d.authenticated);
        setApiConfigured(d.apiConfigured);
        setUserEmail(d.email || "");
        setAuthChecked(true);
      })
      .catch(() => setAuthChecked(true));
  }, []);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        setUploadedFiles((prev) => [
          ...prev,
          { name: file.name, size: file.size, content: reader.result as string, uploadedAt: new Date() },
        ]);
      };
      reader.readAsText(file);
    });
    e.target.value = "";
  };

  const removeFile = (index: number) => {
    setUploadedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const addDraft = (draft: DraftPost) => {
    setDrafts((prev) => [draft, ...prev]);
    setActiveTab("review");
  };

  const updateDraftStatus = (id: string, status: DraftPost["status"]) => {
    setDrafts((prev) => prev.map((d) => d.id === id ? { ...d, status } : d));
  };

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setAuthenticated(false);
  };

  const refreshApiConfig = () => {
    fetch("/api/auth/check")
      .then((r) => r.json())
      .then((d) => setApiConfigured(d.apiConfigured))
      .catch(() => {});
  };

  // Loading
  if (!authChecked) {
    return (
      <div style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #1a0533 0%, #2d1b4e 50%, #1a0533 100%)",
        color: "#a89bbe",
        fontSize: "0.9rem",
      }}>
        読み込み中...
      </div>
    );
  }

  // Auth gate
  if (!authenticated) {
    return <AuthScreen onLogin={() => {
      setAuthenticated(true);
      fetch("/api/auth/check")
        .then((r) => r.json())
        .then((d) => {
          setApiConfigured(d.apiConfigured);
          setUserEmail(d.email || "");
        })
        .catch(() => {});
    }} />;
  }

  const tabs: { key: TabKey; label: string }[] = [
    { key: "dashboard", label: "ダッシュボード" },
    { key: "files", label: "ファイル管理" },
    { key: "analytics", label: "投稿分析" },
    { key: "schedule", label: "投稿スケジュール" },
    { key: "recent", label: "最近の投稿" },
    { key: "review", label: "投稿確認" },
    { key: "settings", label: "設定" },
  ];

  return (
    <div style={{ minHeight: "100vh", display: "flex" }}>
      {/* Sidebar */}
      <aside style={{
        width: 220,
        background: "rgba(45, 27, 78, 0.97)",
        color: "#e9d5ff",
        padding: "1.5rem 0",
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
        minHeight: "100vh",
      }}>
        <div style={{ padding: "0 1.25rem", marginBottom: "2rem" }}>
          <h1 style={{
            fontSize: "1.05rem",
            fontWeight: 700,
            background: "linear-gradient(135deg, #c084fc, #fde68a)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            marginBottom: "0.2rem",
            lineHeight: 1.4,
          }}>
            Threads占い
            <br />
            自動投稿AI
          </h1>
          <p style={{ fontSize: "0.68rem", color: "#a89bbe", marginTop: "0.3rem" }}>
            スピリチュアル特化の自動投稿ツール
          </p>
        </div>

        <nav style={{ display: "flex", flexDirection: "column", gap: "0.15rem", padding: "0 0.6rem" }}>
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                background: activeTab === tab.key ? "rgba(168, 85, 247, 0.2)" : "transparent",
                border: "none",
                borderRadius: 8,
                padding: "0.55rem 0.7rem",
                color: activeTab === tab.key ? "#e9d5ff" : "#a89bbe",
                fontSize: "0.82rem",
                fontWeight: activeTab === tab.key ? 600 : 400,
                cursor: "pointer",
                textAlign: "left",
                fontFamily: "inherit",
                transition: "all 0.15s",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
              }}
            >
              {tab.label}
              {tab.key === "review" && drafts.filter((d) => d.status === "pending").length > 0 && (
                <span style={{
                  background: "#ef4444",
                  color: "#fff",
                  fontSize: "0.6rem",
                  fontWeight: 700,
                  padding: "0.1rem 0.4rem",
                  borderRadius: 10,
                  marginLeft: "auto",
                }}>
                  {drafts.filter((d) => d.status === "pending").length}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div style={{ marginTop: "auto", padding: "0 1rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <div style={{
            padding: "0.65rem",
            borderRadius: 8,
            background: apiConfigured ? "rgba(34, 197, 94, 0.12)" : "rgba(168, 85, 247, 0.12)",
            fontSize: "0.7rem",
            color: apiConfigured ? "#86efac" : "#c4b5d9",
            lineHeight: 1.5,
          }}>
            {userEmail && <div style={{ marginBottom: "0.3rem", fontWeight: 500 }}>{userEmail}</div>}
            {apiConfigured ? "API接続済み" : "API未設定"}
            <br />
            {apiConfigured ? "投稿の生成・公開が可能です" : "設定からAPIキーを登録してください"}
          </div>
          <button
            onClick={handleLogout}
            style={{
              background: "rgba(220, 38, 38, 0.1)",
              border: "1px solid rgba(220, 38, 38, 0.2)",
              borderRadius: 8,
              padding: "0.5rem",
              color: "#fca5a5",
              fontSize: "0.75rem",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            ログアウト
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main style={{ flex: 1, padding: "2rem", overflowY: "auto", maxHeight: "100vh" }}>
        {activeTab === "dashboard" && (
          <DashboardTab drafts={drafts} isApiConfigured={apiConfigured} onNavigate={setActiveTab} />
        )}
        {activeTab === "files" && (
          <FilesTab files={uploadedFiles} onUpload={handleFileUpload} onRemove={removeFile} />
        )}
        {activeTab === "analytics" && (
          <AnalyticsTab postTypes={postTypes} setPostTypes={setPostTypes} onNavigate={setActiveTab} isApiConfigured={apiConfigured} onUnauth={handleUnauth} />
        )}
        {activeTab === "schedule" && (
          <ScheduleTab postTypes={postTypes} scheduleEntries={scheduleEntries} setScheduleEntries={setScheduleEntries} onNavigate={setActiveTab} />
        )}
        {activeTab === "recent" && <RecentPostsTab />}
        {activeTab === "review" && (
          <ReviewTab drafts={drafts} uploadedFiles={uploadedFiles} onAddDraft={addDraft} onUpdateStatus={updateDraftStatus} isApiConfigured={apiConfigured} onUnauth={handleUnauth} />
        )}
        {activeTab === "settings" && (
          <SettingsTab onUnauth={handleUnauth} onSaved={refreshApiConfig} />
        )}
      </main>
    </div>
  );
}

// ============================================================
// Dashboard Tab
// ============================================================
function DashboardTab({
  drafts, isApiConfigured, onNavigate,
}: {
  drafts: DraftPost[]; isApiConfigured: boolean; onNavigate: (tab: TabKey) => void;
}) {
  const pendingCount = drafts.filter((d) => d.status === "pending").length;
  const publishedCount = drafts.filter((d) => d.status === "published").length;

  return (
    <div>
      <h2 style={{ fontSize: "1.4rem", fontWeight: 700, marginBottom: "1.5rem" }}>ダッシュボード</h2>
      <div style={{ display: "flex", gap: "1rem", marginBottom: "1.5rem" }}>
        <div style={statBox}>
          <div style={{ fontSize: "1.6rem", fontWeight: 700, color: "var(--purple-700)" }}>{MOCK_POSTS.length + publishedCount}</div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.2rem" }}>総投稿数</div>
        </div>
        <div style={statBox}>
          <div style={{ fontSize: "1.6rem", fontWeight: 700, color: "var(--gold-500)" }}>3.2%</div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.2rem" }}>平均エンゲージメント</div>
        </div>
        <div style={statBox}>
          <div style={{ fontSize: "1.6rem", fontWeight: 700, color: "var(--purple-700)" }}>{MOCK_SCHEDULE.filter((s) => s.status === "scheduled").length}</div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.2rem" }}>予約投稿</div>
        </div>
        <div style={statBox}>
          <div style={{ fontSize: "1.6rem", fontWeight: 700, color: pendingCount > 0 ? "#ef4444" : "var(--gold-500)" }}>{pendingCount}</div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.2rem" }}>確認待ち</div>
        </div>
      </div>
      <div style={{ ...card, marginBottom: "1.5rem" }}>
        <div style={sectionTitle}>クイックアクション</div>
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <button style={btnPrimary} onClick={() => onNavigate("review")}>投稿を作成する</button>
          <button style={btnSecondary} onClick={() => onNavigate("files")}>ファイルを読み込む</button>
          <button style={btnSecondary} onClick={() => onNavigate("analytics")}>分析を見る</button>
          {!isApiConfigured && (
            <button style={{ ...btnSecondary, borderColor: "#ef4444", color: "#ef4444" }} onClick={() => onNavigate("settings")}>
              APIを設定する
            </button>
          )}
        </div>
      </div>
      {pendingCount > 0 && (
        <div style={{ ...card, marginBottom: "1.5rem", borderColor: "rgba(239, 68, 68, 0.3)", background: "rgba(239, 68, 68, 0.04)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: "0.9rem", marginBottom: "0.2rem" }}>{pendingCount}件の投稿が確認待ちです</div>
              <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>公開前に内容を確認してください</div>
            </div>
            <button style={btnPrimary} onClick={() => onNavigate("review")}>確認する</button>
          </div>
        </div>
      )}
      <div style={card}>
        <div style={sectionTitle}>直近のスケジュール</div>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {MOCK_SCHEDULE.slice(0, 3).map((item) => (<ScheduleRow key={item.id} item={item} />))}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Settings Tab
// ============================================================
function SettingsTab({ onUnauth, onSaved }: { onUnauth: () => void; onSaved: () => void }) {
  const [anthropicKey, setAnthropicKey] = useState("");
  const [threadsToken, setThreadsToken] = useState("");
  const [threadsUserId, setThreadsUserId] = useState("");
  const [postTopic, setPostTopic] = useState("");
  const [status, setStatus] = useState({ hasAnthropicKey: false, hasThreadsToken: false, hasThreadsUserId: false });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    authFetch("/api/settings", {}, onUnauth)
      .then((r) => r.json())
      .then((d) => {
        setThreadsUserId(d.threadsUserId || "");
        setPostTopic(d.postTopic || "");
        setStatus({ hasAnthropicKey: d.hasAnthropicKey, hasThreadsToken: d.hasThreadsToken, hasThreadsUserId: d.hasThreadsUserId });
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [onUnauth]);

  const handleSave = async () => {
    setSaving(true);
    setMessage("");
    try {
      const body: Record<string, string> = {};
      if (anthropicKey) body.anthropicApiKey = anthropicKey;
      if (threadsToken) body.threadsAccessToken = threadsToken;
      if (threadsUserId !== undefined) body.threadsUserId = threadsUserId;
      if (postTopic !== undefined) body.postTopic = postTopic;

      await authFetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }, onUnauth);

      setMessage("保存しました");
      setAnthropicKey("");
      setThreadsToken("");
      onSaved();
      // Refresh status
      const res = await authFetch("/api/settings", {}, onUnauth);
      const d = await res.json();
      setStatus({ hasAnthropicKey: d.hasAnthropicKey, hasThreadsToken: d.hasThreadsToken, hasThreadsUserId: d.hasThreadsUserId });
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) return <p style={{ color: "var(--text-muted)" }}>読み込み中...</p>;

  return (
    <div>
      <h2 style={{ fontSize: "1.4rem", fontWeight: 700, marginBottom: "1.5rem" }}>設定</h2>

      <div style={{ ...card, marginBottom: "1.5rem" }}>
        <div style={sectionTitle}>Anthropic API</div>
        <label style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
          <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)", fontWeight: 500 }}>
            APIキー {status.hasAnthropicKey && <span style={{ color: "#16a34a" }}>(設定済み)</span>}
          </span>
          <input
            type="password"
            value={anthropicKey}
            onChange={(e) => setAnthropicKey(e.target.value)}
            placeholder={status.hasAnthropicKey ? "変更する場合のみ入力" : "sk-ant-..."}
            style={inputStyle}
          />
        </label>
      </div>

      <div style={{ ...card, marginBottom: "1.5rem" }}>
        <div style={sectionTitle}>Threads API</div>
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
            <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)", fontWeight: 500 }}>
              アクセストークン {status.hasThreadsToken && <span style={{ color: "#16a34a" }}>(設定済み)</span>}
            </span>
            <input
              type="password"
              value={threadsToken}
              onChange={(e) => setThreadsToken(e.target.value)}
              placeholder={status.hasThreadsToken ? "変更する場合のみ入力" : "IGQVJx..."}
              style={inputStyle}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
            <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)", fontWeight: 500 }}>
              ユーザーID {status.hasThreadsUserId && <span style={{ color: "#16a34a" }}>(設定済み)</span>}
            </span>
            <input
              type="text"
              value={threadsUserId}
              onChange={(e) => setThreadsUserId(e.target.value)}
              placeholder="1234567890"
              style={inputStyle}
            />
          </label>
        </div>
      </div>

      <div style={{ ...card, marginBottom: "1.5rem" }}>
        <div style={sectionTitle}>投稿設定</div>
        <label style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
          <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)", fontWeight: 500 }}>投稿テーマ</span>
          <input
            type="text"
            value={postTopic}
            onChange={(e) => setPostTopic(e.target.value)}
            placeholder="テクノロジーとプログラミングに関する豆知識や tips"
            style={inputStyle}
          />
        </label>
      </div>

      <button style={{ ...btnPrimary, opacity: saving ? 0.6 : 1 }} onClick={handleSave} disabled={saving}>
        {saving ? "保存中..." : "設定を保存"}
      </button>
      {message && (
        <p style={{ fontSize: "0.82rem", color: message === "保存しました" ? "#16a34a" : "#dc2626", marginTop: "0.5rem" }}>
          {message}
        </p>
      )}

      <div style={{ ...card, marginTop: "1.5rem" }}>
        <div style={sectionTitle}>接続ステータス</div>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <StatusRow label="Anthropic API" connected={status.hasAnthropicKey} />
          <StatusRow label="Threads アクセストークン" connected={status.hasThreadsToken} />
          <StatusRow label="Threads ユーザーID" connected={status.hasThreadsUserId} />
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Analytics Tab
// ============================================================
const TYPE_COLORS = ["#7c3aed", "#b8860b", "#059669", "#e11d48", "#2563eb", "#d97706"];

function AnalyticsTab({
  postTypes, setPostTypes, onNavigate, isApiConfigured, onUnauth,
}: {
  postTypes: PostType[]; setPostTypes: (types: PostType[]) => void; onNavigate: (tab: TabKey) => void; isApiConfigured: boolean; onUnauth: () => void;
}) {
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState("");

  const weeklyTrend = [
    { day: "月", engagement: 3.1 }, { day: "火", engagement: 2.8 }, { day: "水", engagement: 4.2 },
    { day: "木", engagement: 3.5 }, { day: "金", engagement: 3.8 }, { day: "土", engagement: 5.1 }, { day: "日", engagement: 4.6 },
  ];
  const maxEng = Math.max(...weeklyTrend.map((d) => d.engagement));

  const handleAnalyze = async () => {
    if (!isApiConfigured) { setError("設定画面からAPIキーを登録してください"); return; }
    setAnalyzing(true);
    setError("");
    try {
      const res = await authFetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ posts: MOCK_POSTS }),
      }, onUnauth);
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      setPostTypes(data.analysis.types);
    } catch (e) {
      setError(e instanceof Error ? e.message : "分析に失敗しました");
    } finally { setAnalyzing(false); }
  };

  return (
    <div>
      <h2 style={{ fontSize: "1.4rem", fontWeight: 700, marginBottom: "1.5rem" }}>投稿分析</h2>
      <div style={{ display: "flex", gap: "1rem", marginBottom: "1.5rem" }}>
        <div style={statBox}><div style={{ fontSize: "1.6rem", fontWeight: 700, color: "var(--purple-700)" }}>{MOCK_POSTS.length}</div><div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.2rem" }}>分析対象の投稿</div></div>
        <div style={statBox}><div style={{ fontSize: "1.6rem", fontWeight: 700, color: "var(--gold-500)" }}>{postTypes.length}</div><div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.2rem" }}>検出タイプ数</div></div>
        <div style={statBox}><div style={{ fontSize: "1.6rem", fontWeight: 700, color: "var(--purple-700)" }}>26</div><div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.2rem" }}>平均いいね数</div></div>
        <div style={statBox}><div style={{ fontSize: "1.6rem", fontWeight: 700, color: "var(--gold-500)" }}>6</div><div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.2rem" }}>平均返信数</div></div>
      </div>

      <div style={{ ...card, marginBottom: "1.5rem" }}>
        <div style={sectionTitle}>AIタイプ分類</div>
        {postTypes.length === 0 ? (
          <div style={{ textAlign: "center", padding: "1.5rem 0" }}>
            <p style={{ fontSize: "0.88rem", marginBottom: "0.5rem" }}>過去の投稿をAIが分析し、投稿タイプ（型）に自動分類します</p>
            <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "1rem" }}>分類結果をもとにスケジュールを組むことができます</p>
            <button style={{ ...btnPrimary, opacity: analyzing ? 0.6 : 1 }} onClick={handleAnalyze} disabled={analyzing}>
              {analyzing ? "分析中..." : "AIで投稿タイプを分析する"}
            </button>
            {error && <p style={{ fontSize: "0.82rem", color: "#dc2626", marginTop: "0.5rem" }}>{error}</p>}
          </div>
        ) : (
          <div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "1rem" }}>
              {postTypes.map((pt, i) => (
                <div key={pt.id} style={{ padding: "1rem", borderRadius: 12, background: "rgba(107, 33, 168, 0.03)", borderLeft: `4px solid ${TYPE_COLORS[i % TYPE_COLORS.length]}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.3rem" }}>
                    <span style={{ fontSize: "0.65rem", fontWeight: 700, padding: "0.15rem 0.5rem", borderRadius: 20, background: `${TYPE_COLORS[i % TYPE_COLORS.length]}18`, color: TYPE_COLORS[i % TYPE_COLORS.length] }}>タイプ{i + 1}</span>
                    <span style={{ fontSize: "0.95rem", fontWeight: 600 }}>{pt.name}</span>
                  </div>
                  <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginBottom: "0.5rem" }}>{pt.description}</p>
                  <div style={{ display: "flex", gap: "1.5rem", fontSize: "0.72rem", color: "var(--text-muted)" }}>
                    <span>平均 {pt.avgLikes} いいね / {pt.avgReplies} 返信</span>
                    <span>推奨頻度: {pt.recommendedFrequency}</span>
                    <span>推奨時間: {pt.bestTime}</span>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: "0.75rem" }}>
              <button style={btnPrimary} onClick={() => onNavigate("schedule")}>この分類でスケジュールを組む</button>
              <button style={btnSecondary} onClick={handleAnalyze} disabled={analyzing}>{analyzing ? "再分析中..." : "再分析する"}</button>
            </div>
          </div>
        )}
      </div>

      <div style={{ ...card, marginBottom: "1.5rem" }}>
        <div style={sectionTitle}>週間エンゲージメント推移</div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: "0.75rem", height: 140, padding: "0 0.5rem" }}>
          {weeklyTrend.map((d) => (
            <div key={d.day} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "0.3rem" }}>
              <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", fontWeight: 500 }}>{d.engagement}%</div>
              <div style={{ width: "100%", height: `${(d.engagement / maxEng) * 90}px`, borderRadius: "6px 6px 2px 2px", background: "linear-gradient(to top, var(--purple-700), var(--purple-400))", minHeight: 8 }} />
              <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", fontWeight: 500 }}>{d.day}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={card}>
        <div style={sectionTitle}>反応が良かった投稿</div>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {[...MOCK_POSTS].sort((a, b) => b.likes - a.likes).slice(0, 3).map((post, i) => (
            <div key={i} style={{ padding: "0.75rem", borderRadius: 10, background: "rgba(107, 33, 168, 0.03)", borderLeft: i === 0 ? "3px solid var(--gold-500)" : "3px solid var(--purple-400)" }}>
              <p style={{ fontSize: "0.82rem", lineHeight: 1.5, marginBottom: "0.4rem" }}>{post.text}</p>
              <div style={{ display: "flex", gap: "1rem", fontSize: "0.72rem", color: "var(--text-muted)" }}>
                <span>{post.date}</span><span>{post.likes} いいね</span><span>{post.replies} 返信</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Schedule Tab
// ============================================================
const DAYS_OF_WEEK = ["月曜日", "火曜日", "水曜日", "木曜日", "金曜日", "土曜日", "日曜日"];
const TIME_OPTIONS = ["07:00", "08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00", "20:00", "21:00"];

function ScheduleTab({
  postTypes, scheduleEntries, setScheduleEntries, onNavigate,
}: {
  postTypes: PostType[]; scheduleEntries: ScheduleEntry[]; setScheduleEntries: (entries: ScheduleEntry[]) => void; onNavigate: (tab: TabKey) => void;
}) {
  const [selectedDay, setSelectedDay] = useState(DAYS_OF_WEEK[0]);
  const [selectedTime, setSelectedTime] = useState("09:00");
  const [selectedTypeId, setSelectedTypeId] = useState("");

  const handleAddEntry = () => {
    if (!selectedTypeId) return;
    const pt = postTypes.find((t) => t.id === selectedTypeId);
    if (!pt) return;
    setScheduleEntries([...scheduleEntries, { id: Date.now().toString(), dayOfWeek: selectedDay, time: selectedTime, postTypeId: pt.id, postTypeName: pt.name }]);
  };

  const handleRemoveEntry = (id: string) => { setScheduleEntries(scheduleEntries.filter((e) => e.id !== id)); };

  const handleAutoFill = () => {
    const entries: ScheduleEntry[] = [];
    postTypes.forEach((pt, i) => {
      const freq = pt.recommendedFrequency;
      let days: string[] = [];
      if (freq === "毎日") days = DAYS_OF_WEEK;
      else if (freq === "週3回") days = ["月曜日", "水曜日", "金曜日"];
      else if (freq === "週2回") days = ["火曜日", "土曜日"];
      else days = ["土曜日"];
      days.forEach((day) => { entries.push({ id: `auto_${i}_${day}`, dayOfWeek: day, time: pt.bestTime || "09:00", postTypeId: pt.id, postTypeName: pt.name }); });
    });
    setScheduleEntries(entries);
  };

  const entriesByDay: Record<string, ScheduleEntry[]> = {};
  DAYS_OF_WEEK.forEach((day) => { entriesByDay[day] = []; });
  scheduleEntries.forEach((e) => { if (entriesByDay[e.dayOfWeek]) entriesByDay[e.dayOfWeek].push(e); });

  return (
    <div>
      <h2 style={{ fontSize: "1.4rem", fontWeight: 700, marginBottom: "1.5rem" }}>投稿スケジュール</h2>
      {postTypes.length === 0 ? (
        <div style={{ ...card, textAlign: "center", padding: "3rem 1.5rem" }}>
          <p style={{ fontSize: "0.9rem", marginBottom: "0.5rem" }}>スケジュールを組むには、まず投稿タイプの分析が必要です</p>
          <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginBottom: "1rem" }}>投稿分析タブでAI分析を実行してください</p>
          <button style={btnPrimary} onClick={() => onNavigate("analytics")}>投稿分析へ移動</button>
        </div>
      ) : (
        <>
          <div style={{ ...card, marginBottom: "1.5rem" }}>
            <div style={sectionTitle}>スケジュールを追加</div>
            <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginBottom: "1rem" }}>どの投稿タイプを、いつ投稿しますか？</p>
            <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-end", flexWrap: "wrap" }}>
              <label style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>曜日</span>
                <select value={selectedDay} onChange={(e) => setSelectedDay(e.target.value)} style={{ ...inputStyle, width: 120 }}>{DAYS_OF_WEEK.map((d) => <option key={d} value={d}>{d}</option>)}</select>
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>時間</span>
                <select value={selectedTime} onChange={(e) => setSelectedTime(e.target.value)} style={{ ...inputStyle, width: 100 }}>{TIME_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}</select>
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: "0.3rem", flex: 1 }}>
                <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>投稿タイプ</span>
                <select value={selectedTypeId} onChange={(e) => setSelectedTypeId(e.target.value)} style={inputStyle}>
                  <option value="">タイプを選択...</option>
                  {postTypes.map((pt) => (<option key={pt.id} value={pt.id}>{pt.name} ({pt.recommendedFrequency}推奨)</option>))}
                </select>
              </label>
              <button style={btnPrimary} onClick={handleAddEntry} disabled={!selectedTypeId}>追加</button>
            </div>
            <div style={{ marginTop: "0.75rem" }}><button style={btnSecondary} onClick={handleAutoFill}>AIの推奨で自動設定</button></div>
          </div>

          <div style={card}>
            <div style={sectionTitle}>週間スケジュール <span style={{ background: "rgba(168, 85, 247, 0.12)", color: "var(--purple-600)", fontSize: "0.7rem", padding: "0.1rem 0.5rem", borderRadius: 20 }}>{scheduleEntries.length}件</span></div>
            {scheduleEntries.length === 0 ? (
              <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", textAlign: "center", padding: "2rem 0" }}>上のフォームからスケジュールを追加するか、「AIの推奨で自動設定」を押してください</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {DAYS_OF_WEEK.map((day) => {
                  const dayEntries = entriesByDay[day];
                  if (dayEntries.length === 0) return null;
                  return (
                    <div key={day}>
                      <div style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "0.35rem" }}>{day}</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem", paddingLeft: "0.5rem" }}>
                        {dayEntries.sort((a, b) => a.time.localeCompare(b.time)).map((entry) => {
                          const typeIndex = postTypes.findIndex((t) => t.id === entry.postTypeId);
                          const color = TYPE_COLORS[typeIndex % TYPE_COLORS.length] || "var(--purple-500)";
                          return (
                            <div key={entry.id} style={{ display: "flex", alignItems: "center", gap: "0.6rem", padding: "0.5rem 0.65rem", borderRadius: 8, background: "rgba(107, 33, 168, 0.03)" }}>
                              <span style={{ fontSize: "0.82rem", fontWeight: 500, color: "var(--text-muted)", width: 42 }}>{entry.time}</span>
                              <div style={{ width: 4, height: 20, borderRadius: 2, background: color }} />
                              <span style={{ fontSize: "0.82rem", flex: 1 }}>{entry.postTypeName}</span>
                              <button onClick={() => handleRemoveEntry(entry.id)} style={{ background: "none", border: "none", fontSize: "0.72rem", color: "var(--text-muted)", cursor: "pointer", padding: "0.2rem 0.4rem" }}>x</button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================
// Recent Posts Tab
// ============================================================
function RecentPostsTab() {
  return (
    <div>
      <h2 style={{ fontSize: "1.4rem", fontWeight: 700, marginBottom: "1.5rem" }}>最近の投稿</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        {MOCK_POSTS.map((post, i) => (
          <div key={i} style={card}>
            <p style={{ fontSize: "0.9rem", lineHeight: 1.7, marginBottom: "0.75rem", whiteSpace: "pre-wrap" }}>{post.text}</p>
            <div style={{ display: "flex", gap: "1.5rem", fontSize: "0.78rem", color: "var(--text-muted)", borderTop: "1px solid var(--card-border)", paddingTop: "0.6rem" }}>
              <span>{post.date}</span><span>{post.likes} いいね</span><span>{post.replies} 返信</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// Review Tab
// ============================================================
function ReviewTab({
  drafts, uploadedFiles, onAddDraft, onUpdateStatus, isApiConfigured, onUnauth,
}: {
  drafts: DraftPost[]; uploadedFiles: UploadedFile[]; onAddDraft: (draft: DraftPost) => void; onUpdateStatus: (id: string, status: DraftPost["status"]) => void; isApiConfigured: boolean; onUnauth: () => void;
}) {
  const [topic, setTopic] = useState("");
  const [generating, setGenerating] = useState(false);
  const [publishing, setPublishing] = useState<string | null>(null);
  const [error, setError] = useState("");

  const handleGenerate = async () => {
    if (!isApiConfigured) { setError("設定画面からAPIキーを登録してください"); return; }
    if (!topic.trim()) { setError("投稿テーマを入力してください"); return; }
    setGenerating(true); setError("");
    const fileContents = uploadedFiles.map((f) => `--- ${f.name} ---\n${f.content}`).join("\n\n");
    try {
      const res = await authFetch("/api/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ topic, referenceData: fileContents || undefined }) }, onUnauth);
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      onAddDraft({ id: Date.now().toString(), text: data.text, topic, createdAt: new Date(), status: "pending" });
      setTopic("");
    } catch (e) { setError(e instanceof Error ? e.message : "生成に失敗しました"); }
    finally { setGenerating(false); }
  };

  const handlePublish = async (draft: DraftPost) => {
    if (!isApiConfigured) { setError("設定画面からAPIキーを登録してください"); return; }
    setPublishing(draft.id); setError("");
    try {
      const res = await authFetch("/api/publish", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: draft.text }) }, onUnauth);
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      onUpdateStatus(draft.id, "published");
    } catch (e) { setError(e instanceof Error ? e.message : "公開に失敗しました"); }
    finally { setPublishing(null); }
  };

  const pendingDrafts = drafts.filter((d) => d.status === "pending");
  const otherDrafts = drafts.filter((d) => d.status !== "pending");

  return (
    <div>
      <h2 style={{ fontSize: "1.4rem", fontWeight: 700, marginBottom: "1.5rem" }}>投稿確認</h2>
      <div style={{ ...card, marginBottom: "1.5rem" }}>
        <div style={sectionTitle}>投稿を生成</div>
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-end" }}>
          <label style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.3rem" }}>
            <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>投稿テーマ</span>
            <input type="text" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="例: 今日の星座占い、タロットメッセージ..." style={inputStyle} onKeyDown={(e) => { if (e.key === "Enter") handleGenerate(); }} />
          </label>
          <button style={{ ...btnPrimary, opacity: generating ? 0.6 : 1 }} onClick={handleGenerate} disabled={generating}>
            {generating ? "生成中..." : "AIで生成"}
          </button>
        </div>
        {uploadedFiles.length > 0 && <p style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "0.5rem" }}>読み込み済みファイル {uploadedFiles.length}件 を参考データとして使用します</p>}
        {error && <p style={{ fontSize: "0.82rem", color: "#dc2626", marginTop: "0.5rem" }}>{error}</p>}
      </div>

      {pendingDrafts.length > 0 && (
        <div style={{ ...card, marginBottom: "1.5rem" }}>
          <div style={sectionTitle}>確認待ち ({pendingDrafts.length}件)</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {pendingDrafts.map((draft) => (
              <div key={draft.id} style={{ padding: "1rem", borderRadius: 12, background: "rgba(107, 33, 168, 0.03)", border: "1px solid rgba(107, 33, 168, 0.1)" }}>
                <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginBottom: "0.5rem" }}>テーマ: {draft.topic} ・ {new Date(draft.createdAt).toLocaleString("ja-JP")}</div>
                <p style={{ fontSize: "0.88rem", lineHeight: 1.7, whiteSpace: "pre-wrap", marginBottom: "0.75rem", padding: "0.75rem", background: "rgba(255, 255, 255, 0.6)", borderRadius: 8 }}>{draft.text}</p>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button style={{ ...btnPrimary, opacity: publishing === draft.id ? 0.6 : 1 }} onClick={() => handlePublish(draft)} disabled={publishing === draft.id || !isApiConfigured}>
                    {publishing === draft.id ? "公開中..." : "承認して公開"}
                  </button>
                  <button style={{ ...btnSecondary, borderColor: "rgba(220, 38, 38, 0.3)", color: "#dc2626" }} onClick={() => onUpdateStatus(draft.id, "rejected")}>却下</button>
                </div>
                {!isApiConfigured && <p style={{ fontSize: "0.72rem", color: "#ef4444", marginTop: "0.4rem" }}>公開するには設定画面からAPIキーを登録してください</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {otherDrafts.length > 0 && (
        <div style={card}>
          <div style={sectionTitle}>処理済み</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {otherDrafts.map((draft) => (
              <div key={draft.id} style={{ padding: "0.65rem 0.75rem", borderRadius: 8, background: "rgba(107, 33, 168, 0.02)", display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <span style={{ fontSize: "0.68rem", fontWeight: 500, padding: "0.15rem 0.5rem", borderRadius: 20, background: draft.status === "published" ? "rgba(34, 197, 94, 0.1)" : "rgba(220, 38, 38, 0.08)", color: draft.status === "published" ? "#16a34a" : "#dc2626" }}>
                  {draft.status === "published" ? "公開済み" : "却下"}
                </span>
                <span style={{ fontSize: "0.82rem", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{draft.topic}</span>
                <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", flexShrink: 0 }}>{new Date(draft.createdAt).toLocaleString("ja-JP")}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {drafts.length === 0 && (
        <div style={{ ...card, textAlign: "center", padding: "3rem 1.5rem" }}>
          <p style={{ fontSize: "0.9rem", color: "var(--text-muted)", marginBottom: "0.5rem" }}>まだ投稿がありません</p>
          <p style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>上のフォームからテーマを入力してAIで投稿を生成してください</p>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Files Tab
// ============================================================
function FilesTab({ files, onUpload, onRemove }: { files: UploadedFile[]; onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void; onRemove: (i: number) => void; }) {
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  return (
    <div>
      <h2 style={{ fontSize: "1.4rem", fontWeight: 700, marginBottom: "1.5rem" }}>ファイル管理</h2>
      <div style={{ ...card, marginBottom: "1.5rem" }}>
        <div style={sectionTitle}>参考データの読み込み</div>
        <label style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "0.75rem", padding: "2rem", borderRadius: 12, border: "2px dashed rgba(107, 33, 168, 0.2)", background: "rgba(250, 248, 255, 0.5)", cursor: "pointer" }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: "linear-gradient(135deg, var(--purple-100), var(--gold-200))", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.5rem", color: "var(--purple-700)" }}>+</div>
          <div style={{ textAlign: "center" }}>
            <p style={{ fontSize: "0.9rem", fontWeight: 500 }}>ファイルをクリックして選択</p>
            <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>CSV, HTML, TXT, JSON, TSV, XML に対応</p>
          </div>
          <input type="file" accept=".csv,.html,.htm,.txt,.json,.tsv,.xml" multiple onChange={onUpload} style={{ display: "none" }} />
        </label>
      </div>
      <div style={card}>
        <div style={sectionTitle}>読み込み済みファイル <span style={{ background: "rgba(168, 85, 247, 0.12)", color: "var(--purple-600)", fontSize: "0.7rem", padding: "0.1rem 0.5rem", borderRadius: 20 }}>{files.length}</span></div>
        {files.length === 0 ? (
          <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", textAlign: "center", padding: "2rem 0" }}>まだファイルが読み込まれていません</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {files.map((file, i) => (
              <div key={i}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.75rem", borderRadius: 10, background: previewIndex === i ? "rgba(107, 33, 168, 0.08)" : "rgba(107, 33, 168, 0.03)", cursor: "pointer" }} onClick={() => setPreviewIndex(previewIndex === i ? null : i)}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: "linear-gradient(135deg, var(--purple-200), var(--purple-100))", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.65rem", fontWeight: 700, color: "var(--purple-700)", flexShrink: 0 }}>
                    {file.name.split(".").pop()?.toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "0.85rem", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.name}</div>
                    <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>{formatFileSize(file.size)} ・ {file.uploadedAt.toLocaleString("ja-JP")}</div>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); onRemove(i); }} style={{ background: "rgba(220, 38, 38, 0.08)", border: "none", borderRadius: 6, padding: "0.3rem 0.5rem", fontSize: "0.72rem", color: "#dc2626", cursor: "pointer", flexShrink: 0 }}>削除</button>
                </div>
                {previewIndex === i && (
                  <div style={{ margin: "0.25rem 0 0 0", padding: "0.75rem", borderRadius: "0 0 10px 10px", background: "rgba(45, 27, 78, 0.03)", border: "1px solid var(--card-border)", maxHeight: 200, overflowY: "auto" }}>
                    <pre style={{ fontSize: "0.75rem", lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-all", fontFamily: "'SF Mono', 'Consolas', monospace" }}>
                      {file.content.slice(0, 2000)}{file.content.length > 2000 && "\n\n... (省略)"}
                    </pre>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Shared Components
// ============================================================
function ScheduleRow({ item }: { item: ScheduleItem }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.65rem 0.75rem", borderRadius: 10, background: item.status === "scheduled" ? "rgba(107, 33, 168, 0.04)" : "rgba(184, 134, 11, 0.04)" }}>
      <div style={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0, background: item.status === "scheduled" ? "var(--purple-500)" : item.status === "posted" ? "var(--gold-500)" : "#ef4444" }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: "0.82rem", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.topic}</div>
        <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>{item.scheduledAt}</div>
      </div>
      <span style={{ fontSize: "0.68rem", fontWeight: 500, padding: "0.15rem 0.5rem", borderRadius: 20, flexShrink: 0, background: item.status === "scheduled" ? "rgba(168, 85, 247, 0.12)" : "rgba(184, 134, 11, 0.12)", color: item.status === "scheduled" ? "var(--purple-600)" : "var(--gold-600)" }}>
        {item.status === "scheduled" ? "予定" : "投稿済"}
      </span>
    </div>
  );
}

function StatusRow({ label, connected }: { label: string; connected: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.6rem 0.75rem", borderRadius: 8, background: "rgba(107, 33, 168, 0.03)" }}>
      <span style={{ fontSize: "0.85rem" }}>{label}</span>
      <span style={{ fontSize: "0.72rem", fontWeight: 500, padding: "0.15rem 0.6rem", borderRadius: 20, background: connected ? "rgba(34, 197, 94, 0.1)" : "rgba(220, 38, 38, 0.08)", color: connected ? "#16a34a" : "#dc2626" }}>
        {connected ? "接続済み" : "未接続"}
      </span>
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
