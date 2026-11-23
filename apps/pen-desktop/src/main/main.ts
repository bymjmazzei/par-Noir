import {
  app,
  BrowserWindow,
  ipcMain,
  shell,
  safeStorage,
  dialog,
  session,
  systemPreferences
} from 'electron';
import path from 'path';
import fs from 'fs';
import {
  SECURE_VOLUME_IPC_CHANNEL,
  type SecureVolumeUnlockPayload
} from '@par-noir/desktop-ipc';
import {
  SecureVolumeManager,
  electronAppDirectory,
  resolvePnDesktopDataRoot,
  penDraftPath,
  penMetaPath,
  penMediaPath,
  penMediaDir,
  penTreeRoot,
  isPathUnderPenTree,
  PEN_TREE_DIR
} from '@par-noir/desktop-secure-volume';

const PROTOCOL = 'com.parnoir.pen';
/** file:// Electron has no CORS Origin — stamp the hosted Pen origin for API calls. */
const PEN_API_ORIGIN = 'https://pen.parnoir.com';
const isDev = !app.isPackaged || Boolean(process.env.VITE_DEV_SERVER_URL);

const portableDataRoot = resolvePnDesktopDataRoot();
app.setPath('userData', portableDataRoot);
console.log('[pen-desktop] data root', portableDataRoot);

function registerApiOriginBridge(): void {
  session.defaultSession.webRequest.onBeforeSendHeaders(
    {
      urls: [
        'https://api.parnoir.com/*',
        'http://127.0.0.1:*/oauth/*',
        'http://localhost:*/oauth/*'
      ]
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
        headers.Origin = PEN_API_ORIGIN;
        delete headers.origin;
      }
      callback({ requestHeaders: headers });
    }
  );
}

let mainWindow: BrowserWindow | null = null;
let pendingDeepLink: string | null = null;
const secureVolumeManager = new SecureVolumeManager();

const vaultFilePath = () => path.join(app.getPath('userData'), 'pen-session-vault.json');

function readVaultStore(): Record<string, string> {
  try {
    const raw = fs.readFileSync(vaultFilePath(), 'utf8');
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return {};
  }
}

function writeVaultStore(store: Record<string, string>): void {
  fs.mkdirSync(path.dirname(vaultFilePath()), { recursive: true });
  fs.writeFileSync(vaultFilePath(), JSON.stringify(store), 'utf8');
}

function isVaultBiometricAvailable(): boolean {
  if (!safeStorage.isEncryptionAvailable()) return false;
  if (process.platform === 'darwin') return systemPreferences.canPromptTouchID();
  return true;
}

async function confirmVaultBiometric(reason: string): Promise<boolean> {
  const message = reason || 'Unlock your saved Pen session on this device?';
  if (process.platform === 'darwin') {
    try {
      await systemPreferences.promptTouchID(message);
      return true;
    } catch {
      return false;
    }
  }
  if (!mainWindow) return false;
  const result = await dialog.showMessageBox(mainWindow, {
    type: 'question',
    buttons: ['Unlock', 'Cancel'],
    defaultId: 0,
    cancelId: 1,
    title: 'par Noir Pen',
    message
  });
  return result.response === 0;
}

async function requireMount(): Promise<string> {
  const status = await secureVolumeManager.getStatus();
  if (!status.mounted || !status.mountPoint) {
    throw new Error('secure_volume_not_mounted');
  }
  return status.mountPoint;
}

function assertUnderPenTree(mount: string, candidate: string): void {
  if (!isPathUnderPenTree(mount, candidate)) {
    throw new Error('path_outside_pen_tree');
  }
}

function mediaIndexPath(mount: string): string {
  return path.join(penTreeRoot(mount), '_media-index.json');
}

type MediaIndex = Record<
  string,
  { docId: string; mime: string; driveFileId?: string; sealed?: boolean }
>;

function readMediaIndex(mount: string): MediaIndex {
  try {
    return JSON.parse(fs.readFileSync(mediaIndexPath(mount), 'utf8')) as MediaIndex;
  } catch {
    return {};
  }
}

function writeMediaIndex(mount: string, index: MediaIndex): void {
  fs.mkdirSync(penTreeRoot(mount), { recursive: true });
  fs.writeFileSync(mediaIndexPath(mount), JSON.stringify(index), 'utf8');
}

function penWebIndexHtml(): string {
  if (process.env.VITE_DEV_SERVER_URL) {
    return '';
  }
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'pen-web', 'index.html');
  }
  return path.join(__dirname, '../../../pen/dist/index.html');
}

function registerIpc(): void {
  ipcMain.handle('pen:vault-available', async () => isVaultBiometricAvailable());
  ipcMain.handle('pen:vault-get', async (_e, key: string) => {
    if (!isVaultBiometricAvailable()) return null;
    const store = readVaultStore();
    const enc = store[key];
    if (!enc) return null;
    try {
      return safeStorage.decryptString(Buffer.from(enc, 'base64'));
    } catch {
      return null;
    }
  });
  ipcMain.handle('pen:vault-set', async (_e, key: string, value: string) => {
    if (!isVaultBiometricAvailable()) throw new Error('vault_unavailable');
    const store = readVaultStore();
    store[key] = safeStorage.encryptString(value).toString('base64');
    writeVaultStore(store);
  });
  ipcMain.handle('pen:vault-remove', async (_e, key: string) => {
    const store = readVaultStore();
    delete store[key];
    writeVaultStore(store);
  });
  ipcMain.handle('pen:confirm-biometric', async (_e, reason: string) =>
    confirmVaultBiometric(String(reason || ''))
  );
  ipcMain.handle('pen:open-external', async (_e, url: string) => {
    if (typeof url !== 'string' || !url) return;
    // Prefer-app must open com.parnoir.unlock:// (and resume schemes). https alone
    // forced a fallback to the web Unlock popup from Electron file://.
    try {
      const parsed = new URL(url);
      const ok =
        parsed.protocol === 'https:' ||
        parsed.protocol === 'http:' ||
        parsed.protocol === 'com.parnoir.unlock:' ||
        parsed.protocol === 'com.parnoir.pen:' ||
        parsed.protocol === 'com.parnoir.browser:' ||
        parsed.protocol === 'com.parnoir.messaging:';
      if (!ok) return;
    } catch {
      return;
    }
    await shell.openExternal(url);
  });
  ipcMain.handle('pen:get-pending-deep-link', async () => pendingDeepLink);
  ipcMain.handle('pen:secure-volume-status', async () => secureVolumeManager.getStatus());
  ipcMain.handle('pen:secure-volume-unlock', async (_e, payload: SecureVolumeUnlockPayload) => {
    await secureVolumeManager.setUnlockContext(payload);
    return secureVolumeManager.mount();
  });
  // Also expose standard channels for parity with dashboard
  ipcMain.handle(SECURE_VOLUME_IPC_CHANNEL.status, async () => secureVolumeManager.getStatus());
  ipcMain.handle(SECURE_VOLUME_IPC_CHANNEL.unlock, async (_e, payload: SecureVolumeUnlockPayload) => {
    await secureVolumeManager.setUnlockContext(payload);
    return secureVolumeManager.mount();
  });

  ipcMain.handle(
    'pen:draft-write',
    async (
      _e,
      opts: { docId: string; draftBase64: string; meta: Record<string, unknown> }
    ) => {
      const mount = await requireMount();
      const draft = penDraftPath(mount, opts.docId);
      const meta = penMetaPath(mount, opts.docId);
      assertUnderPenTree(mount, draft);
      fs.mkdirSync(path.dirname(draft), { recursive: true });
      fs.writeFileSync(draft, Buffer.from(opts.draftBase64, 'base64'));
      fs.writeFileSync(meta, JSON.stringify(opts.meta, null, 2), 'utf8');
    }
  );

  ipcMain.handle('pen:draft-read', async (_e, docId: string) => {
    const mount = await requireMount();
    const draft = penDraftPath(mount, docId);
    const meta = penMetaPath(mount, docId);
    assertUnderPenTree(mount, draft);
    if (!fs.existsSync(draft)) return null;
    const draftBase64 = fs.readFileSync(draft).toString('base64');
    let metaJson = { docId, title: 'Untitled', updatedAt: '', custody: 'device' };
    try {
      metaJson = JSON.parse(fs.readFileSync(meta, 'utf8'));
    } catch {
      /* ignore */
    }
    return { draftBase64, meta: metaJson };
  });

  ipcMain.handle('pen:draft-list', async () => {
    const mount = await requireMount();
    const root = penTreeRoot(mount);
    if (!fs.existsSync(root)) return [];
    const out: unknown[] = [];
    for (const name of fs.readdirSync(root)) {
      if (name.startsWith('_')) continue;
      const metaFile = path.join(root, name, 'meta.json');
      if (!fs.existsSync(metaFile)) continue;
      try {
        out.push(JSON.parse(fs.readFileSync(metaFile, 'utf8')));
      } catch {
        /* ignore */
      }
    }
    return out;
  });

  ipcMain.handle('pen:draft-delete', async (_e, docId: string) => {
    const mount = await requireMount();
    const dir = path.join(penTreeRoot(mount), docId.replace(/[\/:*?"<>|]+/g, '_'));
    assertUnderPenTree(mount, dir);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  ipcMain.handle(
    'pen:media-write',
    async (
      _e,
      opts: {
        docId: string;
        mediaId: string;
        mime: string;
        base64: string;
        driveFileId?: string;
        sealed?: boolean;
      }
    ) => {
      const mount = await requireMount();
      const file = penMediaPath(mount, opts.docId, opts.mediaId);
      assertUnderPenTree(mount, file);
      fs.mkdirSync(penMediaDir(mount, opts.docId), { recursive: true });
      fs.writeFileSync(file, Buffer.from(opts.base64, 'base64'));
      const index = readMediaIndex(mount);
      index[opts.mediaId] = {
        docId: opts.docId,
        mime: opts.mime,
        driveFileId: opts.driveFileId,
        sealed: opts.sealed
      };
      writeMediaIndex(mount, index);
    }
  );

  ipcMain.handle('pen:media-read', async (_e, docId: string, mediaId: string) => {
    const mount = await requireMount();
    const file = penMediaPath(mount, docId, mediaId);
    assertUnderPenTree(mount, file);
    if (!fs.existsSync(file)) return null;
    const index = readMediaIndex(mount)[mediaId];
    return {
      mime: index?.mime || 'application/octet-stream',
      base64: fs.readFileSync(file).toString('base64'),
      driveFileId: index?.driveFileId,
      sealed: index?.sealed
    };
  });

  ipcMain.handle('pen:media-delete', async (_e, docId: string, mediaId: string) => {
    const mount = await requireMount();
    const file = penMediaPath(mount, docId, mediaId);
    assertUnderPenTree(mount, file);
    fs.rmSync(file, { force: true });
    const index = readMediaIndex(mount);
    delete index[mediaId];
    writeMediaIndex(mount, index);
  });

  ipcMain.handle('pen:media-list', async (_e, docId: string) => {
    const mount = await requireMount();
    const dir = penMediaDir(mount, docId);
    if (!fs.existsSync(dir)) return [];
    return fs
      .readdirSync(dir)
      .filter((n) => n.endsWith('.pnm1'))
      .map((n) => n.replace(/\.pnm1$/, ''));
  });

  ipcMain.handle('pen:media-get-by-id', async (_e, mediaId: string) => {
    const mount = await requireMount();
    const meta = readMediaIndex(mount)[mediaId];
    if (!meta) return null;
    const file = penMediaPath(mount, meta.docId, mediaId);
    if (!fs.existsSync(file)) return null;
    return {
      docId: meta.docId,
      mime: meta.mime,
      base64: fs.readFileSync(file).toString('base64'),
      driveFileId: meta.driveFileId,
      sealed: meta.sealed
    };
  });

  ipcMain.handle('pen:media-get-by-drive', async (_e, fileId: string) => {
    const mount = await requireMount();
    const index = readMediaIndex(mount);
    for (const [mediaId, meta] of Object.entries(index)) {
      if (meta.driveFileId !== fileId) continue;
      const file = penMediaPath(mount, meta.docId, mediaId);
      if (!fs.existsSync(file)) continue;
      return {
        docId: meta.docId,
        mediaId,
        mime: meta.mime,
        base64: fs.readFileSync(file).toString('base64')
      };
    }
    return null;
  });
}

function focusMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function handleDeepLink(url: string): void {
  pendingDeepLink = url;
  if (!mainWindow || mainWindow.isDestroyed()) return;
  focusMainWindow();
  mainWindow.webContents.send('pen:deep-link', url);
  // Prefer-app wake: Unlock opens com.parnoir.pen://oauth/resume after broker-complete.
  // Renderer flushes broker-pending poll — do not navigate away from the waiting document.
  if (url.includes('oauth/resume')) {
    return;
  }
  if (url.includes('oauth-callback') || url.includes('code=')) {
    try {
      const u = new URL(url.replace(`${PROTOCOL}://`, 'https://pen.local/'));
      const code = u.searchParams.get('code');
      if (code) {
        // Query must stay on the document URL (not the hash) so App can read
        // location.search under HashRouter.
        if (process.env.VITE_DEV_SERVER_URL) {
          const base = process.env.VITE_DEV_SERVER_URL.replace(/\/$/, '');
          void mainWindow.loadURL(
            `${base}/?oauth_resume=1&code=${encodeURIComponent(code)}`
          );
        } else {
          void mainWindow.loadFile(penWebIndexHtml(), {
            query: { oauth_resume: '1', code }
          });
        }
      }
    } catch {
      /* ignore */
    }
  }
}

const createWindow = async () => {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    backgroundColor: '#ffffff',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });

  mainWindow.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.error('[pen-desktop] did-fail-load', { code, desc, url });
  });

  try {
    if (process.env.VITE_DEV_SERVER_URL) {
      await mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    } else {
      await mainWindow.loadFile(penWebIndexHtml());
    }
  } catch (err) {
    console.error('[pen-desktop] load failed', err);
    mainWindow.show();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
};

if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [path.resolve(process.argv[1]!)]);
  }
} else {
  app.setAsDefaultProtocolClient(PROTOCOL);
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    const url = argv.find((a) => a.startsWith(`${PROTOCOL}://`));
    if (url) handleDeepLink(url);
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
      return;
    }
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    registerApiOriginBridge();
    registerIpc();
    // Show UI first; secure volume can init in the background.
    void secureVolumeManager
      .init({
        userDataPath: portableDataRoot,
        appPath: electronAppDirectory(app)
      })
      .catch((err) => {
        console.warn('[pen-desktop] secure volume init failed', err?.message || err);
      });
    await createWindow();
    const bootUrl = process.argv.find((a) => a.startsWith(`${PROTOCOL}://`));
    if (bootUrl) handleDeepLink(bootUrl);
  });
}

app.on('open-url', (event, url) => {
  event.preventDefault();
  handleDeepLink(url);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  void secureVolumeManager.unmount().catch(() => undefined);
});

void PEN_TREE_DIR;
