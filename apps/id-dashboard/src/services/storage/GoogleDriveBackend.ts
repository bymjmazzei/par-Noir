/**
 * Google Drive Storage Backend — API-only.
 * All Drive I/O goes through par Noir /api/drive/* via ownerFetch/ownerGet.
 * Credential vault mint / refresh remains in @par-noir/device-cloud-credentials.
 */
import { AbstractStorageBackend } from './StorageBackend';
import {
  StorageFile,
  StorageQuota,
  StorageUserInfo,
  StorageBackendConfig
} from '../../types/aggregator';
import {
  isAccessTokenFresh,
  refreshDriveAccessToken,
  type GoogleAccountRow
} from '@par-noir/device-cloud-credentials';
import { IntegrationCredentialManager } from '../../utils/integrationCredentialManager';
import { getStoredToken } from '../parNoirOAuthInline';
import {
  ownerFetch,
  ownerGet,
  getOwnerApiPnIdentifier,
  type OwnerFetchInit
} from '../ownerApiService';

export interface DriveInventoryItem {
  fileId: string;
  name: string;
  path: string;
  mimeType: string;
  isFolder: boolean;
}

const PN_CLOUD_ACCESS_TOKEN_HEADER = 'X-PN-Cloud-Access-Token';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

type DriveApiFile = {
  id?: string;
  name?: string;
  mimeType?: string;
  size?: string | number;
  modifiedTime?: string;
  parents?: string[];
};

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  return bytesToBase64(new Uint8Array(buf));
}

export class GoogleDriveBackend extends AbstractStorageBackend {
  private token: string | null = null;
  private refreshToken: string | null = null;
  /** Epoch ms when access token should be treated as expired (with skew). */
  private tokenExpiresAt: number | null = null;
  private userEmail: string | null = null;
  private parNoirFolderId: string | null = null;
  private pnFolderCache: Map<string, string> = new Map();
  private keyPrefix: string;
  private connected = false;
  private apiEndpoint: string | null = null;
  private getOwnerApiToken: (() => string | null) | null = null;
  private backendId: string;
  private refreshPromise: Promise<string | null> | null = null;
  /** After HTTP 429, skip refresh attempts until this epoch ms. */
  private refreshBackoffUntilMs = 0;

  private loadFolderCache(): void {
    try {
      const cached = localStorage.getItem(`${this.keyPrefix}_folder_cache`);
      if (cached) {
        const cacheData = JSON.parse(cached);
        let validEntries = 0;
        Object.entries(cacheData).forEach(([key, value]) => {
          if (key.match(/^pn-[a-f0-9]{12}$/)) {
            this.pnFolderCache.set(key, value as string);
            validEntries++;
          }
        });
        if (validEntries !== Object.keys(cacheData).length) {
          this.saveFolderCache();
        }
      }
    } catch (e) {
      console.warn('Failed to load folder cache:', e);
    }
  }

  public clearFolderCache(pnIdentifier: string): void {
    this.pnFolderCache.delete(pnIdentifier);
    this.saveFolderCache();
  }

  private saveFolderCache(): void {
    try {
      const cacheData: Record<string, string> = {};
      this.pnFolderCache.forEach((value, key) => {
        cacheData[key] = value;
      });
      localStorage.setItem(`${this.keyPrefix}_folder_cache`, JSON.stringify(cacheData));

      if (this.pnFolderCache.size > 0) {
        const lastFolderId = Array.from(this.pnFolderCache.values())[0];
        localStorage.setItem(`${this.keyPrefix}_last_folder_id`, lastFolderId);
      }
    } catch (e) {
      console.warn('Failed to save folder cache:', e);
    }
  }

  constructor(
    config?: Partial<StorageBackendConfig> & {
      storageKeyPrefix?: string;
      apiEndpoint?: string;
      getOwnerApiToken?: () => string | null;
    }
  ) {
    const prefix = config?.storageKeyPrefix || 'google_drive';
    super({
      id: config?.id || prefix,
      name: config?.name || 'Google Drive',
      type: 'google_drive',
      ...config
    });
    this.keyPrefix = prefix;
    this.apiEndpoint = config?.apiEndpoint || null;
    this.getOwnerApiToken = config?.getOwnerApiToken ?? null;
    this.backendId = config?.id || prefix;

    try {
      this.loadFolderCache();
      try {
        const lastFolderId = localStorage.getItem(`${this.keyPrefix}_last_folder_id`);
        if (lastFolderId) {
          this.parNoirFolderId = lastFolderId;
        }
      } catch {
        /* localStorage unavailable */
      }
    } catch {
      /* localStorage unavailable */
    }
  }

  async connect(credentials: {
    token: string;
    email?: string;
    refreshToken?: string;
    sessionId?: string;
    expiresAt?: number;
  }): Promise<void> {
    const sameToken = !!credentials.token && this.token === credentials.token;
    const previousExpiresAt = this.tokenExpiresAt;
    this.token = credentials.token;
    this.refreshToken = credentials.refreshToken || null;
    this.userEmail = credentials.email || null;
    if (typeof credentials.expiresAt === 'number' && Number.isFinite(credentials.expiresAt)) {
      this.tokenExpiresAt =
        credentials.expiresAt < 1e12 ? credentials.expiresAt * 1000 : credentials.expiresAt;
    } else if (
      sameToken &&
      previousExpiresAt != null &&
      Number.isFinite(previousExpiresAt) &&
      Date.now() < previousExpiresAt - 60_000
    ) {
      this.tokenExpiresAt = previousExpiresAt;
    } else {
      this.tokenExpiresAt = null;
    }

    if (credentials.sessionId) {
      try {
        await IntegrationCredentialManager.storeCredentials(
          this.backendId,
          {
            accessToken: credentials.token,
            refreshToken: credentials.refreshToken || undefined,
            email: credentials.email,
            ...(this.tokenExpiresAt != null ? { expiresAt: this.tokenExpiresAt } : {})
          },
          credentials.sessionId
        );
      } catch (error) {
        console.error('[GoogleDriveBackend] Failed to store encrypted credentials:', error);
        console.warn(
          '[GoogleDriveBackend] Storing credentials in memory only - will be lost on refresh'
        );
      }
    }

    try {
      localStorage.removeItem(`${this.keyPrefix}_token`);
      localStorage.removeItem(`${this.keyPrefix}_email`);
      localStorage.removeItem(`${this.keyPrefix}_refresh_token`);
    } catch {
      /* ignore */
    }

    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.token = null;
    this.refreshToken = null;
    this.tokenExpiresAt = null;
    this.userEmail = null;
    this.parNoirFolderId = null;
    this.clearAllFolderCache();

    try {
      localStorage.removeItem(`${this.keyPrefix}_token`);
      localStorage.removeItem(`${this.keyPrefix}_email`);
      localStorage.removeItem(`${this.keyPrefix}_refresh_token`);
    } catch {
      /* ignore */
    }

    try {
      await IntegrationCredentialManager.removeCredentials(this.backendId);
    } catch (e) {
      console.warn('[GoogleDriveBackend] Failed to remove encrypted credentials on disconnect:', e);
    }

    this.connected = false;
  }

  clearAllFolderCache(): void {
    this.pnFolderCache.clear();
    try {
      localStorage.removeItem(`${this.keyPrefix}_folder_cache`);
      localStorage.removeItem(`${this.keyPrefix}_last_folder_id`);
    } catch {
      /* ignore */
    }
  }

  isConnected(): boolean {
    return this.connected && !!this.token;
  }

  getAccessToken(): string | null {
    if (!this.token) return null;
    if (isAccessTokenFresh(this.accountRow())) return this.token;
    return null;
  }

  private accountRow(): GoogleAccountRow {
    return {
      access_token: this.token ?? undefined,
      refresh_token: this.refreshToken ?? undefined,
      expires_at: this.tokenExpiresAt ?? undefined
    };
  }

  private clearDeadToken(): void {
    this.token = null;
    this.tokenExpiresAt = null;
  }

  /**
   * Return a usable Google access token, refreshing via the par Noir API when
   * the current token is missing or near expiry.
   */
  async ensureAccessToken(): Promise<string | null> {
    if (!this.connected) {
      return null;
    }

    if (this.token && isAccessTokenFresh(this.accountRow())) {
      return this.token;
    }

    const refreshToken = this.getRefreshToken();
    if (!refreshToken) {
      this.clearDeadToken();
      return null;
    }

    const ownerToken = this.resolveOwnerApiToken();
    if (!this.apiEndpoint || !ownerToken) {
      this.clearDeadToken();
      return null;
    }

    if (Date.now() < this.refreshBackoffUntilMs) {
      this.clearDeadToken();
      return null;
    }

    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = this.mintAccessToken(refreshToken, ownerToken);
    try {
      return await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  private async mintAccessToken(refreshToken: string, ownerToken: string): Promise<string | null> {
    const result = await refreshDriveAccessToken({
      refreshToken,
      authToken: ownerToken,
      apiEndpoint: this.apiEndpoint!,
      path: 'GoogleDriveBackend.ensureAccessToken'
    });

    if (!result.token) {
      if (result.reason === 'refresh_rejected') {
        this.refreshBackoffUntilMs = Date.now() + 60_000;
      }
      this.clearDeadToken();
      return null;
    }

    this.token = result.token;
    this.tokenExpiresAt = result.expiresAt ?? null;
    this.refreshBackoffUntilMs = 0;

    window.dispatchEvent(
      new CustomEvent('google-drive-token-refreshed', {
        detail: {
          backendId: this.backendId,
          accessToken: result.token,
          refreshToken: this.refreshToken ?? refreshToken,
          email: this.userEmail,
          expiresAt: this.tokenExpiresAt ?? undefined
        }
      })
    );

    return result.token;
  }

  async loadEncryptedCredentials(sessionId: string): Promise<boolean> {
    try {
      const credentials = await IntegrationCredentialManager.getCredentials(
        this.backendId,
        sessionId
      );

      if (credentials && credentials.accessToken) {
        this.token = credentials.accessToken;
        this.refreshToken = credentials.refreshToken || null;
        this.userEmail = credentials.email || null;
        this.tokenExpiresAt =
          typeof credentials.expiresAt === 'number' && Number.isFinite(credentials.expiresAt)
            ? credentials.expiresAt < 1e12
              ? credentials.expiresAt * 1000
              : credentials.expiresAt
            : null;
        this.connected = true;
        return true;
      }
      return false;
    } catch (error) {
      console.error('[GoogleDriveBackend] Failed to load encrypted credentials:', error);
      return false;
    }
  }

  getRefreshToken(): string | null {
    if (this.refreshToken) {
      return this.refreshToken;
    }
    return null;
  }

  getStorageKeyPrefix(): string {
    return this.keyPrefix;
  }

  private resolveOwnerApiToken(): string | null {
    return this.getOwnerApiToken?.() ?? getStoredToken()?.accessToken ?? null;
  }

  getEmail(): string | null {
    return this.userEmail;
  }

  private resolvePn(pnIdentifier?: string): string | undefined {
    return pnIdentifier || getOwnerApiPnIdentifier() || undefined;
  }

  private async requireOwnerAuth(): Promise<string> {
    const authToken = this.resolveOwnerApiToken();
    if (!authToken) {
      throw new Error('par Noir API session not ready');
    }
    return authToken;
  }

  private async cloudExtraHeaders(): Promise<Record<string, string>> {
    const accessToken = await this.ensureAccessToken();
    if (!accessToken) {
      throw new Error('Not connected to Google Drive or access token unavailable');
    }
    return { [PN_CLOUD_ACCESS_TOKEN_HEADER]: accessToken };
  }

  private async driveFetch(
    method: string,
    path: string,
    body?: unknown,
    pnIdentifier?: string,
    retryCount = 0
  ): Promise<Response> {
    const authToken = await this.requireOwnerAuth();
    const pn = this.resolvePn(pnIdentifier);
    const extraHeaders = await this.cloudExtraHeaders();
    const init: OwnerFetchInit = { pnIdentifier: pn, extraHeaders };

    const response =
      method.toUpperCase() === 'GET'
        ? await ownerGet(authToken, path, init)
        : await ownerFetch(authToken, method, path, body, init);

    if (
      (response.status === 401 || response.status === 409) &&
      retryCount === 0
    ) {
      this.clearDeadToken();
      const refreshed = await this.ensureAccessToken();
      if (refreshed) {
        return this.driveFetch(method, path, body, pnIdentifier, retryCount + 1);
      }
      await this.handleAuthFailure();
      throw new Error('Google Drive authentication expired. Please reconnect.');
    }

    return response;
  }

  private async handleAuthFailure(): Promise<void> {
    const attemptRecovery = (
      globalThis as { __attemptGoogleDrive401Recovery?: (backendId: string) => Promise<boolean> }
    ).__attemptGoogleDrive401Recovery;
    if (typeof attemptRecovery === 'function') {
      try {
        const recovered = await Promise.race([
          attemptRecovery(this.backendId),
          new Promise<boolean>((_, reject) =>
            setTimeout(() => reject(new Error('401 recovery timeout')), 5000)
          )
        ]);
        if (recovered) {
          const afterRecovery = await this.ensureAccessToken();
          if (afterRecovery) return;
        }
      } catch (recoveryErr) {
        console.warn('⚠️ [GoogleDriveBackend] 401 recovery failed:', recoveryErr);
      }
    }

    await this.disconnect();
    window.dispatchEvent(
      new CustomEvent('google-drive-token-expired', {
        detail: { message: 'Google Drive token expired. Please reconnect.' }
      })
    );
  }

  private mapStorageFile(f: DriveApiFile): StorageFile {
    const name = f.name || '';
    return {
      id: f.id || '',
      name,
      size: typeof f.size === 'number' ? f.size : parseInt(String(f.size || '0'), 10),
      mimeType: f.mimeType || 'application/octet-stream',
      modifiedTime: f.modifiedTime || new Date().toISOString(),
      encrypted: name.endsWith('.encrypted'),
      originalName: name.endsWith('.encrypted') ? name.replace(/\.encrypted$/, '') : name,
      backend: this.id
    };
  }

  /**
   * Get or create a folder. If pnIdentifier is provided, creates pN-specific folders.
   * Format: "par Noir" (base) or "par Noir - {pnIdentifier}" (pN-specific).
   */
  async getOrCreateFolder(
    name: string,
    pnIdentifier?: string,
    parentFolderId?: string
  ): Promise<string> {
    if (!this.token && !(await this.ensureAccessToken())) {
      console.warn('⚠️ [getOrCreateFolder] Google Drive not connected - returning placeholder');
      return 'NOT_CONNECTED';
    }

    const folderName = pnIdentifier ? `${name} - ${pnIdentifier}` : name;

    if (pnIdentifier && this.pnFolderCache.has(pnIdentifier) && !parentFolderId) {
      const cachedFolderId = this.pnFolderCache.get(pnIdentifier)!;
      try {
        const validateResponse = await this.driveFetch(
          'GET',
          `/api/drive/files/${encodeURIComponent(cachedFolderId)}`,
          undefined,
          pnIdentifier
        );
        if (validateResponse.ok) {
          const data = (await validateResponse.json()) as { file?: DriveApiFile } & DriveApiFile;
          const folderInfo = data.file || data;
          const expectedFolderName = `par Noir - ${pnIdentifier}`;
          if (folderInfo.name === expectedFolderName) {
            return cachedFolderId;
          }
        }
        this.pnFolderCache.delete(pnIdentifier);
        this.saveFolderCache();
      } catch {
        this.pnFolderCache.delete(pnIdentifier);
        this.saveFolderCache();
      }
    }

    const sanitizedFolderName = folderName.replace(/'/g, "\\'");
    let searchQuery: string;
    if (pnIdentifier && folderName !== '_metadata') {
      searchQuery = `name='${sanitizedFolderName}' and name!='_metadata' and mimeType='${FOLDER_MIME}' and trashed=false`;
      if (parentFolderId) {
        searchQuery += ` and '${parentFolderId}' in parents`;
      }
    } else if (parentFolderId) {
      searchQuery = `name='${sanitizedFolderName}' and '${parentFolderId}' in parents and mimeType='${FOLDER_MIME}' and trashed=false`;
    } else {
      searchQuery = `name='${sanitizedFolderName}' and mimeType='${FOLDER_MIME}' and trashed=false`;
    }

    const searchParams = new URLSearchParams({
      q: searchQuery,
      pageSize: '10'
    });
    const searchResponse = await this.driveFetch(
      'GET',
      `/api/drive/files?${searchParams.toString()}`,
      undefined,
      pnIdentifier
    );
    if (!searchResponse.ok) {
      throw new Error('Failed to search for folder');
    }

    const searchData = (await searchResponse.json()) as { files?: DriveApiFile[] };
    const candidates = (searchData.files || []).filter((f) => {
      if (folderName === '_metadata') {
        return f.name === '_metadata' && !!parentFolderId;
      }
      if (f.name === '_metadata') return false;
      if (pnIdentifier) {
        return f.name === `par Noir - ${pnIdentifier}`;
      }
      return f.name === folderName || f.name === 'par Noir';
    });

    if (candidates.length > 0 && candidates[0]?.id) {
      const folderId = candidates[0].id;
      if (pnIdentifier && !parentFolderId) {
        this.pnFolderCache.set(pnIdentifier, folderId);
        this.parNoirFolderId = folderId;
        this.saveFolderCache();
      } else if (!pnIdentifier && !parentFolderId) {
        this.parNoirFolderId = folderId;
        try {
          localStorage.setItem(`${this.keyPrefix}_last_folder_id`, folderId);
        } catch {
          /* ignore */
        }
      }
      return folderId;
    }

    const createResponse = await this.driveFetch(
      'POST',
      '/api/drive/folders',
      {
        folderName,
        ...(parentFolderId ? { parentFolderId } : {})
      },
      pnIdentifier
    );
    if (!createResponse.ok) {
      throw new Error('Failed to create folder');
    }

    const created = (await createResponse.json()) as { folder?: DriveApiFile };
    const folderId = created.folder?.id;
    if (!folderId) {
      throw new Error('Failed to create folder: no id returned');
    }

    if (pnIdentifier && !parentFolderId) {
      this.pnFolderCache.set(pnIdentifier, folderId);
      this.parNoirFolderId = folderId;
      this.saveFolderCache();
    } else if (!pnIdentifier && !parentFolderId) {
      this.parNoirFolderId = folderId;
      try {
        localStorage.setItem(`${this.keyPrefix}_last_folder_id`, folderId);
      } catch {
        /* ignore */
      }
    }

    return folderId;
  }

  async listFiles(folderId?: string, pnIdentifier?: string): Promise<StorageFile[]> {
    if (!this.token && !(await this.ensureAccessToken())) {
      console.warn('⚠️ [listFiles] Google Drive not connected - returning empty list');
      return [];
    }

    if (folderId === 'NOT_CONNECTED') {
      return [];
    }

    let resolvedFolderId = folderId;
    if (pnIdentifier && !resolvedFolderId) {
      try {
        resolvedFolderId = await this.getOrCreateFolder('par Noir', pnIdentifier);
      } catch (err) {
        console.error('❌ [listFiles] Failed to get/create folder:', err);
        resolvedFolderId = undefined;
      }
    }

    if (!resolvedFolderId) {
      try {
        const folderSearchQuery = `name contains 'par Noir' and mimeType='${FOLDER_MIME}' and trashed=false and name!='_metadata'`;
        const params = new URLSearchParams({
          q: folderSearchQuery,
          pageSize: '10'
        });
        const folderSearchResponse = await this.driveFetch(
          'GET',
          `/api/drive/files?${params.toString()}`,
          undefined,
          pnIdentifier
        );
        if (folderSearchResponse.ok) {
          const folderData = (await folderSearchResponse.json()) as { files?: DriveApiFile[] };
          const pnFolders = (folderData.files || []).filter(
            (f) => f.name?.includes('par Noir') && f.name.includes('pn-') && !f.name.includes('_metadata')
          );
          if (pnFolders[0]?.id) {
            resolvedFolderId = pnFolders[0].id;
          } else if (folderData.files?.[0]?.id) {
            resolvedFolderId = folderData.files[0].id;
          }
        }
      } catch (e) {
        console.error('❌ [listFiles] Error searching for folders:', e);
      }
    }

    if (!resolvedFolderId) {
      console.warn('⚠️ [listFiles] No folder found - returning empty list');
      return [];
    }

    const q = `'${resolvedFolderId}' in parents and trashed=false and mimeType!='${FOLDER_MIME}'`;
    const params = new URLSearchParams({
      q,
      pageSize: '100'
    });

    let response: Response;
    try {
      response = await this.driveFetch(
        'GET',
        `/api/drive/files?${params.toString()}`,
        undefined,
        pnIdentifier
      );
    } catch (error) {
      console.warn('⚠️ [listFiles] Drive API request failed:', error);
      return [];
    }

    if (response.status === 404) {
      return [];
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to fetch files: ${errorText}`);
    }

    const data = (await response.json()) as { files?: DriveApiFile[] };
    const fileList = (data.files || []).filter((f) => {
      if (f.name === 'public-file-index.json') return false;
      if (f.mimeType === FOLDER_MIME) return false;
      return true;
    });

    return fileList.map((f) => this.mapStorageFile(f));
  }

  async uploadFile(file: File, folderId?: string, metadata?: any): Promise<StorageFile> {
    if (!this.token && !(await this.ensureAccessToken())) {
      throw new Error('Not connected to Google Drive');
    }

    const pnIdentifier =
      typeof metadata?.pnIdentifier === 'string' ? metadata.pnIdentifier : undefined;
    const targetFolderId =
      folderId || (pnIdentifier ? this.pnFolderCache.get(pnIdentifier) : this.parNoirFolderId);

    if (!targetFolderId) {
      const newFolderId = await this.getOrCreateFolder('par Noir', pnIdentifier);
      return this.uploadFile(file, newFolderId, metadata);
    }

    const fileName = metadata?.fileName || file.name;
    const fileData = await blobToBase64(file);
    const encrypt =
      typeof metadata?.encrypt === 'boolean' ? metadata.encrypt : fileName.endsWith('.encrypted');

    const response = await this.driveFetch(
      'POST',
      '/api/drive/files',
      {
        fileData,
        fileName,
        mimeType: file.type || 'application/octet-stream',
        parents: [targetFolderId],
        encrypt
      },
      pnIdentifier
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to upload file: ${errorText}`);
    }

    const uploaded = (await response.json()) as { file?: DriveApiFile };
    const uploadedFile = uploaded.file || {};
    return this.mapStorageFile({
      id: uploadedFile.id,
      name: uploadedFile.name || fileName,
      size: uploadedFile.size ?? file.size,
      mimeType: uploadedFile.mimeType || file.type || 'application/octet-stream',
      modifiedTime: uploadedFile.modifiedTime
    });
  }

  async downloadFile(fileId: string): Promise<Blob> {
    if (!this.token && !(await this.ensureAccessToken())) {
      throw new Error('Not connected to Google Drive');
    }

    const response = await this.driveFetch(
      'GET',
      `/api/drive/files/${encodeURIComponent(fileId)}?download=true`
    );

    if (!response.ok) {
      throw new Error('Failed to download file');
    }

    return response.blob();
  }

  /** In-place content replace (preserves file id). */
  async replaceFileContent(
    fileId: string,
    body: Blob,
    mimeType = 'application/octet-stream'
  ): Promise<void> {
    if (!this.token && !(await this.ensureAccessToken())) {
      throw new Error('Not connected to Google Drive');
    }

    const fileData = await blobToBase64(body);
    const path = `/api/drive/files/${encodeURIComponent(fileId)}/content`;
    const response = await this.driveFetch('PUT', path, { fileData, mimeType });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`Failed to replace file content: ${errorText || response.status}`);
    }
  }

  async readJsonFile<T = unknown>(fileId: string): Promise<T | null> {
    try {
      const blob = await this.downloadFile(fileId);
      const text = await blob.text();
      return JSON.parse(text) as T;
    } catch {
      return null;
    }
  }

  async writeJsonFile(fileId: string, data: unknown): Promise<void> {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    await this.replaceFileContent(fileId, blob, 'application/json');
  }

  async renameFile(fileId: string, newName: string): Promise<void> {
    if (!this.token && !(await this.ensureAccessToken())) {
      throw new Error('Not connected to Google Drive');
    }

    const response = await this.driveFetch('PUT', `/api/drive/files/${encodeURIComponent(fileId)}`, {
      name: newName
    });

    if (!response.ok) {
      throw new Error('Failed to rename file');
    }
  }

  /** Walk entire subtree under folderId (files + folders). */
  async listFilesRecursive(rootFolderId: string): Promise<DriveInventoryItem[]> {
    if (!this.token && !(await this.ensureAccessToken())) {
      throw new Error('Not connected to Google Drive');
    }

    const out: DriveInventoryItem[] = [];
    const queue: Array<{ folderId: string; path: string }> = [
      { folderId: rootFolderId, path: '' }
    ];

    while (queue.length > 0) {
      const { folderId, path } = queue.shift()!;
      let pageToken: string | undefined;

      do {
        const q = `'${folderId}' in parents and trashed=false`;
        const params = new URLSearchParams({
          q,
          pageSize: '200'
        });
        if (pageToken) {
          params.set('pageToken', pageToken);
        }

        const response = await this.driveFetch('GET', `/api/drive/files?${params.toString()}`);
        if (!response.ok) {
          throw new Error('Failed to list folder contents');
        }

        const data = (await response.json()) as {
          nextPageToken?: string;
          files?: DriveApiFile[];
        };

        for (const f of data.files || []) {
          if (!f.id || !f.name) continue;
          const isFolder = f.mimeType === FOLDER_MIME;
          const itemPath = path ? `${path}/${f.name}` : f.name;
          out.push({
            fileId: f.id,
            name: f.name,
            path: itemPath,
            mimeType: f.mimeType || 'application/octet-stream',
            isFolder
          });
          if (isFolder) {
            queue.push({ folderId: f.id, path: itemPath });
          }
        }

        pageToken = data.nextPageToken;
      } while (pageToken);
    }

    return out;
  }

  async deleteFile(fileId: string): Promise<void> {
    if (!this.token && !(await this.ensureAccessToken())) {
      throw new Error('Not connected to Google Drive');
    }

    const response = await this.driveFetch(
      'DELETE',
      `/api/drive/files/${encodeURIComponent(fileId)}`
    );

    if (!response.ok) {
      throw new Error('Failed to delete file');
    }
  }

  async getQuota(): Promise<StorageQuota | null> {
    return null;
  }

  /** @deprecated Prefer getQuota(); Drive quota is not proxied over the owner API. */
  async getStorageQuota(): Promise<StorageQuota> {
    return {
      limit: 0,
      usage: 0,
      usageInDrive: 0,
      usageInDriveTrash: 0
    };
  }

  async getUserInfo(): Promise<StorageUserInfo | null> {
    return {
      email: this.userEmail || undefined
    };
  }
}
