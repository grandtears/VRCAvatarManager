import React, { useEffect, useMemo, useState } from "react";
import "./App.css";
import "./index.css";

type State = "boot" | "idle" | "2fa_required" | "logged_in";
type TwoFAMethod = "totp" | "emailOtp";

type Avatar = {
  id: string;
  name: string;
  thumbnail: string;
  platforms?: string[];
  updatedAt?: string;
  createdAt?: string;
  performance?: string;
};

const API = "http://localhost:8787";

type BodyBase = {
  id: string;
  name: string;
};

/* 素体設定用 */
const BODY_BASES_KEY = "vam.bodyBases.v1";

function loadBodyBases(): BodyBase[] {
  try {
    const raw = localStorage.getItem(BODY_BASES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveBodyBases(list: BodyBase[]) {
  localStorage.setItem(BODY_BASES_KEY, JSON.stringify(list));
}

function uid() {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

// アバターID → 素体ID の対応表
type AvatarBaseMap = Record<string, string>;

const AVATAR_BASE_MAP_KEY = "vam.avatarBaseMap.v1";

function loadAvatarBaseMap(): AvatarBaseMap {
  try {
    const raw = localStorage.getItem(AVATAR_BASE_MAP_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveAvatarBaseMap(map: AvatarBaseMap) {
  localStorage.setItem(AVATAR_BASE_MAP_KEY, JSON.stringify(map));
}

const CONFIRM_AVATAR_CHANGE_KEY = "vam.confirmAvatarChange.v1";

/* お気に入りフォルダ用 */
type FavFolder = {
  id: string;
  name: string;
};
type AvatarFavMap = Record<string, string>;

const FAV_FOLDERS_KEY = "vam.favFolders.v1";
const AVATAR_FAV_MAP_KEY = "vam.avatarFavMap.v1";

function loadFavFolders(): FavFolder[] {
  try {
    const raw = localStorage.getItem(FAV_FOLDERS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
function saveFavFolders(list: FavFolder[]) {
  localStorage.setItem(FAV_FOLDERS_KEY, JSON.stringify(list));
}

function loadAvatarFavMap(): AvatarFavMap {
  try {
    const raw = localStorage.getItem(AVATAR_FAV_MAP_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}
function saveAvatarFavMap(map: AvatarFavMap) {
  localStorage.setItem(AVATAR_FAV_MAP_KEY, JSON.stringify(map));
}

function loadConfirmAvatarChange(): boolean {
  try {
    const raw = localStorage.getItem(CONFIRM_AVATAR_CHANGE_KEY);
    return raw === "true"; // default false if null
  } catch {
    return false;
  }
}

function saveConfirmAvatarChange(enabled: boolean) {
  localStorage.setItem(CONFIRM_AVATAR_CHANGE_KEY, String(enabled));
}

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
  const [bodyBases, setBodyBases] = useState<BodyBase[]>(() => loadBodyBases());

  const [avatarBaseMap, setAvatarBaseMap] = useState<AvatarBaseMap>(() =>
    loadAvatarBaseMap()
  );

  const [onlyMobile, setOnlyMobile] = useState(false);

  // 素体フィルタ（"" = すべて, "__none__" = 未割り当て）
  const [filterBaseId, setFilterBaseId] = useState<string>("");

  const [confirmAvatarChange, setConfirmAvatarChange] = useState<boolean>(() =>
    loadConfirmAvatarChange()
  );

  const [sort, setSort] = useState("updated");
  const [order, setOrder] = useState("descending");

  /* お気に入り */
  const [favFolders, setFavFolders] = useState<FavFolder[]>(() => loadFavFolders());
  const [avatarFavMap, setAvatarFavMap] = useState<AvatarFavMap>(() =>
    loadAvatarFavMap()
  );
  // お気に入りフィルタ（"" = すべて, "__none__" = 未分類）
  const [filterFavId, setFilterFavId] = useState<string>("");

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

      return (
        avatarName.includes(qNorm) ||
        baseNameNorm.includes(qNorm) ||
        favNameNorm.includes(qNorm)
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

    try {
      const r = await fetch(`${API}/auth/2fa`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ method, code }),
      });

      const j = await r.json().catch(() => null);

      if (!j?.ok) {
        setError("2FAコードが違う/期限切れ/未ログイン");
        return;
      }

      setDisplayName(j.displayName || "");
      setState("logged_in");
    } catch {
      setError("2FA送信に失敗しました");
    }
  }

  async function loadAvatars(reset = false) {
    setError("");

    try {
      const nextOffset = reset ? 0 : offset;
      const r = await fetch(
        `${API}/avatars?n=${pageSize}&offset=${nextOffset}&sort=${sort}&order=${order}`,
        {
          credentials: "include",
        }
      );
      const j = await r.json().catch(() => null);

      if (!j?.ok) {
        setError("アバター取得に失敗（未ログイン/セッション切れ）");
        return;
      }

      if (typeof j.total === "number") {
        setTotalAvatars(j.total);
      }

      const newItems: Avatar[] = j.avatars || [];
      setHasMore(!!j.hasMore);

      if (reset) {
        setAvatars(newItems);
        setOffset(newItems.length);
      } else {
        setAvatars((prev) => [...prev, ...newItems]);
        setOffset(nextOffset + newItems.length);
      }
    } catch {
      setError("アバター取得APIに接続できません");
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


  function normalizeRank(x: unknown): string | null {
    if (!x) return null;
    const s = String(x).trim();
    if (!s) return null;
    // 表記揺れ吸収
    const u = s.toLowerCase();
    if (u.includes("excellent")) return "Excellent";
    if (u.includes("good")) return "Good";
    if (u.includes("medium")) return "Medium";
    if (u.includes("poor") && !u.includes("very")) return "Poor";
    if (u.includes("verypoor") || u.includes("very poor")) return "VeryPoor";
    return s;
  }

  function getPerfRank(perf: any, platform: "standalonewindows" | "android"): string | null {
    if (!perf) return null;

    const asStr = normalizeRank(perf);
    if (typeof perf === "string" && asStr) return asStr;

    const p1 = perf?.[platform];
    const r1 = normalizeRank(p1?.rating ?? p1?.rank ?? p1);
    if (r1) return r1;

    const altKey =
      platform === "standalonewindows"
        ? perf?.pc ?? perf?.windows ?? perf?.win
        : perf?.quest ?? perf?.mobile ?? perf?.android;
    const r2 = normalizeRank(altKey?.rating ?? altKey?.rank ?? altKey);
    if (r2) return r2;

    const r3 = normalizeRank(perf?.rating ?? perf?.rank);
    if (r3) return r3;

    return null;
  }

  function rankBadge(rank: string | null): string {
    if (!rank) return "-";
    if (rank === "Excellent") return "🟦 Excellent";
    if (rank === "Good") return "🟩 Good";
    if (rank === "Medium") return "🟨 Medium";
    if (rank === "Poor") return "🟧 Poor";
    if (rank === "VeryPoor") return "🟥 VeryPoor";
    return rank;
  }

  function BaseItem(props: { active: boolean; label: string; onClick: () => void }) {
    const { active, label, onClick } = props;
    return (
      <button
        onClick={onClick}
        style={{
          textAlign: "left",
          width: "100%",
          padding: "8px 10px",
          borderRadius: 8,
          border: "1px solid #ddd",
          background: active ? "#e8f0fe" : "#fff",
          cursor: "pointer",
          fontWeight: active ? 700 : 500,
        }}
      >
        {label}
      </button>
    );
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
      loadAvatars(true);
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

  useEffect(() => {
    const base = bodyBases.find((b) => b.id === filterBaseId);
    console.log("filterBaseId:", filterBaseId, "name:", base?.name);

    const hits = avatars.filter((a) => avatarBaseMap[a.id] === filterBaseId).length;
    console.log("hits in list:", hits);
  }, [filterBaseId, bodyBases, avatars, avatarBaseMap]);

  return (
    <div style={{ padding: 16, fontFamily: "system-ui" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <h1>VRChat Avatar Viewer</h1>
        <div style={{ display: "flex", gap: 8 }}>
          {state === "logged_in" && (
            <button
              onClick={doLogout}
              style={{
                background: "#c62828",
                color: "#fff",
                border: "none",
                borderRadius: 4,
                padding: "6px 10px",
                cursor: "pointer",
              }}
            >
              🚪 ログアウト
            </button>
          )}
          <button onClick={() => setShowSettings(true)}>⚙ 設定</button>
        </div>
      </div>

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
        <div style={{ maxWidth: 420, display: "grid", gap: 8 }}>
          <h2>ログイン</h2>
          <input
            placeholder="VRChat Username（メールは基本NG）"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <input
            placeholder="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button onClick={doLogin}>ログイン</button>
        </div>
      )}

      {state === "2fa_required" && (
        <div style={{ maxWidth: 480, display: "grid", gap: 8 }}>
          <h2>2段階認証</h2>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span>方式:</span>
            <select
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

          <input placeholder="6桁コード" value={code} onChange={(e) => setCode(e.target.value)} />
          <button onClick={do2fa}>送信</button>
        </div>
      )}

      {state === "logged_in" && (
        <div>
          {/* 上部ステータス */}
          <div style={{ marginBottom: 12 }}>
            Logged in as <b>{displayName || "(unknown)"}</b>
            {totalAvatars !== null && (
              <span style={{ marginLeft: 12 }}>（全 {totalAvatars} アバター）</span>
            )}
            <button
              style={{ marginLeft: 12 }}
              onClick={() => {
                setMode("list");
                setQuery("");
                setSearchResults([]);
                setSearchTotal(null);
                setSearchOffset(0);
                setSearchHasMore(false);

                setOffset(0);
                loadAvatars(true);
              }}
            >
              再読み込み
            </button>
          </div>

          {/* ソートUI */}
          <div style={{ marginBottom: 12, display: "flex", gap: 12, alignItems: "center" }}>
            {totalAvatars !== null && (
              <span style={{ marginRight: 12, fontWeight: "bold" }}>全 {totalAvatars} 体</span>
            )}
            <label>
              ソート:
              <select className="modern-select" style={{ marginLeft: 4 }} value={sort} onChange={(e) => setSort(e.target.value)}>
                <option value="updated">更新日時</option>
                <option value="created">作成日時</option>
                <option value="name">名前</option>
              </select>
            </label>
            <label>
              順序:
              <select className="modern-select" style={{ marginLeft: 4 }} value={order} onChange={(e) => setOrder(e.target.value)}>
                <option value="descending">降順 (新しい/Z-A)</option>
                <option value="ascending">昇順 (古い/A-Z)</option>
              </select>
            </label>
          </div>

          {/* 検索UI */}
          <div
            style={{
              marginBottom: 12,
              display: "flex",
              gap: 8,
              alignItems: "center",
            }}
          >
            <input
              placeholder="全アバターから名前検索"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{ flex: 1, padding: 8 }}
              onKeyDown={(e) => {
                if (e.key === "Enter") searchAvatars(true);
              }}
            />
            <button onClick={() => searchAvatars(true)}>検索</button>

            {mode === "search" && (
              <button
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
            )}
          </div>

          {/* 検索時の件数表示 */}
          {mode === "search" && (
            <div style={{ marginBottom: 8 }}>
              検索結果: <b>{searchTotal ?? "…"}</b> 件
            </div>
          )}

          {/* 素体フィルタ */}
          <div
            style={{
              marginBottom: 12,
              display: "flex",
              gap: 8,
              alignItems: "center",
            }}
          >
            <span>素体フィルタ:</span>

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

            {filterBaseId && (
              <button onClick={() => setFilterBaseId("")}>解除</button>
            )}

            {/* モバイル対応フィルタ */}
            <label style={{ display: "flex", gap: 4, alignItems: "center" }}>
              <input
                type="checkbox"
                checked={onlyMobile}
                onChange={(e) => setOnlyMobile(e.target.checked)}
              />
              Quest / Mobile 対応のみ
            </label>
          </div>

          {/* 左サイドバー (まとめて1カラム) */}
          <div className="main-layout">
            <div
              style={{
                width: 250,
                flexShrink: 0,
                display: "flex",
                flexDirection: "column",
                gap: 12,
              }}
            >
              {/* 素体カテゴリ */}
              <aside
                style={{
                  border: "1px solid #ddd",
                  borderRadius: 8,
                  padding: 10,
                }}
              >
                <div
                  style={{
                    fontWeight: 700,
                    marginBottom: isBodyExpanded ? 10 : 0,
                    cursor: "pointer",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                  onClick={() => setIsBodyExpanded(!isBodyExpanded)}
                >
                  素体カテゴリ
                  <span>{isBodyExpanded ? "▼" : "▶"}</span>
                </div>

                {isBodyExpanded && (
                  <div style={{ display: "grid", gap: 6 }}>
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
                    <div style={{ height: 1, background: "#eee", margin: "6px 0" }} />

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
              </aside>

              {/* お気に入りカテゴリ */}
              <aside
                style={{
                  border: "1px solid #ddd",
                  borderRadius: 8,
                  padding: 10,
                }}
              >
                <div
                  style={{
                    fontWeight: 700,
                    marginBottom: isFavExpanded ? 10 : 0,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    cursor: "pointer",
                  }}
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
                    style={{ fontSize: 11, padding: "2px 6px" }}
                  >
                    ＋
                  </button>
                </div>

                {isFavExpanded && (
                  <div style={{ display: "grid", gap: 6 }}>
                    <BaseItem
                      active={filterFavId === "__none__"}
                      label={`未分類 (${favCounts.none})`}
                      onClick={() => setFilterFavId(filterFavId === "__none__" ? "" : "__none__")}
                    />
                    <div style={{ height: 1, background: "#eee", margin: "6px 0" }} />

                    {favFolders.map((f) => (
                      <div key={f.id} style={{ display: "flex", gap: 4 }}>
                        <BaseItem
                          active={filterFavId === f.id}
                          label={`${f.name} (${favCounts.byId[f.id] ?? 0})`}
                          onClick={() => setFilterFavId(filterFavId === f.id ? "" : f.id)}
                        />
                        <button
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
                          style={{ fontSize: 10, padding: 4 }}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </aside>
            </div>

            {/* 右：一覧 */}
            <main style={{ flex: 1, minWidth: "300px" }}>
              <div className="avatar-grid">
                {filteredAvatars.map((a) => (
                  <div key={a.id} style={{ border: "1px solid #ddd", padding: 8 }}>
                    <img
                      src={a.thumbnail}
                      style={{ width: "100%", borderRadius: 6 }}
                      loading="lazy"
                    />

                    <div style={{ marginTop: 6, fontWeight: 600 }}>{a.name}</div>

                    <div style={{ marginTop: 6, fontSize: 12, opacity: 0.85 }}>
                      <div>
                        対応: <b>{(a.platforms ?? []).join(", ") || "-"}</b>
                      </div>
                      <div>作成: {a.createdAt ? new Date(a.createdAt).toLocaleString() : "-"}</div>
                      <div>更新: {a.updatedAt ? new Date(a.updatedAt).toLocaleString() : "-"}</div>
                    </div>

                    <div style={{ marginTop: 6, fontSize: 12, opacity: 0.9 }}>
                      <div>🖥 {rankBadge(getPerfRank(a.performance, "standalonewindows"))}</div>
                      <div>📱 {rankBadge(getPerfRank(a.performance, "android"))}</div>
                    </div>

                    <button
                      onClick={() =>
                        window.open(`https://vrchat.com/home/avatar/${a.id}`, "_blank", "noopener,noreferrer")
                      }
                      style={{
                        marginTop: 6,
                        width: "100%",
                        background: "#1e88e5",
                        color: "#fff",
                        border: "none",
                        borderRadius: 4,
                        padding: "6px 8px",
                        cursor: "pointer",
                      }}
                    >
                      🔗 VRChatで開く
                    </button>

                    <button
                      onClick={() => selectAvatar(a.id)}
                      style={{
                        marginTop: 6,
                        width: "100%",
                        background: "#2e7d32",
                        color: "#fff",
                        border: "none",
                        borderRadius: 4,
                        padding: "6px 8px",
                        cursor: "pointer",
                      }}
                    >
                      ✅ このアバターに変更
                    </button>

                    {/* 素体割り当て UI */}
                    <div style={{ marginTop: 8 }}>
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
                        style={{ width: "100%" }}
                      >
                        <option value="">（素体なし）</option>
                        {bodyBases.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div style={{ marginTop: 4, fontSize: 12, opacity: 0.8 }}>
                      素体: {bodyBases.find((b) => b.id === avatarBaseMap[a.id])?.name ?? "（不明）"}
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
                        style={{ width: "100%" }}
                      >
                        <option value="">（お気に入りなし）</option>
                        {favFolders.map((f) => (
                          <option key={f.id} value={f.id}>
                            ★ {f.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                ))}
              </div>

              {shownHasMore && (
                <div style={{ marginTop: 16 }}>
                  <button onClick={() => (mode === "search" ? searchAvatars(false) : loadAvatars(false))}>
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
          />
        )
      }
    </div >
  );
}

/**
 * 設定モーダル
 */
function SettingsModal(props: {
  bodyBases: BodyBase[];
  setBodyBases: React.Dispatch<React.SetStateAction<BodyBase[]>>;
  setAvatarBaseMap: React.Dispatch<React.SetStateAction<AvatarBaseMap>>;
  confirmAvatarChange: boolean;
  setConfirmAvatarChange: React.Dispatch<React.SetStateAction<boolean>>;
  onClose: () => void;
}) {
  const {
    bodyBases,
    setBodyBases,
    setAvatarBaseMap,
    confirmAvatarChange,
    setConfirmAvatarChange,
    onClose,
  } = props;

  const [input, setInput] = useState("");

  function add() {
    const name = input.trim();
    if (!name) return;

    setBodyBases((prev) => [...prev, { id: uid(), name }]);
    setInput("");
  }

  function remove(id: string) {
    setBodyBases((prev) => prev.filter((b) => b.id !== id));

    setAvatarBaseMap((prev) => {
      const next: AvatarBaseMap = { ...prev };
      for (const aid of Object.keys(next)) {
        if (next[aid] === id) delete next[aid];
      }
      return next;
    });
  }

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <h2>素体設定</h2>
          <button onClick={onClose}>✕</button>
        </div>

        {/* 全般設定 */}
        <div style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: 16, margin: "0 0 8px 0" }}>全般</h3>
          <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={confirmAvatarChange}
              onChange={(e) => setConfirmAvatarChange(e.target.checked)}
            />
            アバター変更時に確認ダイアログを表示する
          </label>
        </div>

        {/* 追加 */}
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <input
            placeholder="素体名を入力（例：マヌカ）"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            style={{ flex: 1 }}
          />
          <button onClick={add}>＋</button>
        </div>

        {/* 一覧 */}
        <div style={{ display: "grid", gap: 6 }}>
          {bodyBases.map((b) => (
            <div
              key={b.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                border: "1px solid #ddd",
                padding: 8,
                borderRadius: 6,
              }}
            >
              <span>{b.name}</span>
              <button onClick={() => remove(b.id)}>×</button>
            </div>
          ))}
          {bodyBases.length === 0 && (
            <div style={{ opacity: 0.6 }}>まだ素体がありません</div>
          )}
        </div>
      </div>
    </div>
  );
}

/* モーダルウィンドウのCSS */
const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.4)",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  zIndex: 1000,
};

const modalStyle: React.CSSProperties = {
  background: "#fff",
  borderRadius: 8,
  padding: 16,
  width: 420,
  maxHeight: "80vh",
  overflowY: "auto",
};
