const { contextBridge } = require('electron');

// main process sets VAM_API_PORT in process.env
const port = process.env.VAM_API_PORT || '8787';
const apiUrl = `http://localhost:${port}`;

contextBridge.exposeInMainWorld('VAM_API_URL', apiUrl);
