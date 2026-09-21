import { app, BrowserWindow, ipcMain, shell, safeStorage, dialog, session } from 'electron';
import path from 'path';
import fs from 'fs';

const PROTOCOL = 'com.parnoir.unlock';
/** Canonical unlock broker origin — file:// / localhost Electron has no CORS Origin. */
const UNLOCK_BROKER_ORIGIN = 'https://unlock.parnoir.com';
const isDev = !app.isPackaged || Boolean(process.env.VITE_DEV_SERVER_URL);

/**
 * file:// and vite-dev origins omit or send a non-allowlisted Origin; production API
 * requires Origin. Desktop Unlock is the same broker as unlock.parnoir.com — stamp that.
 */
function registerApiOriginBridge(): void {
  session.defaultSession.webRequest.onBeforeSendHeaders(
    {
      urls: [
        'https://api.parnoir.com/*',
        'http://127.0.0.1:*/oauth/*',
        'http://localhost:*/oauth/*',
      ],
    },
    (details, callback) => {
      const headers = { ...details.requestHeaders };
      const existing = String(headers.Origin || headers.origin || '');
      const needsStamp =
        !existing ||
        existing === 'null' ||
        existing.startsWith('file:') ||
        existing.startsWith('http://127.0.0.1') ||
        existing.startsWith('http://localhost');
      if (needsStamp) {
        headers.Origin = UNLOCK_BROKER_ORIGIN;
        delete headers.origin;
      }
      callback({ requestHeaders: headers });
    }
  );
}

let mainWindow: BrowserWindow | null = null;
let pendingDeepLink: string | null = null;

const vaultFilePath = () => path.join(app.getPath('userData'), 'unlock-session-vault.json');

type VaultDisk = Record<string, string>;

function readVaultDisk(): VaultDisk {
  try {
    const raw = fs.readFileSync(vaultFilePath(), 'utf8');
    const parsed = JSON.parse(raw) as VaultDisk;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeVaultDisk(data: VaultDisk): void {
  fs.mkdirSync(path.dirname(vaultFilePath()), { recursive: true });
  fs.writeFileSync(vaultFilePath(), JSON.stringify(data), 'utf8');
}

function isAllowedExternalUrl(target: string): boolean {
  try {
    const parsed = new URL(target);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
    // Allow localhost for local QA + parnoir.com production callbacks
    if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') return true;
    return parsed.hostname.endsWith('parnoir.com');
  } catch {
    return false;
  }
}

function sendDeepLink(url: string): void {
  pendingDeepLink = url;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('unlock:deep-link', url);
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
}

function extractDeepLinkFromArgv(argv: string[]): string | null {
  for (const arg of argv) {
    if (typeof arg === 'string' && arg.startsWith(`${PROTOCOL}:`)) return arg;
  }
  return null;
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 480,
    height: 720,
    minWidth: 400,
    minHeight: 560,
    title: 'par Noir Unlock',
    backgroundColor: '#000000',
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    void mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.on('did-finish-load', () => {
    if (pendingDeepLink) {
      mainWindow?.webContents.send('unlock:deep-link', pendingDeepLink);
    }
  });
}

function registerIpc(): void {
  ipcMain.handle('unlock:open-external', async (_e, url: string) => {
    if (!isAllowedExternalUrl(url)) {
      throw new Error('Blocked external URL');
    }
    await shell.openExternal(url);
  });

  ipcMain.handle('unlock:get-pending-deep-link', async () => pendingDeepLink);

  ipcMain.handle('unlock:vault-available', async () => {
    return safeStorage.isEncryptionAvailable();
  });

  ipcMain.handle('unlock:vault-get', async (_e, key: string) => {
    if (!key || typeof key !== 'string') return null;
    const disk = readVaultDisk();
    const enc = disk[key];
    if (!enc) return null;
    try {
      if (!safeStorage.isEncryptionAvailable()) return null;
      return safeStorage.decryptString(Buffer.from(enc, 'base64'));
    } catch {
      return null;
    }
  });

  ipcMain.handle('unlock:vault-set', async (_e, key: string, value: string) => {
    if (!key || typeof key !== 'string' || typeof value !== 'string') {
      throw new Error('Invalid vault write');
    }
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('OS secure storage unavailable');
    }
    const enc = safeStorage.encryptString(value).toString('base64');
    const disk = readVaultDisk();
    disk[key] = enc;
    writeVaultDisk(disk);
  });

  ipcMain.handle('unlock:vault-remove', async (_e, key: string) => {
    if (!key || typeof key !== 'string') return;
    const disk = readVaultDisk();
    delete disk[key];
    writeVaultDisk(disk);
  });

  ipcMain.handle('unlock:confirm-biometric', async (_e, reason: string) => {
    if (!mainWindow) return false;
    const result = await dialog.showMessageBox(mainWindow, {
      type: 'question',
      buttons: ['Unlock', 'Cancel'],
      defaultId: 0,
      cancelId: 1,
      title: 'par Noir Unlock',
      message: reason || 'Unlock your saved pN session on this device?',
    });
    return result.response === 0;
  });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    const link = extractDeepLinkFromArgv(argv);
    if (link) sendDeepLink(link);
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [path.resolve(process.argv[1])]);
    }
  } else {
    app.setAsDefaultProtocolClient(PROTOCOL);
  }

  app.on('open-url', (event, url) => {
    event.preventDefault();
    sendDeepLink(url);
  });

  app.whenReady().then(() => {
    registerApiOriginBridge();
    registerIpc();
    createWindow();
    const fromArgv = extractDeepLinkFromArgv(process.argv);
    if (fromArgv) sendDeepLink(fromArgv);

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
