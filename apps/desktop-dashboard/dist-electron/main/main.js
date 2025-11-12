"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const ipcChannels_1 = require("../shared/ipcChannels");
const SecureVolumeManager_1 = require("./secureVolume/SecureVolumeManager");
const isDev = !electron_1.app.isPackaged || Boolean(process.env.VITE_DEV_SERVER_URL);
const resolveDataRoot = () => {
    const override = process.env.PN_DATA_ROOT?.trim();
    const baseCandidate = override && override.length > 0
        ? path_1.default.resolve(override)
        : path_1.default.resolve(electron_1.app.getAppPath(), '..', 'data');
    try {
        fs_1.default.mkdirSync(baseCandidate, { recursive: true });
    }
    catch (error) {
        console.warn('[desktop] Failed to create portable data root at', baseCandidate, error);
    }
    electron_1.app.setPath('userData', baseCandidate);
    return baseCandidate;
};
const portableDataRoot = resolveDataRoot();
console.log('[desktop] userData path set to', portableDataRoot);
let mainWindow = null;
const secureVolumeManager = new SecureVolumeManager_1.SecureVolumeManager();
const registerIpc = () => {
    electron_1.ipcMain.handle(ipcChannels_1.SECURE_VOLUME_IPC_CHANNEL.status, async () => {
        return secureVolumeManager.getStatus();
    });
    electron_1.ipcMain.handle(ipcChannels_1.SECURE_VOLUME_IPC_CHANNEL.mount, async () => {
        return secureVolumeManager.mount();
    });
    electron_1.ipcMain.handle(ipcChannels_1.SECURE_VOLUME_IPC_CHANNEL.unmount, async () => {
        return secureVolumeManager.unmount();
    });
    electron_1.ipcMain.handle(ipcChannels_1.SECURE_VOLUME_IPC_CHANNEL.unlock, async (_event, payload) => {
        await secureVolumeManager.setUnlockContext(payload);
        return secureVolumeManager.mount();
    });
    electron_1.ipcMain.handle(ipcChannels_1.SECURE_VOLUME_IPC_CHANNEL.lock, async () => {
        await secureVolumeManager.clearUnlockContext();
        return secureVolumeManager.getStatus();
    });
    electron_1.ipcMain.handle(ipcChannels_1.SECURE_VOLUME_IPC_CHANNEL.hydrate, async (_event, identity) => {
        return secureVolumeManager.hydrate(identity);
    });
    electron_1.ipcMain.handle(ipcChannels_1.NATIVE_IPC_CHANNEL.openPath, async (_event, target) => {
        if (!target) {
            throw new Error('Missing target path');
        }
        return electron_1.shell.openPath(target);
    });
};
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
    await secureVolumeManager.init();
    registerIpc();
    await secureVolumeManager.unmount();
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
electron_1.app.on('before-quit', () => {
    void secureVolumeManager.unmount().catch((error) => {
        console.warn('[desktop] Failed to unmount secure volume during quit', error);
    });
});
if (isDev) {
    const devServerUrl = process.env.VITE_DEV_SERVER_URL;
    if (!devServerUrl) {
        console.warn('[desktop] VITE_DEV_SERVER_URL not set; run "vite dev" for live reload.');
    }
}
