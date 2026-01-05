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

async function createWindow() {
    const port = await findPort();
    // Preload script access this env
    process.env.VAM_API_PORT = port.toString();

    if (app.isPackaged) {
        // Production Mode: Spawn bundled API server
        const serverPath = path.join(process.resourcesPath, "api", "server.js");

        // Portable Data Path: Next to the executable
        // Note: If installed in Program Files, this might fail due to perm permissions.
        // But for 'portable' target, usually user places it in a writeable folder.
        const exeDir = path.dirname(process.execPath);
        const sessionFile = path.join(exeDir, "vrc-avatar-manager-sessions.json");
        const webDir = path.join(__dirname, "web");

        apiProcess = spawn(process.execPath, [serverPath], {
            env: {
                ...process.env,
                PORT: port.toString(),
                VAM_SESSION_FILE: sessionFile,
                VAM_WEB_DIR: webDir,
                ELECTRON_RUN_AS_NODE: "1"
            },
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