import crypto from "node:crypto";
import { CookieJar } from "tough-cookie";
import type { Cookie } from "tough-cookie";
import makeFetchCookie from "fetch-cookie";
import fs from "node:fs";
import path from "node:path";
import { logToFile } from "./logger.ts";
import { encrypt, decrypt, isEncryptionAvailable } from "./encryption.ts";

export type TwoFAMethod = "totp" | "emailOtp";

type Session = { jar: CookieJar };
const sessions = new Map<string, Session>();

const VRC_BASE = "https://api.vrchat.cloud/api/1";

// 環境変数でパス指定があればそちらを優先（Electron/Portable用）
// Dev mode fallback: assume running from package root
const SESSION_FILE = process.env.VAM_SESSION_FILE
    ? path.resolve(process.env.VAM_SESSION_FILE)
    : path.resolve(process.cwd(), "sessions.json");

const USER_AGENT = "VRChatAvatarManager/0.1";

function basicAuth(username: string, password: string) {
    const token = Buffer.from(`${username}:${password}`, "utf8").toString("base64");
    return `Basic ${token}`;
}

// jar固定fetch（ここが本命）
function getAuthedFetch(jar: CookieJar) {
    return makeFetchCookie(fetch, jar);
}

function loadSessions() {
    if (!fs.existsSync(SESSION_FILE)) return;

    try {
        const raw = fs.readFileSync(SESSION_FILE, "utf8");
        let jsonStr = raw;

        // 暗号化キーがある場合、復号を試みる
        if (isEncryptionAvailable()) {
            // 単純なJSONパースに失敗したら暗号化されているとみなす、あるいは形式で判断
            // ここでは ':' が2つ含まれるかで簡易判定するか、とりあえず復号トライしてみる
            if (!raw.trim().startsWith("{")) {
                try {
                    jsonStr = decrypt(raw);
                } catch (e) {
                    logToFile(`[vrc] Failed to decrypt session file: ${e}`);
                    return; // 復号失敗＝読み込めない
                }
            } else {
                logToFile(`[vrc] Session file found but seems plain text. Will encrypt on next save.`);
            }
        }

        const data = JSON.parse(jsonStr) as Record<string, any>;

        for (const [sid, jarJSON] of Object.entries(data)) {
            const jar = CookieJar.fromJSON(jarJSON);
            sessions.set(sid, { jar });
        }
    } catch (e) {
        logToFile(`[vrc] Error loading sessions: ${e}`);
    }
}

function saveSessions() {
    const obj: Record<string, any> = {};
    for (const [sid, { jar }] of sessions.entries()) {
        obj[sid] = jar.toJSON();
    }

    let content = JSON.stringify(obj, null, 2);

    // 暗号化キーがあれば暗号化
    if (isEncryptionAvailable()) {
        try {
            content = encrypt(content);
        } catch (e) {
            logToFile(`[vrc] Failed to encrypt sessions: ${e}`);
            // 失敗時は保存しない（平文で保存してしまうリスクを避けるため）
            return;
        }
    }

    fs.writeFileSync(SESSION_FILE, content);
}

export function createSession() {
    const sid = crypto.randomUUID();
    const jar = new CookieJar();
    sessions.set(sid, { jar });
    saveSessions();
    return sid;
}

export function hasSession(sid: string) {
    return sessions.has(sid);
}

function getSession(sid: string) {
    const s = sessions.get(sid);
    if (!s) throw new Error("NO_SESSION");
    return s;
}

export function deleteSession(sid: string) {
    if (sessions.delete(sid)) {
        saveSessions();
    }
}

async function readJsonSafe(res: Response) {
    const text = await res.text();
    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
}

/**
 * ログイン（Basic認証で /auth/user）
 * 2FA必須の時は 200 で { requiresTwoFactorAuth: ["emailOtp"] } のように返る。
 */
export async function vrcLogin(sid: string, username: string, password: string) {
    const { jar } = getSession(sid);
    const f = getAuthedFetch(jar);

    const res = await f(`${VRC_BASE}/auth/user`, {
        method: "GET",
        headers: {
            "User-Agent": USER_AGENT,
            Authorization: basicAuth(username, password),
        },
    });

    const data = await readJsonSafe(res);

    if (!res.ok) {
        return { ok: false as const, status: res.status, body: data };
    }

    const methods = (data?.requiresTwoFactorAuth ?? []) as TwoFAMethod[];
    if (methods.length > 0) {
        saveSessions();
        return { ok: true as const, state: "2fa_required" as const, methods };
    }
    saveSessions();
    return { ok: true as const, state: "logged_in" as const, user: data };
}

/** 2FA（Email/TOTP）verify */
export async function vrcVerify2FA(sid: string, method: TwoFAMethod, code: string) {
    logToFile(`[vrc] vrcVerify2FA start sid=${sid} method=${method}`);
    const { jar } = getSession(sid);
    const f = getAuthedFetch(jar);

    const verifyPath =
        method === "emailOtp"
            ? "/auth/twofactorauth/emailotp/verify"
            : "/auth/twofactorauth/totp/verify";

    logToFile(`[vrc] sending verify request to ${verifyPath}`);
    const res = await f(`${VRC_BASE}${verifyPath}`, {
        method: "POST",
        headers: {
            "User-Agent": USER_AGENT,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ code }),
        // signal: AbortSignal.timeout(5000), // optional timeout?
    });
    logToFile(`[vrc] verify response status=${res.status}`);

    const data = await readJsonSafe(res);
    if (!res.ok) {
        logToFile(`[vrc] verify failed: ${JSON.stringify(data)}`);
        return { ok: false as const, status: res.status, body: data };
    }

    // verify後に user を確認（ログイン完了状態になる）
    logToFile(`[vrc] fetching me`);
    const meRes = await f(`${VRC_BASE}/auth/user`, {
        method: "GET",
        headers: { "User-Agent": USER_AGENT },
    });
    logToFile(`[vrc] me response status=${meRes.status}`);

    const me = await readJsonSafe(meRes);
    if (!meRes.ok) {
        logToFile(`[vrc] me failed: ${JSON.stringify(me)}`);
        return { ok: false as const, status: meRes.status, body: me };
    }

    logToFile(`[vrc] saving sessions`);
    saveSessions();
    logToFile(`[vrc] 2FA success`);
    return { ok: true as const, user: me };
}

/** 自分の情報（ログイン生存確認用） */
export async function vrcGetMe(sid: string) {
    const { jar } = getSession(sid);
    const f = getAuthedFetch(jar);

    const res = await f(`${VRC_BASE}/auth/user`, {
        method: "GET",
        headers: { "User-Agent": USER_AGENT },
    });

    const data = await readJsonSafe(res);

    if (!res.ok) {
        return { ok: false as const, status: res.status, body: data };
    }

    saveSessions();
    return { ok: true as const, user: data };
}

/** 自分のアバター一覧 */
export async function vrcGetMyAvatars(sid: string, n = 50, offset = 0, sort = "updated", order = "descending") {
    const { jar } = getSession(sid);
    const f = getAuthedFetch(jar);

    const url =
        `${VRC_BASE}/avatars?ownerId=me&releaseStatus=all` +
        `&n=${encodeURIComponent(String(n))}` +
        `&offset=${encodeURIComponent(String(offset))}` +
        `&sort=${encodeURIComponent(sort)}` +
        `&order=${encodeURIComponent(order)}`;

    const res = await f(url, {
        method: "GET",
        headers: { "User-Agent": USER_AGENT },
    });

    const data = await readJsonSafe(res);
    if (!res.ok) return { ok: false as const, status: res.status, body: data };

    return { ok: true as const, avatars: data };
}

/** 自分のアバター総数 */
export async function vrcCountMyAvatars(sid: string) {
    const { jar } = getSession(sid);
    const f = getAuthedFetch(jar);

    let offset = 0;
    const n = 100;
    let total = 0;

    while (true) {
        const url =
            `${VRC_BASE}/avatars?ownerId=me&releaseStatus=all` +
            `&n=${n}&offset=${offset}`;

        const res = await f(url, {
            method: "GET",
            headers: { "User-Agent": USER_AGENT },
        });

        const data = await readJsonSafe(res);
        if (!res.ok) return { ok: false as const, status: res.status, body: data };

        total += data.length;
        if (data.length < n) break;

        offset += n;
    }

    return { ok: true as const, total };
}

/** アバターを選択（現在アバター変更） */
export async function vrcSelectAvatar(sid: string, avatarId: string) {
    const { jar } = getSession(sid);
    const f = getAuthedFetch(jar);

    const url = `${VRC_BASE}/avatars/${encodeURIComponent(avatarId)}/select`;

    const res = await f(url, {
        method: "PUT",
        headers: { "User-Agent": USER_AGENT },
    });

    const data = await readJsonSafe(res);
    if (!res.ok) return { ok: false as const, status: res.status, body: data };

    return { ok: true as const, body: data };
}
loadSessions();
