import { app, BrowserWindow, ipcMain, shell } from 'electron';
import path from 'path';

import {
  NATIVE_IPC_CHANNEL,
  SECURE_VOLUME_IPC_CHANNEL,
  type SecureVolumeIdentity,
  type SecureVolumeUnlockPayload
} from '../shared/ipcChannels';
import {
  SecureVolumeManager,
  electronAppDirectory,
  resolvePnDesktopDataRoot
} from './secureVolume/SecureVolumeManager';

const isDev = !app.isPackaged || Boolean(process.env.VITE_DEV_SERVER_URL);

const portableDataRoot = resolvePnDesktopDataRoot();
app.setPath('userData', portableDataRoot);
console.log('[desktop] userData path set to', portableDataRoot);

let mainWindow: BrowserWindow | null = null;
const secureVolumeManager = new SecureVolumeManager();
const isAllowedExternalUrl = (target: string): boolean => {
  try {
    const parsed = new URL(target);
    if (parsed.protocol !== 'https:') return false;
    return parsed.hostname.endsWith('parnoir.com') || parsed.hostname === 'github.com';
  } catch {
    return false;
  }
};

const registerIpc = () => {
  ipcMain.handle(SECURE_VOLUME_IPC_CHANNEL.status, async () => {
    try {
      return await secureVolumeManager.getStatus();
    } catch (error) {
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

  ipcMain.handle(SECURE_VOLUME_IPC_CHANNEL.mount, async () => {
    try {
      return await secureVolumeManager.mount();
    } catch (error) {
      console.error('[desktop] Error mounting secure volume:', error);
      throw error;
    }
  });

  ipcMain.handle(SECURE_VOLUME_IPC_CHANNEL.unmount, async () => {
    try {
      return await secureVolumeManager.unmount();
    } catch (error) {
      console.error('[desktop] Error unmounting secure volume:', error);
      throw error;
    }
  });

  ipcMain.handle(SECURE_VOLUME_IPC_CHANNEL.unlock, async (_event, payload: SecureVolumeUnlockPayload) => {
    try {
      await secureVolumeManager.setUnlockContext(payload);
      return await secureVolumeManager.mount();
    } catch (error) {
      console.error('[desktop] Error unlocking secure volume:', error);
      throw error;
    }
  });

  ipcMain.handle(SECURE_VOLUME_IPC_CHANNEL.lock, async () => {
    try {
      await secureVolumeManager.clearUnlockContext();
      return await secureVolumeManager.getStatus();
    } catch (error) {
      console.error('[desktop] Error locking secure volume:', error);
      throw error;
    }
  });

  ipcMain.handle(SECURE_VOLUME_IPC_CHANNEL.hydrate, async (_event, identity: SecureVolumeIdentity) => {
    try {
      return await secureVolumeManager.hydrate(identity);
    } catch (error) {
      console.error('[desktop] Error hydrating secure volume:', error);
      throw error;
    }
  });

  ipcMain.handle(NATIVE_IPC_CHANNEL.openPath, async (_event, target: string) => {
    if (!target) {
      throw new Error('Missing target path');
    }
    const resolved = path.resolve(target);
    const status = await secureVolumeManager.getStatus();
    const mount = status.mountPoint ? path.resolve(status.mountPoint) : null;
    const underUserData = resolved.startsWith(path.resolve(app.getPath('userData')) + path.sep)
      || resolved === path.resolve(app.getPath('userData'));
    const underMount =
      mount != null && (resolved === mount || resolved.startsWith(mount + path.sep));
    if (!underUserData && !underMount) {
      throw new Error('Blocked unsafe path');
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
      sandbox: true
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
    if (isAllowedExternalUrl(details.url)) {
      void shell.openExternal(details.url);
    }
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
};

app.whenReady().then(async () => {
  secureVolumeManager
    .init({
      userDataPath: portableDataRoot,
      appPath: electronAppDirectory(app)
    })
    .catch((error) => {
      console.warn(
        '[desktop] Secure volume manager initialization failed (VeraCrypt may not be available):',
        error.message
      );
    });

  registerIpc();

  secureVolumeManager.unmount().catch(() => {
    // Ignore unmount errors on startup
  });

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
