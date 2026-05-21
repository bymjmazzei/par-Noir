/**
 * L5 integrator Drive silo client (requires cloud:app scope).
 */

import {
  authHeaders,
  buildQuery,
  normalizeApiEndpoint,
  parseJsonResponse,
  throwIfNotOk
} from './integrator/pnApiClient';
import type {
  DriveFileRef,
  DriveFolderRef,
  IntegratorClientConfig,
  IntegratorStorageRoot
} from './integrator/types';

export type {
  DriveFileRef,
  DriveFolderRef,
  IntegratorClientConfig,
  IntegratorStorageRoot
};

export { SCOPE_CLOUD_APP } from './integrator/pnApiClient';

export class IntegratorStorageClient {
  private apiEndpoint: string;

  constructor(config: IntegratorClientConfig = {}) {
    this.apiEndpoint = normalizeApiEndpoint(config.apiEndpoint);
  }

  async getStorageRoot(accessToken: string, accountId?: string): Promise<IntegratorStorageRoot> {
    const res = await fetch(
      `${this.apiEndpoint}/api/integrator/storage-root${buildQuery({ accountId })}`,
      { headers: authHeaders(accessToken) }
    );
    const data = await parseJsonResponse<IntegratorStorageRoot & { error?: string }>(res);
    await throwIfNotOk(res, data);
    return data;
  }

  async listFiles(
    accessToken: string,
    params?: { q?: string; pageSize?: number; accountId?: string }
  ): Promise<{ files: DriveFileRef[] }> {
    const res = await fetch(
      `${this.apiEndpoint}/api/drive/files${buildQuery({
        q: params?.q,
        pageSize: params?.pageSize,
        accountId: params?.accountId
      })}`,
      { headers: authHeaders(accessToken) }
    );
    const data = await parseJsonResponse<{ files: DriveFileRef[] }>(res);
    await throwIfNotOk(res, data);
    return { files: data.files || [] };
  }

  async getFile(
    accessToken: string,
    fileId: string,
    options?: { accountId?: string; download?: boolean; thumbnail?: boolean }
  ): Promise<{ file: DriveFileRef }> {
    const res = await fetch(
      `${this.apiEndpoint}/api/drive/files/${encodeURIComponent(fileId)}${buildQuery({
        accountId: options?.accountId,
        download: options?.download ? 'true' : undefined,
        thumbnail: options?.thumbnail ? 'true' : undefined
      })}`,
      { headers: authHeaders(accessToken) }
    );
    const data = await parseJsonResponse<{ file: DriveFileRef }>(res);
    await throwIfNotOk(res, data);
    return data;
  }

  async uploadFile(
    accessToken: string,
    params: {
      fileDataBase64: string;
      fileName: string;
      mimeType?: string;
      accountId?: string;
      encrypt?: boolean;
      parents?: string[];
    }
  ): Promise<{ file: DriveFileRef }> {
    const res = await fetch(`${this.apiEndpoint}/api/drive/files`, {
      method: 'POST',
      headers: authHeaders(accessToken, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        fileData: params.fileDataBase64,
        fileName: params.fileName,
        mimeType: params.mimeType || 'application/octet-stream',
        accountId: params.accountId,
        encrypt: params.encrypt !== false,
        parents: params.parents
      })
    });
    const data = await parseJsonResponse<{ file: DriveFileRef }>(res);
    await throwIfNotOk(res, data);
    return data;
  }

  /** @deprecated Use uploadFile */
  async uploadToSilo(
    accessToken: string,
    params: {
      fileDataBase64: string;
      fileName: string;
      mimeType?: string;
      accountId?: string;
      encrypt?: boolean;
    }
  ): Promise<{ file: DriveFileRef }> {
    return this.uploadFile(accessToken, params);
  }

  async updateFile(
    accessToken: string,
    fileId: string,
    updates: { name?: string; description?: string; parents?: string[]; accountId?: string }
  ): Promise<{ file: DriveFileRef }> {
    const { accountId, ...body } = updates;
    const res = await fetch(`${this.apiEndpoint}/api/drive/files/${encodeURIComponent(fileId)}`, {
      method: 'PUT',
      headers: authHeaders(accessToken, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ ...body, accountId })
    });
    const data = await parseJsonResponse<{ file: DriveFileRef }>(res);
    await throwIfNotOk(res, data);
    return data;
  }

  async deleteFile(
    accessToken: string,
    fileId: string,
    accountId?: string
  ): Promise<void> {
    const res = await fetch(
      `${this.apiEndpoint}/api/drive/files/${encodeURIComponent(fileId)}${buildQuery({ accountId })}`,
      { method: 'DELETE', headers: authHeaders(accessToken) }
    );
    const data = await parseJsonResponse<Record<string, unknown>>(res);
    await throwIfNotOk(res, data);
  }

  async createFolder(
    accessToken: string,
    params: {
      folderName: string;
      accountId?: string;
      parentFolderId?: string;
    }
  ): Promise<{ folder: DriveFolderRef }> {
    const res = await fetch(`${this.apiEndpoint}/api/drive/folders`, {
      method: 'POST',
      headers: authHeaders(accessToken, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        folderName: params.folderName,
        accountId: params.accountId,
        parentFolderId: params.parentFolderId
      })
    });
    const data = await parseJsonResponse<{ folder: DriveFolderRef }>(res);
    await throwIfNotOk(res, data);
    return data;
  }
}

export function createIntegratorStorageClient(
  config?: IntegratorClientConfig
): IntegratorStorageClient {
  return new IntegratorStorageClient(config);
}
