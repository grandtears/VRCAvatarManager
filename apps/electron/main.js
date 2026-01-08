const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let apiProcess = null;

async function findPort() {
    try {
        const { default: getPort } = await import('get-port');
        return await getPort({ port: 8787 });
    } catch (e) {
        return 8787;
    }
}


/**
 * 安全なランダムキー（32バイト＝256ビット）を生成し、
 * safeStorageで暗号化して保存するか、既存のものを復号する。
 * 成功すれば16進文字列のキーを返す。
 */
async function getOrInitSecret(dataDir) {
    const { safeStorage } = require('electron');
    const fs = require('fs');

    // safeStorageが使えない環境（一部Linuxなど）への対処は今回は省略（エラーになる）
    if (!safeStorage.isEncryptionAvailable()) {
        console.warn("safeStorage is NOT available. Sessions will be saved in plain text.");
        return null;
    }

    const secretFile = path.join(dataDir, "vrc-avatar-manager-secret.key");

    if (fs.existsSync(secretFile)) {
        // 既存キーのロード
        try {
            const encryptedParams = fs.readFileSync(secretFile);
            // safeStorage.decryptString は Buffer を受け取ってUTF8文字列を返す想定だが
            // 暗号化されたバイナリを扱うため decryptString ではなく decryptBuffer を使う方が安全かもしれないが
            // ドキュメント上 decryptString は Buffer を取れる。
            // ここでは hex 文字列として保存していたと仮定して読み書きする形にするのが安全
            const decrypted = safeStorage.decryptString(encryptedParams);
            return decrypted;
        } catch (e) {
            console.error("Failed to decrypt master key:", e);
            // 復号失敗＝キー無効化。再生成すると旧セッションは読めなくなるが、アプリは起動できるようにする？
            // ここではnullを返して平文動作にフォールバック、あるいは再生成
            return null;
        }
    } else {
        // 新規生成
        const { randomBytes } = require('crypto');
        const newKey = randomBytes(32).toString('hex'); // 64 chars

        try {
            const encrypted = safeStorage.encryptString(newKey);
            fs.writeFileSync(secretFile, encrypted);
            return newKey;
        } catch (e) {
            console.error("Failed to encrypt/save master key:", e);
            return null;
        }
    }
}

async function createWindow() {
    const port = await findPort();
    // Preload script access this env
    process.env.VAM_API_PORT = port.toString();

    if (app.isPackaged) {
        // Production Mode: Spawn bundled API server
        const serverPath = path.join(process.resourcesPath, "api", "server.js");

        // Portable Data Path:
        // 1. If running as portable (NSIS), use the directory where the exe is located (before extraction temp)
        // 2. Fallback to standard userData (AppData) if not portable specific
        let dataDir = process.env.PORTABLE_EXECUTABLE_DIR;
        if (!dataDir) {
            // Fallback: use userData (AppData/Roaming/...)
            dataDir = app.getPath('userData');
        }

        const sessionFile = path.join(dataDir, "vrc-avatar-manager-sessions.json");
        const settingsFile = path.join(dataDir, "vrc-avatar-manager-settings.json");
        const webDir = path.join(__dirname, "web");

        // マスターキー準備
        const secretKey = await getOrInitSecret(dataDir);
        const envParams = {
            ...process.env,
            PORT: port.toString(),
            VAM_SESSION_FILE: sessionFile,
            VAM_SETTINGS_FILE: settingsFile,
            VAM_WEB_DIR: webDir,
            ELECTRON_RUN_AS_NODE: "1"
        };

        if (secretKey) {
            envParams.VAM_SECRET = secretKey;
        }

        apiProcess = spawn(process.execPath, [serverPath], {
            env: envParams,
            stdio: 'ignore' // 'inherit' causes blocking on Windows GUI apps without console
        });

    }

    const win = new BrowserWindow({
        width: 1280,
        height: 900,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
        },
        autoHideMenuBar: true,
        backgroundColor: "#eff6ff",
        title: "VRC Avatar Manager"
    });

    if (app.isPackaged) {
        // Production: Load from API server (same origin for cookies)
        // Wait for the server to be ready
        const apiUrl = `http://localhost:${port}`;
        let ready = false;
        for (let i = 0; i < 50; i++) {
            try {
                const res = await fetch(`${apiUrl}/health`);
                if (res.ok) { ready = true; break; }
            } catch (e) { /* server not ready */ }
            await new Promise(r => setTimeout(r, 100));
        }
        win.loadURL(apiUrl);
    } else {
        // Dev Mode
        win.loadURL('http://localhost:5173');
        win.webContents.openDevTools();
    }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
    if (apiProcess) {
        apiProcess.kill();
    }
});