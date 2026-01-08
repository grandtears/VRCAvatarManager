import { Hono } from "hono";
import { cors } from "hono/cors";
import { getCookie, setCookie } from "hono/cookie";
import { serve } from "@hono/node-server";

import {
    createSession,
    hasSession,
    vrcGetMyAvatars,
    vrcLogin,
    vrcVerify2FA,
    vrcCountMyAvatars,
    vrcGetMe,
    vrcSelectAvatar,
    deleteSession,
    type TwoFAMethod
} from "./vrc.ts";
import { logToFile } from "./logger.ts";

type Env = {
    Variables: {
        sid: string;
    };
};

const app = new Hono<Env>();

// Settings Persistence
import fs from "node:fs";
import path from "node:path";
const SETTINGS_FILE = process.env.VAM_SETTINGS_FILE
    ? path.resolve(process.env.VAM_SETTINGS_FILE)
    : path.resolve(process.cwd(), "settings.json");

function loadSettings() {
    if (!fs.existsSync(SETTINGS_FILE)) return {};
    try {
        return JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8"));
    } catch {
        return {};
    }
}
function saveSettings(data: any) {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2));
}

// Settings Endpoints
app.get("/settings", (c) => {
    return c.json(loadSettings());
});
app.post("/settings", async (c) => {
    const data = await c.req.json();
    saveSettings(data);
    return c.json({ ok: true });
});

// Windows GUI app (Electron) blocks if console.log writes to non-existent stdout.

// CORS（Viteから叩く）
app.use(
    "*",
    cors({
        origin: (origin) => {
            // Electron (production) often sends "file://" or "null"
            if (!origin || origin === "null" || origin.startsWith("file://")) {
                return origin || "*"; // Return incoming or * if null (though credentials require exact)
            }
            // Dev mode
            if (origin.startsWith("http://localhost")) {
                return origin;
            }
            return origin; // Fallback: allow purely local usage
        },
        credentials: true
    })
);

// 起動確認
app.get("/health", (c) => c.json({ ok: true }));

// sid cookie（サーバ側セッション）
const SID_TTL_SEC = 60 * 60 * 24 * 30; // 30日
app.use("*", async (c, next) => {
    const incoming = getCookie(c, "sid");

    let sid = incoming;
    if (!sid || !hasSession(sid)) {
        sid = createSession();

        setCookie(c, "sid", sid, {
            httpOnly: true,
            sameSite: "Lax",
            path: "/",
            maxAge: 60 * 60 * 24 * 30,
        });
    }

    c.set("sid", sid);
    await next();
});

/** ログイン **/
app.post("/auth/login", async (c) => {
    const { username, password } = await c.req.json<{ username: string; password: string }>();
    const sid = c.get("sid");

    const r = await vrcLogin(sid, username, password);

    if (!r.ok) return c.json({ ok: false, status: r.status, body: r.body }, { status: 401 as const });

    if (r.state === "2fa_required") {
        return c.json({ ok: true, state: "2fa_required", methods: r.methods });
    }

    return c.json({
        ok: true,
        state: "logged_in",
        displayName: (r.user as any)?.displayName ?? ""
    });
});
/** 2FA **/
app.post("/auth/2fa", async (c) => {
    const { method, code } = await c.req.json<{ method: TwoFAMethod; code: string }>();
    const sid = c.get("sid");
    logToFile(`[node] 2FA request sid=${sid}`);

    const r = await vrcVerify2FA(sid, method, code);
    logToFile(`[node] 2FA result ok=${r.ok}`);

    if (!r.ok) return c.json({ ok: false, status: r.status, body: r.body }, 401);

    return c.json({
        ok: true,
        state: "logged_in",
        displayName: (r.user as any)?.displayName ?? ""
    });
});

/** ログアウト（sid のセッション破棄 + cookie削除） */
app.post("/auth/logout", async (c) => {
    const sid = c.get("sid");

    // サーバ側の jar を破棄（= VRChatログイン情報も消える）
    deleteSession(sid);

    // ブラウザの sid cookie も消す（次のアクセスで新sidが発行される）
    setCookie(c, "sid", "", {
        httpOnly: true,
        sameSite: "Lax",
        path: "/",
        maxAge: 0,
    });

    return c.json({ ok: true });
});

/** アバターを返却するエンドポイント **/
app.get("/avatars", async (c) => {
    const sid = c.get("sid");

    const n = Number(c.req.query("n") ?? "100");         // 1回に取る件数
    const offset = Number(c.req.query("offset") ?? "0"); // 何件目から
    const sort = c.req.query("sort") ?? "updated";
    const order = c.req.query("order") ?? "descending";

    const safeN = Number.isFinite(n) ? Math.min(Math.max(n, 1), 100) : 100;
    const safeOffset = Number.isFinite(offset) ? Math.max(offset, 0) : 0;

    try {
        const tasks: Promise<any>[] = [
            vrcGetMyAvatars(sid, safeN, safeOffset, sort, order)
        ];

        // 最初のページの時だけ総数をカウントする
        if (safeOffset === 0) {
            tasks.push(vrcCountMyAvatars(sid));
        }

        const [r, countR] = await Promise.all(tasks);

        if (!r.ok) {
            return c.json({ ok: false, status: r.status, body: r.body }, 401);
        }

        const avatars = (r.avatars ?? []).map((a: any) => {
            const platforms: string[] = [];
            const performanceMap: Record<string, string> = {};

            for (const p of (a.unityPackages ?? [])) {
                if (p.platform) {
                    platforms.push(p.platform);
                    if (p.performanceRating) {
                        performanceMap[p.platform] = p.performanceRating;
                    }
                }
            }

            return {
                id: a.id,
                name: a.name,
                thumbnail: a.thumbnailImageUrl,
                createdAt: a.created_at,
                updatedAt: a.updated_at,
                platforms: Array.from(new Set(platforms)),
                performance: Object.keys(performanceMap).length > 0 ? performanceMap : (a.performance ?? null),
            };
        });

        // VRChatは配列だけ返すので「次があるか」を推定
        const hasMore = (r.avatars?.length ?? 0) === safeN;
        const total = countR ? countR.total : undefined;

        return c.json({ ok: true, avatars, offset: safeOffset, n: safeN, hasMore, total });
    } catch {
        return c.json({ ok: false, error: "AVATARS_FAILED" }, 500);
    }
});


/**アバター検索のエンドポイント */
app.get("/avatars/search", async (c) => {
    const sid = c.get("sid");

    const qRaw = (c.req.query("q") ?? "").trim();
    const q = qRaw.toLowerCase();

    const n = Number(c.req.query("n") ?? "50");          // 返す件数
    const offset = Number(c.req.query("offset") ?? "0"); // 検索結果のオフセット
    const safeN = Number.isFinite(n) ? Math.min(Math.max(n, 1), 100) : 50;
    const safeOffset = Number.isFinite(offset) ? Math.max(offset, 0) : 0;

    // 空検索は危険（全件になる）なので弾く
    if (!q) {
        return c.json({ ok: true, q: qRaw, totalMatches: 0, avatars: [], hasMore: false });
    }

    try {
        // VRChat API 側のページを回しながら、名前一致だけ集める
        const pageSize = 100; // VRChat側は最大100想定
        let pageOffset = 0;

        let matchedTotal = 0;
        const window: any[] = []; // [safeOffset, safeOffset+safeN) の分だけ保持

        while (true) {
            const r = await vrcGetMyAvatars(sid, pageSize, pageOffset);
            if (!r.ok) return c.json({ ok: false, status: r.status, body: r.body }, 401);

            const items = r.avatars ?? [];
            if (items.length === 0) break;

            for (const a of items) {
                const name = String((a as any).name ?? "");
                if (name.toLowerCase().includes(q)) {
                    // まず総一致数をカウント
                    const idx = matchedTotal;
                    matchedTotal += 1;

                    // 返すウィンドウ範囲だけ保持
                    if (idx >= safeOffset && idx < safeOffset + safeN) {
                        window.push(a);
                    }
                }
            }

            if (items.length < pageSize) break;

            pageOffset += pageSize;
        }

        const avatars = window.map((a: any) => {
            const platforms = Array.from(
                new Set((a.unityPackages ?? []).map((p: any) => String(p.platform)).filter(Boolean))
            );

            return {
                id: a.id,
                name: a.name,
                thumbnail: a.thumbnailImageUrl,
                createdAt: a.created_at,
                updatedAt: a.updated_at,
                platforms,
                performance: a.performance ?? null,
            };
        });

        const hasMore = safeOffset + avatars.length < matchedTotal;

        return c.json({
            ok: true,
            q: qRaw,
            totalMatches: matchedTotal,
            avatars,
            hasMore,
            offset: safeOffset,
            n: safeN,
        });
    } catch (e) {
        return c.json({ ok: false, error: "SEARCH_FAILED" }, 500);
    }
});

/* アバター変更のエンドポイント */
app.post("/avatars/:id/select", async (c) => {
    const sid = c.get("sid");
    const avatarId = c.req.param("id");

    const r = await vrcSelectAvatar(sid, avatarId);

    if (!r.ok) {
        return c.json({ ok: false, status: r.status, body: r.body }, { status: 401 as const });
    }

    return c.json({ ok: true });
});

/* ログイン済みか？ */
app.get("/auth/me", async (c) => {
    const sid = c.get("sid");
    const r = await vrcGetMe(sid);

    if (!r.ok) return c.json({ ok: false }, 401);

    return c.json({
        ok: true,
        displayName: (r.user as any)?.displayName ?? "",
    });
});

// Static file serving for production (Electron)
const WEB_DIR = process.env.VAM_WEB_DIR;
if (WEB_DIR) {
    const fsSync = require("node:fs");
    const pathSync = require("node:path");

    // Serve static files
    app.get("*", async (c) => {
        const urlPath = c.req.path === "/" ? "/index.html" : c.req.path;
        // 安全なパス解決
        const forbidden = urlPath.includes("..") || urlPath.includes(":");
        if (forbidden) return c.notFound();

        const filePath = pathSync.join(WEB_DIR, urlPath);

        // ディレクトリトラバーサル対策: 解決後のパスが WEB_DIR 内にあるか確認
        if (!filePath.startsWith(WEB_DIR)) {
            return c.notFound();
        }

        try {
            const stat = fsSync.statSync(filePath);
            if (stat.isFile()) {
                const content = fsSync.readFileSync(filePath);
                const ext = pathSync.extname(filePath).toLowerCase();
                const mimeTypes: Record<string, string> = {
                    ".html": "text/html",
                    ".js": "application/javascript",
                    ".css": "text/css",
                    ".json": "application/json",
                    ".png": "image/png",
                    ".jpg": "image/jpeg",
                    ".svg": "image/svg+xml",
                    ".ico": "image/x-icon",
                };
                const contentType = mimeTypes[ext] || "application/octet-stream";
                return c.body(content, 200, { "Content-Type": contentType });
            }
        } catch (e) {
            // File not found, try index.html for SPA routing
            try {
                const indexPath = pathSync.join(WEB_DIR, "index.html");
                const content = fsSync.readFileSync(indexPath);
                return c.body(content, 200, { "Content-Type": "text/html" });
            } catch {
                return c.notFound();
            }
        }
        return c.notFound();
    });
}

// 大事
const port = Number(process.env.PORT || 8787);
serve({ fetch: app.fetch, port, hostname: "127.0.0.1" });
// touch