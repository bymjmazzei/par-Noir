"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const isDev = !electron_1.app.isPackaged || Boolean(process.env.VITE_DEV_SERVER_URL);
let mainWindow = null;
const createWindow = async () => {
    mainWindow = new electron_1.BrowserWindow({
        width: 1280,
        height: 900,
        backgroundColor: '#000000',
        webPreferences: {
            preload: path_1.default.join(__dirname, '../preload/preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false
        }
    });
    if (process.env.VITE_DEV_SERVER_URL) {
        await mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
        mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
    else {
        const indexHtml = path_1.default.join(__dirname, '../../dist/index.html');
        await mainWindow.loadFile(indexHtml);
    }
    mainWindow.webContents.setWindowOpenHandler((details) => {
        electron_1.shell.openExternal(details.url);
        return { action: 'deny' };
    });
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
};
electron_1.app.whenReady().then(async () => {
    await createWindow();
    electron_1.app.on('activate', () => {
        if (electron_1.BrowserWindow.getAllWindows().length === 0) {
            void createWindow();
        }
    });
});
electron_1.app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        electron_1.app.quit();
    }
});
if (isDev) {
    const devServerUrl = process.env.VITE_DEV_SERVER_URL;
    if (!devServerUrl) {
        console.warn('[desktop] VITE_DEV_SERVER_URL not set; run "vite dev" for live reload.');
    }
}
