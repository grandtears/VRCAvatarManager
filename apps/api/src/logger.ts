import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const LOG_FILE = path.join(os.tmpdir(), "vam-debug.log");

export function logToFile(msg: string) {
    const time = new Date().toISOString();
    fs.appendFileSync(LOG_FILE, `[${time}] ${msg}\n`);
}
