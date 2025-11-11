import { app, BrowserWindow, ipcMain, shell } from 'electron';
import path from 'path';

import { NATIVE_IPC_CHANNEL, SECURE_VOLUME_IPC_CHANNEL, type SecureVolumeIdentity, type SecureVolumeMountState, type SecureVolumeUnlockPayload } from '../shared/ipcChannels';
import { SecureVolumeManager } from './secureVolume/SecureVolumeManager';

const isDev = !app.isPackaged || Boolean(process.env.VITE_DEV_SERVER_URL);

let mainWindow: BrowserWindow | null = null;
const secureVolumeManager = new SecureVolumeManager();

const registerIpc = () => {
  ipcMain.handle(SECURE_VOLUME_IPC_CHANNEL.status, async () => {
    return secureVolumeManager.getStatus();
  });

  ipcMain.handle(SECURE_VOLUME_IPC_CHANNEL.mount, async () => {
    return secureVolumeManager.mount();
  });

  ipcMain.handle(SECURE_VOLUME_IPC_CHANNEL.unmount, async () => {
    return secureVolumeManager.unmount();
  });

  ipcMain.handle(SECURE_VOLUME_IPC_CHANNEL.unlock, async (_event, payload: SecureVolumeUnlockPayload) => {
    await secureVolumeManager.setUnlockContext(payload);
    return secureVolumeManager.mount();
  });

  ipcMain.handle(SECURE_VOLUME_IPC_CHANNEL.lock, async () => {
    await secureVolumeManager.clearUnlockContext();
    return secureVolumeManager.getStatus();
  });

  ipcMain.handle(SECURE_VOLUME_IPC_CHANNEL.hydrate, async (_event, identity: SecureVolumeIdentity) => {
    return secureVolumeManager.hydrate(identity);
  });

  ipcMain.handle(NATIVE_IPC_CHANNEL.openPath, async (_event, target: string) => {
    if (!target) {
      throw new Error('Missing target path');
    }
    return shell.openPath(target);
  });
};

const createWindow = async () => {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    backgroundColor: '#000000',
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    }
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    await mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    const indexHtml = path.join(__dirname, '../../dist/index.html');
    await mainWindow.loadFile(indexHtml);
  }

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
};

app.whenReady().then(async () => {
  await secureVolumeManager.init();
  registerIpc();
  await secureVolumeManager.unmount();
  await createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
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

