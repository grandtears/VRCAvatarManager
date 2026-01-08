import { useEffect, useMemo, useState } from "react";
import "./App.css";
import "./index.css";
import type {
  Avatar,
  AvatarBaseMap,
  AvatarFavMap,
  AvatarTagMap,
  BodyBase,
  FavFolder,
  State,
  TwoFAMethod,
} from "./types";
import {
  fetchSettings, // Imported
  loadBodyBases, // kept for backward compat if needed by other files, but unused in App
  saveBodyBases,
  saveAvatarBaseMap,
  saveFavFolders,
  saveAvatarFavMap,
  saveAvatarTags,
  saveConfirmAvatarChange,
} from "./storage";
import { uid, normalizeRank, getPerfRank, rankBadge } from "./utils";
import { SettingsModal } from "./components/SettingsModal";
import { BaseItem } from "./components/BaseItem";

const API = (window as any).VAM_API_URL || "http://localhost:8787";

export default function App() {
  const [state, setState] = useState<State>("boot");

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const [methods, setMethods] = useState<TwoFAMethod[]>([]);
  const [method, setMethod] = useState<TwoFAMethod>("totp");
  const [code, setCode] = useState("");

  const [displayName, setDisplayName] = useState("");
  const [avatars, setAvatars] = useState<Avatar[]>([]);
  const [error, setError] = useState("");

  const canPickEmail = useMemo(() => methods.includes("emailOtp"), [methods]);
  const canPickTotp = useMemo(() => methods.includes("totp"), [methods]);

  const [offset, setOffset] = useState(0);
  const [loadingProgress, setLoadingProgress] = useState("");
  const [isLoadingAll, setIsLoadingAll] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const pageSize = 100;

  const [totalAvatars, setTotalAvatars] = useState<number | null>(null);

  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"list" | "search">("list");

  const [searchOffset, setSearchOffset] = useState(0);
  const [searchHasMore, setSearchHasMore] = useState(false);
  const [searchTotal, setSearchTotal] = useState<number | null>(null);
  const [searchResults, setSearchResults] = useState<Avatar[]>([]);

  const [showSettings, setShowSettings] = useState(false);

  // Initialize with empty/defaults to avoid blocking render
  const [bodyBases, setBodyBases] = useState<BodyBase[]>([]);
  const [avatarBaseMap, setAvatarBaseMap] = useState<AvatarBaseMap>({});
  const [onlyMobile, setOnlyMobile] = useState(false);
  const [filterBaseId, setFilterBaseId] = useState<string>("");
  const [confirmAvatarChange, setConfirmAvatarChange] = useState<boolean>(false);
  const [sort, setSort] = useState("updated");
  const [order, setOrder] = useState("descending");
  const [favFolders, setFavFolders] = useState<FavFolder[]>([]);
  const [avatarFavMap, setAvatarFavMap] = useState<AvatarFavMap>({});
  const [filterFavId, setFilterFavId] = useState<string>("");
  const [avatarTags, setAvatarTags] = useState<AvatarTagMap>({});

  // Load settings on mount
  useEffect(() => {
    fetchSettings().then((s) => {
      setBodyBases(s.bodyBases);
      setAvatarBaseMap(s.avatarBaseMap);
      setFavFolders(s.favFolders);
      setAvatarFavMap(s.avatarFavMap);
      setAvatarTags(s.avatarTags);
      setConfirmAvatarChange(s.confirmAvatarChange);
    });
  }, []);

  /* サイドバー開閉 */
  const [isBodyExpanded, setIsBodyExpanded] = useState(false);
  const [isFavExpanded, setIsFavExpanded] = useState(false);

  const shownAvatars = mode === "search" ? searchResults : avatars;
  const shownHasMore = mode === "search" ? searchHasMore : hasMore;

  const filteredAvatars = useMemo(() => {
    let list = shownAvatars;

    // ① 素体フィルタ
    if (filterBaseId) {
      if (filterBaseId === "__none__") {
        list = list.filter((a) => !avatarBaseMap[a.id]);
      } else {
        list = list.filter((a) => avatarBaseMap[a.id] === filterBaseId);
      }
    }

    // ② モバイル対応（Android / iOS = android）
    if (onlyMobile) {
      list = list.filter((a) =>
        (a.platforms ?? []).includes("android")
      );
    }

    // ③ お気に入りフィルタ
    if (filterFavId) {
      if (filterFavId === "__none__") {
        list = list.filter((a) => !avatarFavMap[a.id]);
      } else {
        list = list.filter((a) => avatarFavMap[a.id] === filterFavId);
      }
    }

    // ④ 検索（アバター名 or 素体名 or お気に入り名）
    const q = query.trim();
    if (!q) return list;

    const qNorm = q.normalize("NFKC").toLowerCase();

    return list.filter((a) => {
      const avatarName = (a.name ?? "").normalize("NFKC").toLowerCase();

      const baseId = avatarBaseMap[a.id];
      const baseName = baseId
        ? bodyBases.find((b) => b.id === baseId)?.name ?? ""
        : "";
      const baseNameNorm = baseName.normalize("NFKC").toLowerCase();

      const favId = avatarFavMap[a.id];
      const favName = favId
        ? favFolders.find((f) => f.id === favId)?.name ?? ""
        : "";
      const favNameNorm = favName.normalize("NFKC").toLowerCase();

      // タグ検索
      const tags = avatarTags[a.id] || [];
      const tagsHit = tags.some((t) =>
        t.normalize("NFKC").toLowerCase().includes(qNorm)
      );

      return (
        avatarName.includes(qNorm) ||
        baseNameNorm.includes(qNorm) ||
        favNameNorm.includes(qNorm) ||
        tagsHit
      );
    });
  }, [
    shownAvatars,
    filterBaseId,
    avatarBaseMap,
    onlyMobile,
    query,
    bodyBases,
    filterFavId,
    favFolders,
    avatarFavMap,
    avatarTags,
  ]);
  const baseCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    let none = 0;

    for (const a of shownAvatars) {
      const bid = avatarBaseMap[a.id];
      if (!bid) none++;
      else counts[bid] = (counts[bid] ?? 0) + 1;
    }

    return { all: shownAvatars.length, none, byId: counts };
  }, [shownAvatars, avatarBaseMap]);

  const favCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    let none = 0;

    for (const a of shownAvatars) {
      const fid = avatarFavMap[a.id];
      if (!fid) none++;
      else counts[fid] = (counts[fid] ?? 0) + 1;
    }

    return { all: shownAvatars.length, none, byId: counts };
  }, [shownAvatars, avatarFavMap]);

  async function doLogin() {
    setError("");
    setAvatars([]);
    setDisplayName("");

    try {
      const r = await fetch(`${API}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username, password }),
      });

      const j = await r.json().catch(() => null);

      if (!j?.ok) {
        setError("ログインに失敗（ID/Pass/サーバ未起動）");
        return;
      }

      if (j.state === "2fa_required") {
        const m = (Array.isArray(j.methods) ? j.methods : []) as TwoFAMethod[];
        setMethods(m);
        setMethod(m.includes("totp") ? "totp" : "emailOtp");
        setState("2fa_required");
        return;
      }

      setDisplayName(j.displayName || "");
      setState("logged_in");
    } catch {
      setError("APIに接続できません（localhost:8787）");
    }
  }

  async function do2fa() {
    setError("");
    setLoadingProgress("認証中...");

    try {
      const r = await fetch(`${API}/auth/2fa`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ method, code }),
      });

      const j = await r.json().catch(() => null);

      if (!j?.ok) {
        const backendMsg = j?.body?.error?.message || JSON.stringify(j?.body) || "Unknown error";
        setError(`2FA失敗: ${backendMsg}`);
        return;
      }

      setDisplayName(j.displayName || "");
      setState("logged_in");
    } catch (e) {
      setError("2FA送信に失敗しました: " + String(e));
    } finally {
      setLoadingProgress("");
    }
  }

  async function fetchAllAvatars(reset = false) {
    if (isLoadingAll && !reset) return; // Prevent double trigger
    setError("");
    setIsLoadingAll(true);

    try {
      let currentOffset = reset ? 0 : offset;
      if (reset) {
        setAvatars([]);
        setOffset(0);
        setTotalAvatars(null);
      }

      while (true) {
        setLoadingProgress(`${currentOffset} 件取得中...`);

        const r = await fetch(
          `${API}/avatars?n=${pageSize}&offset=${currentOffset}&sort=${sort}&order=${order}`,
          { credentials: "include" }
        );
        const j = await r.json().catch(() => null);

        if (!j?.ok) {
          setError("アバター取得に失敗（未ログイン/セッション切れ）");
          break;
        }

        if (typeof j.total === "number") {
          setTotalAvatars(j.total);
        }

        const newItems: Avatar[] = j.avatars || [];
        const serverHasMore = !!j.hasMore;

        if (reset && currentOffset === 0) {
          setAvatars(newItems);
        } else {
          setAvatars((prev) => [...prev, ...newItems]);
        }

        currentOffset += newItems.length;
        setOffset(currentOffset);

        if (!serverHasMore || newItems.length === 0) {
          break;
        }

        // Rate limit prevention (simple delay)
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    } catch (e) {
      setError("アバター取得APIに接続できません");
    } finally {
      setIsLoadingAll(false);
      setLoadingProgress("");
      setHasMore(false); // All loaded
    }
  }

  async function doLogout() {
    setError("");
    try {
      await fetch(`${API}/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // APIが落ちててもローカル側はログアウト扱いにする
    } finally {
      // ローカル状態を初期化
      setState("idle");
      setDisplayName("");
      setAvatars([]);
      setOffset(0);
      setHasMore(false);
      setTotalAvatars(null);

      setMode("list");
      setQuery("");
      setSearchResults([]);
      setSearchOffset(0);
      setSearchHasMore(false);
      setSearchTotal(null);
    }
  }

  /* 検索関数 */
  async function searchAvatars(reset = false) {
    setError("");

    const q = query.trim();
    if (!q) {
      setError("検索ワードを入力してください");
      return;
    }

    try {
      const nextOffset = reset ? 0 : searchOffset;
      const r = await fetch(
        `${API}/avatars/search?q=${encodeURIComponent(q)}&n=${pageSize}&offset=${nextOffset}`,
        { credentials: "include" }
      );
      const j = await r.json().catch(() => null);

      if (!j?.ok) {
        setError("検索に失敗しました（未ログイン/セッション切れ）");
        return;
      }

      const total = Number(j.totalMatches);
      if (Number.isFinite(total)) setSearchTotal(total);

      const items: Avatar[] = j.avatars || [];
      setSearchHasMore(Boolean(j.hasMore));

      if (reset) {
        setSearchResults(items);
        setSearchOffset(items.length);
      } else {
        setSearchResults((prev) => [...prev, ...items]);
        setSearchOffset(nextOffset + items.length);
      }

      setMode("search");
    } catch {
      setError("検索APIに接続できません");
    }
  }

  /* アバター変更関数 */
  async function selectAvatar(avatarId: string) {
    if (confirmAvatarChange) {
      if (!window.confirm("このアバターに変更しますか？")) return;
    }

    setError("");

    try {
      const r = await fetch(`${API}/avatars/${avatarId}/select`, {
        method: "POST",
        credentials: "include",
      });

      const j = await r.json().catch(() => null);
      if (!j?.ok) {
        setError(`アバター変更に失敗（status=${j?.status ?? r.status}）`);
        return;
      }
    } catch {
      setError("アバター変更APIに接続できません");
    }
  }




  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${API}/auth/me`, { credentials: "include" });
        const j = await r.json().catch(() => null);

        if (j?.ok) {
          setDisplayName(j.displayName || "");
          setState("logged_in");
        } else {
          setState("idle");
        }
      } catch {
        setState("idle");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (state === "logged_in") {
      setOffset(0);
      fetchAllAvatars(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, sort, order]);

  /* 素体情報の永続化 */
  useEffect(() => {
    saveBodyBases(bodyBases);
  }, [bodyBases]);

  /* 素体IDの永続化 */
  useEffect(() => {
    saveAvatarBaseMap(avatarBaseMap);
  }, [avatarBaseMap]);

  /* 確認設定の永続化 */
  useEffect(() => {
    saveConfirmAvatarChange(confirmAvatarChange);
  }, [confirmAvatarChange]);

  /* お気に入り永続化 */
  useEffect(() => {
    saveFavFolders(favFolders);
  }, [favFolders]);
  useEffect(() => {
    saveAvatarFavMap(avatarFavMap);
  }, [avatarFavMap]);

  /* タグ永続化 */
  useEffect(() => {
    saveAvatarTags(avatarTags);
  }, [avatarTags]);

  useEffect(() => {
    const base = bodyBases.find((b) => b.id === filterBaseId);

    const hits = avatars.filter((a) => avatarBaseMap[a.id] === filterBaseId).length;
  }, [filterBaseId, bodyBases, avatars, avatarBaseMap]);

  /* バックアップ機能 */
  function exportBackup() {
    const data = {
      version: 1,
      exportedAt: new Date().toISOString(),
      bodyBases,
      avatarBaseMap,
      favFolders,
      avatarFavMap,
      avatarTags,
      settings: {
        confirmAvatarChange,
      },
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vam-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importBackup(file: File) {
    try {
      const text = await file.text();
      const json = JSON.parse(text);

      if (!json || typeof json !== "object") throw new Error("Invalid JSON");

      if (window.confirm("現在のデータを上書きしてインポートしますか？\n(元に戻すことはできません)")) {
        if (Array.isArray(json.bodyBases)) setBodyBases(json.bodyBases);
        if (typeof json.avatarBaseMap === "object") setAvatarBaseMap(json.avatarBaseMap);
        if (Array.isArray(json.favFolders)) setFavFolders(json.favFolders);
        if (typeof json.avatarFavMap === "object") setAvatarFavMap(json.avatarFavMap);
        if (typeof json.avatarTags === "object") setAvatarTags(json.avatarTags);
        if (json.settings?.confirmAvatarChange !== undefined) {
          setConfirmAvatarChange(!!json.settings.confirmAvatarChange);
        }
        alert("インポートが完了しました");
      }
    } catch (e) {
      alert("インポートに失敗しました: " + e);
    }
  }

  return (
    <div>
      <header className="app-header">
        <h1 className="app-title">VRC Avatar Manager</h1>
        <div style={{ display: "flex", gap: 8 }}>
          {state === "logged_in" && (
            <button
              onClick={doLogout}
              className="btn btn-danger btn-sm"
            >
              🚪 ログアウト
            </button>
          )}
          <button className="btn btn-secondary btn-sm" onClick={() => setShowSettings(true)}>⚙ 設定</button>
        </div>
      </header>

      {error && (
        <div
          style={{
            padding: 12,
            marginBottom: 12,
            border: "1px solid #f99",
            background: "#fee",
          }}
        >
          {error}
        </div>
      )}

      {state === "boot" && <div style={{ opacity: 0.7 }}>起動中…</div>}

      {state === "idle" && (
        <div className="login-container">
          <div className="login-card">
            <h1 style={{ margin: "0 0 10px", color: "#555", fontSize: "1.2rem" }}>VRC Avatar Manager</h1>
            <div className="login-title">ログイン</div>
            <input
              className="login-input"
              placeholder="VRChat Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
            <input
              className="login-input"
              placeholder="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") doLogin();
              }}
            />
            <button className="login-button" onClick={doLogin}>
              ログイン
            </button>

            <div className="security-note">
              🔒 認証情報はVRChatのAPI認証にのみ使用され、外部サーバーには送信されません。
            </div>
          </div>
        </div>
      )}

      {state === "2fa_required" && (
        <div className="login-container">
          <div className="login-card">
            <h2 className="login-title">2段階認証</h2>
            <div style={{ color: "#555", marginBottom: 16 }}>
              認証コードを入力してください。
            </div>

            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
              <span style={{ fontWeight: 600, color: "#666" }}>方式:</span>
              <select
                className="modern-select"
                style={{ flex: 1, padding: "10px" }}
                value={method}
                onChange={(e) => setMethod(e.target.value as TwoFAMethod)}
              >
                <option value="totp" disabled={!canPickTotp}>
                  Authenticator (TOTP)
                </option>
                <option value="emailOtp" disabled={!canPickEmail}>
                  Email OTP
                </option>
              </select>
            </div>

            <input
              className="login-input"
              placeholder="6桁コード"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") do2fa();
              }}
            />

            <button
              className="login-button"
              style={{ marginTop: 16 }}
              onClick={do2fa}
              disabled={loadingProgress !== ""}
            >
              {loadingProgress ? "送信中..." : "送信"}
            </button>
          </div>
        </div>
      )}

      {state === "logged_in" && (
        <div>

          <div className="main-layout">
            <aside className="app-sidebar">
              {/* 素体カテゴリ */}
              <div className="sidebar-section">
                <div
                  className="sidebar-title"
                  onClick={() => setIsBodyExpanded(!isBodyExpanded)}
                >
                  <span>
                    素体カテゴリ <span style={{ fontSize: 12 }}>{isBodyExpanded ? "▼" : "▶"}</span>
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const name = prompt("素体名を入力（例：マヌカ）")?.trim();
                      if (name) {
                        setBodyBases((prev) => [...prev, { id: uid(), name }]);
                        setIsBodyExpanded(true);
                      }
                    }}
                    className="btn btn-secondary btn-sm"
                    style={{ padding: "0px 6px", height: "auto" }}
                  >
                    ＋
                  </button>
                </div>

                {isBodyExpanded && (
                  <div>
                    <BaseItem
                      active={filterBaseId === ""}
                      label={`すべて (${baseCounts.all})`}
                      onClick={() => setFilterBaseId("")}
                    />
                    <BaseItem
                      active={filterBaseId === "__none__"}
                      label={`未割り当て (${baseCounts.none})`}
                      onClick={() => setFilterBaseId("__none__")}
                    />
                    <div style={{ height: 1, background: "#e2e8f0", margin: "6px 0" }} />

                    {bodyBases.map((b) => (
                      <BaseItem
                        key={b.id}
                        active={filterBaseId === b.id}
                        label={`${b.name} (${baseCounts.byId[b.id] ?? 0})`}
                        onClick={() => setFilterBaseId(b.id)}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* お気に入りカテゴリ */}
              <div className="sidebar-section">
                <div
                  className="sidebar-title"
                  onClick={() => setIsFavExpanded(!isFavExpanded)}
                >
                  <span>
                    お気に入り <span style={{ fontSize: 12 }}>{isFavExpanded ? "▼" : "▶"}</span>
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const name = prompt("新しいフォルダ名")?.trim();
                      if (name) {
                        setFavFolders((prev) => [...prev, { id: uid(), name }]);
                        setIsFavExpanded(true);
                      }
                    }}
                    className="btn btn-secondary btn-sm"
                    style={{ padding: "0px 6px", height: "auto" }}
                  >
                    ＋
                  </button>
                </div>

                {isFavExpanded && (
                  <div>
                    <BaseItem
                      active={filterFavId === "__none__"}
                      label={`未分類 (${favCounts.none})`}
                      onClick={() => setFilterFavId(filterFavId === "__none__" ? "" : "__none__")}
                    />
                    <div style={{ height: 1, background: "#e2e8f0", margin: "6px 0" }} />

                    {favFolders.map((f) => (
                      <div key={f.id} style={{ display: "flex", gap: 4, alignItems: "center" }}>
                        <div style={{ flex: 1 }}>
                          <BaseItem
                            active={filterFavId === f.id}
                            label={`${f.name} (${favCounts.byId[f.id] ?? 0})`}
                            onClick={() => setFilterFavId(filterFavId === f.id ? "" : f.id)}
                          />
                        </div>
                        <button
                          className="tag-delete-btn"
                          onClick={() => {
                            if (!confirm(`フォルダ「${f.name}」を削除しますか？`)) return;
                            setFavFolders((prev) => prev.filter((x) => x.id !== f.id));
                            setAvatarFavMap((prev) => {
                              const next = { ...prev };
                              for (const k of Object.keys(next)) {
                                if (next[k] === f.id) delete next[k];
                              }
                              return next;
                            });
                            if (filterFavId === f.id) setFilterFavId("");
                          }}
                          style={{ fontSize: 16, width: 20, height: 20 }}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </aside>

            {/* 右：一覧 */}
            <main style={{ flex: 1, minWidth: 0 }}>
              {/* Row 0: ログイン情報 */}
              <div style={{ marginBottom: 16, display: "flex", gap: 12, alignItems: "center" }}>
                Logged in as <b>{displayName || "(unknown)"}</b>
                {isLoadingAll && (
                  <span style={{ fontSize: "0.9rem", color: "#2563eb", fontWeight: "bold" }}>
                    🔄 {loadingProgress}
                  </span>
                )}
              </div>

              {/* Row 1: 全N体 + ソート + 順序 */}
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 16, marginBottom: 12 }}>
                {totalAvatars !== null && (
                  <span style={{ fontSize: "1.1rem", fontWeight: "bold", color: "#333", marginRight: 8 }}>
                    全 {totalAvatars} 体
                  </span>
                )}

                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <label style={{ fontSize: "0.95rem" }}>ソート:</label>
                  <select className="modern-select" value={sort} onChange={(e) => setSort(e.target.value)}>
                    <option value="updated">更新日時</option>
                    <option value="created">作成日時</option>
                    <option value="name">名前</option>
                  </select>
                </div>

                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <label style={{ fontSize: "0.95rem" }}>順序:</label>
                  <select className="modern-select" value={order} onChange={(e) => setOrder(e.target.value)}>
                    <option value="descending">降順 (新しい/Z-A)</option>
                    <option value="ascending">昇順 (古い/A-Z)</option>
                  </select>
                </div>
              </div>

              {/* Row 2: 検索バー */}
              <div style={{ marginBottom: 12 }}>
                <input
                  className="search-input"
                  placeholder="全アバターから名前検索"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") searchAvatars(true);
                  }}
                  style={{ width: "100%", boxSizing: "border-box" }}
                />
                {mode === "search" && (
                  <div style={{ marginTop: 4, display: "flex", gap: 8, alignItems: "center" }}>
                    <span>検索結果: <b>{searchTotal ?? "…"}</b> 件</span>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => {
                        setMode("list");
                        setSearchResults([]);
                        setSearchTotal(null);
                        setSearchOffset(0);
                        setSearchHasMore(false);
                      }}
                    >
                      一覧に戻る
                    </button>
                  </div>
                )}
              </div>

              {/* Row 3: 素体フィルタ + Quest/Mobile Checkbox */}
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 16, marginBottom: 20 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <label style={{ fontSize: "0.95rem" }}>素体フィルタ:</label>
                  <select
                    className="modern-select"
                    value={filterBaseId}
                    onChange={(e) => setFilterBaseId(e.target.value)}
                  >
                    <option value="">すべて</option>
                    <option value="__none__">未割り当て</option>
                    {bodyBases.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>

                <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: "0.95rem", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={onlyMobile}
                    onChange={(e) => setOnlyMobile(e.target.checked)}
                  />
                  Quest / Mobile 対応のみ
                </label>
              </div>
              <div className="avatar-grid">
                {filteredAvatars.map((a) => (
                  <div key={a.id} className="avatar-card">
                    <div className="avatar-thumb-container">
                      <img
                        src={a.thumbnail}
                        className="avatar-thumb"
                        loading="lazy"
                        alt={a.name}
                      />
                    </div>

                    <div className="card-content">
                      <div className="avatar-name">{a.name}</div>

                      <div className="card-meta">
                        <div>対応: {(a.platforms ?? []).join(", ") || "-"}</div>
                        <div>作成: {a.createdAt ? new Date(a.createdAt).toLocaleString() : "-"}</div>
                        <div>更新: {a.updatedAt ? new Date(a.updatedAt).toLocaleString() : "-"}</div>
                      </div>

                      <div style={{ fontSize: "0.85rem", marginBottom: 12, display: "flex", gap: 8, opacity: 0.9 }}>
                        <div>🖥 {rankBadge(getPerfRank(a.performance, "standalonewindows"))}</div>
                        <div>📱 {rankBadge(getPerfRank(a.performance, "android"))}</div>
                      </div>

                      <div style={{ marginTop: "auto", display: "grid", gap: 8 }}>
                        <button
                          onClick={() => window.open(`https://vrchat.com/home/avatar/${a.id}`, "_blank", "noopener,noreferrer")}
                          className="btn btn-primary btn-sm"
                          style={{ width: "100%", justifyContent: "center" }}
                        >
                          🔗 VRChatで開く
                        </button>

                        <button
                          onClick={() => selectAvatar(a.id)}
                          className="btn btn-success btn-sm"
                          style={{ width: "100%", justifyContent: "center" }}
                        >
                          ✅ このアバターに変更
                        </button>
                      </div>

                      {/* 素体割り当て UI */}
                      <div style={{ marginTop: 12 }}>
                        <select
                          value={avatarBaseMap[a.id] ?? ""}
                          onChange={(e) => {
                            const baseId = e.target.value;
                            setAvatarBaseMap((prev) => {
                              const next = { ...prev };
                              if (baseId) next[a.id] = baseId;
                              else delete next[a.id];
                              return next;
                            });
                          }}
                          className="modern-select"
                          style={{ width: "100%", fontSize: "0.85rem" }}
                        >
                          <option value="">（素体なし）</option>
                          {bodyBases.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div style={{ marginTop: 4, fontSize: 11, opacity: 0.6 }}>
                        素体: {bodyBases.find((b) => b.id === avatarBaseMap[a.id])?.name ?? "（なし）"}
                      </div>

                      {/* お気に入り割り当て UI */}
                      <div style={{ marginTop: 8 }}>
                        <select
                          value={avatarFavMap[a.id] ?? ""}
                          onChange={(e) => {
                            const favId = e.target.value;
                            setAvatarFavMap((prev) => {
                              const next = { ...prev };
                              if (favId) next[a.id] = favId;
                              else delete next[a.id];
                              return next;
                            });
                          }}
                          className="modern-select"
                          style={{ width: "100%", fontSize: "0.85rem" }}
                        >
                          <option value="">（お気に入りなし）</option>
                          {favFolders.map((f) => (
                            <option key={f.id} value={f.id}>
                              ★ {f.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* タグ (最大5個) */}
                      <div style={{ marginTop: 12 }}>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 4 }}>
                          {(avatarTags[a.id] || []).map((tag, i) => (
                            <span key={i} className="tag-chip">
                              {tag}
                              <button
                                className="tag-delete-btn"
                                onClick={() => {
                                  setAvatarTags((prev) => {
                                    const next = { ...prev };
                                    const list = next[a.id] || [];
                                    next[a.id] = list.filter((_, idx) => idx !== i);
                                    if (next[a.id].length === 0) delete next[a.id];
                                    return next;
                                  });
                                }}
                              >
                                ✕
                              </button>
                            </span>
                          ))}
                        </div>

                        {(avatarTags[a.id] || []).length < 5 && (
                          <form
                            className="tag-form"
                            onSubmit={(e) => {
                              e.preventDefault();
                              const input = e.currentTarget.elements.namedItem("tag") as HTMLInputElement;
                              const val = input.value.trim();
                              if (!val) return;
                              if ((avatarTags[a.id] || []).length >= 5) return;

                              setAvatarTags((prev) => {
                                const next = { ...prev };
                                const list = next[a.id] || [];
                                next[a.id] = [...list, val];
                                return next;
                              });
                              input.value = "";
                            }}
                          >
                            <input
                              name="tag"
                              className="tag-input"
                              placeholder="タグを追加"
                              style={{ background: "#f8fafc" }}
                            />
                            <button type="submit" className="btn btn-secondary btn-sm" style={{ padding: "2px 6px", height: "auto" }}>
                              ＋
                            </button>
                          </form>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {shownHasMore && mode === "search" && (
                <div style={{ marginTop: 16 }}>
                  <button onClick={() => searchAvatars(false)}>
                    もっと読む
                  </button>
                </div>
              )}
            </main>
          </div>
        </div>
      )
      }

      {/* 設定モーダル */}
      {
        showSettings && (
          <SettingsModal
            bodyBases={bodyBases}
            setBodyBases={setBodyBases}
            setAvatarBaseMap={setAvatarBaseMap}
            confirmAvatarChange={confirmAvatarChange}
            setConfirmAvatarChange={setConfirmAvatarChange}
            onClose={() => setShowSettings(false)}
            onExport={exportBackup}
            onImport={importBackup}
          />

        )
      }
    </div >
  );
}


