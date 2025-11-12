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
    let baseCandidate;
    if (override && override.length > 0) {
        baseCandidate = path_1.default.resolve(override);
    }
    else if (electron_1.app.isPackaged) {
        // In packaged mode, use directory containing the executable
        baseCandidate = path_1.default.resolve(path_1.default.dirname(electron_1.app.getPath('exe')), 'data');
    }
    else {
        // In dev mode, use directory next to app
        baseCandidate = path_1.default.resolve(electron_1.app.getAppPath(), '..', 'data');
    }
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
        try {
            return await secureVolumeManager.getStatus();
        }
        catch (error) {
            console.error('[desktop] Error getting secure volume status:', error);
            return {
                mounted: false,
                mountPoint: null,
                platform: process.platform,
                driver: 'veracrypt',
                bundleExists: false
            };
        }
    });
    electron_1.ipcMain.handle(ipcChannels_1.SECURE_VOLUME_IPC_CHANNEL.mount, async () => {
        try {
            return await secureVolumeManager.mount();
        }
        catch (error) {
            console.error('[desktop] Error mounting secure volume:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle(ipcChannels_1.SECURE_VOLUME_IPC_CHANNEL.unmount, async () => {
        try {
            return await secureVolumeManager.unmount();
        }
        catch (error) {
            console.error('[desktop] Error unmounting secure volume:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle(ipcChannels_1.SECURE_VOLUME_IPC_CHANNEL.unlock, async (_event, payload) => {
        try {
            await secureVolumeManager.setUnlockContext(payload);
            return await secureVolumeManager.mount();
        }
        catch (error) {
            console.error('[desktop] Error unlocking secure volume:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle(ipcChannels_1.SECURE_VOLUME_IPC_CHANNEL.lock, async () => {
        try {
            await secureVolumeManager.clearUnlockContext();
            return await secureVolumeManager.getStatus();
        }
        catch (error) {
            console.error('[desktop] Error locking secure volume:', error);
            throw error;
        }
    });
    electron_1.ipcMain.handle(ipcChannels_1.SECURE_VOLUME_IPC_CHANNEL.hydrate, async (_event, identity) => {
        try {
            return await secureVolumeManager.hydrate(identity);
        }
        catch (error) {
            console.error('[desktop] Error hydrating secure volume:', error);
            throw error;
        }
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
    // Initialize secure volume manager, but don't block app startup if VeraCrypt isn't found
    secureVolumeManager.init().catch((error) => {
        console.warn('[desktop] Secure volume manager initialization failed (VeraCrypt may not be available):', error.message);
    });
    registerIpc();
    // Try to unmount any existing volumes, but don't fail if it errors
    secureVolumeManager.unmount().catch(() => {
        // Ignore unmount errors on startup
    });
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
