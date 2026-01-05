import { Hono } from "hono";
import { cors } from "hono/cors";
import { getCookie, setCookie } from "hono/cookie";
import { serve } from "@hono/node-server";

import {
    createSession,
    hasSession,
    vrcLogin,
    vrcVerify2FA,
    vrcGetMyAvatars,
    type TwoFAMethod,
} from "./vrc.js";

const app = new Hono();

// CORS（Viteから叩く）
app.use(
    "*",
    cors({
        origin: "http://localhost:5173",
        credentials: true,
    })
);

// 起動確認
app.get("/health", (c) => c.json({ ok: true }));

// sid cookie（サーバ側セッション）を確保
app.use("*", async (c, next) => {
    let sid = getCookie(c, "sid");
    if (!sid || !hasSession(sid)) {
        sid = createSession();
        setCookie(c, "sid", sid, {
            httpOnly: true,
            sameSite: "Lax",
            path: "/",
        });
    }
    await next();
});

// 1) ログイン
app.post("/auth/login", async (c) => {
    const { username, password } = await c.req.json<{
        username: string;
        password: string;
    }>();

    const sid = getCookie(c, "sid")!;

    try {
        const r = await vrcLogin(sid, username, password);

        if (!r.ok) {
            return c.json({ ok: false, status: r.status, body: r.body }, 401);
        }

        // 2FAが必要
        if (r.state === "2fa_required") {
            return c.json({ ok: true, state: "2fa_required", methods: r.methods });
        }

        // 2FA不要でログイン完了
        return c.json({
            ok: true,
            state: "logged_in",
            displayName: (r.user as any)?.displayName ?? "",
        });
    } catch (e) {
        return c.json({ ok: false, error: "LOGIN_FAILED" }, 500);
    }
});

// 2) 2FA
app.post("/auth/2fa", async (c) => {
    const { method, code } = await c.req.json<{
        method: TwoFAMethod;
        code: string;
    }>();

    const sid = getCookie(c, "sid")!;

    try {
        const r = await vrcVerify2FA(sid, method, code);

        if (!r.ok) {
            return c.json({ ok: false, status: r.status, body: r.body }, 401);
        }

        return c.json({
            ok: true,
            state: "logged_in",
            displayName: (r.user as any)?.displayName ?? "",
        });
    } catch (e) {
        return c.json({ ok: false, error: "2FA_FAILED" }, 500);
    }
});

// 3) アバター一覧
app.get("/avatars", async (c) => {
    const sid = getCookie(c, "sid")!;
    try {
        const r = await vrcGetMyAvatars(sid);

        if (!r.ok) {
            return c.json({ ok: false, status: r.status, body: r.body }, 401);
        }

        // フロント向けに整形
        const avatars = (r.avatars ?? []).map((a: any) => ({
            id: a.id,
            name: a.name,
            thumbnail: a.thumbnailImageUrl,
            platform: a.platform,
            updatedAt: a.updated_at,
        }));

        return c.json({ ok: true, avatars });
    } catch (e) {
        return c.json({ ok: false, error: "AVATARS_FAILED" }, 500);
    }
});

// APIのポート
const port = 8787;
serve({ fetch: app.fetch, port });