import crypto from "node:crypto";
import { logToFile } from "./logger.ts";

const ALGORITHM = "aes-256-gcm";
const SECRET_KEY_HEX = process.env.VAM_SECRET;

/**
 * 暗号化可能かどうか（鍵があるか）
 */
export function isEncryptionAvailable() {
    return !!SECRET_KEY_HEX && SECRET_KEY_HEX.length === 64; // 32 bytes = 64 hex chars
}

/**
 * 文字列を暗号化する
 * 形式: iv(hex):authTag(hex):encrypted(hex)
 */
export function encrypt(text: string): string {
    if (!isEncryptionAvailable()) {
        throw new Error("Encryption key is not available");
    }

    try {
        const key = Buffer.from(SECRET_KEY_HEX!, "hex");
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

        let encrypted = cipher.update(text, "utf8", "hex");
        encrypted += cipher.final("hex");

        const authTag = cipher.getAuthTag();

        return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
    } catch (e) {
        logToFile(`[Encryption] Encrypt failed: ${e}`);
        throw e;
    }
}

/**
 * 文字列を復号する
 */
export function decrypt(text: string): string {
    if (!isEncryptionAvailable()) {
        throw new Error("Encryption key is not available");
    }

    try {
        // 形式チェック (簡易)
        const parts = text.split(":");
        if (parts.length !== 3) {
            throw new Error("Invalid encrypted format");
        }

        const [ivHex, authTagHex, encryptedHex] = parts;

        const key = Buffer.from(SECRET_KEY_HEX!, "hex");
        const iv = Buffer.from(ivHex, "hex");
        const authTag = Buffer.from(authTagHex, "hex");

        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
        decipher.setAuthTag(authTag);

        let decrypted = decipher.update(encryptedHex, "hex", "utf8");
        decrypted += decipher.final("utf8");

        return decrypted;
    } catch (e) {
        logToFile(`[Encryption] Decrypt failed: ${e}`);
        throw e;
    }
}
