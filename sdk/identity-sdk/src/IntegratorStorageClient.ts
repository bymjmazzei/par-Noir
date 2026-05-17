/**
 * Thin client for L5 integrator Drive silo (cloud:app scope).
 */

export interface IntegratorStorageRoot {
  integratorFolderId: string;
  integratorPath: string;
  clientId: string;
}

export interface IntegratorStorageClientConfig {
  apiEndpoint?: string;
}

export class IntegratorStorageClient {
  private apiEndpoint: string;

  constructor(config: IntegratorStorageClientConfig = {}) {
    this.apiEndpoint = (config.apiEndpoint || 'https://api.parnoir.com').replace(/\/$/, '');
  }

  async getStorageRoot(accessToken: string, accountId?: string): Promise<IntegratorStorageRoot> {
    const q = accountId ? `?accountId=${encodeURIComponent(accountId)}` : '';
    const res = await fetch(`${this.apiEndpoint}/api/integrator/storage-root${q}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg =
        (data as { error_description?: string }).error_description ||
        (data as { error?: string }).error ||
        res.statusText;
      throw new Error(msg);
    }
    return data as IntegratorStorageRoot;
  }

  /**
   * Upload a file into the integrator silo (server sets parents when omitted).
   */
  async uploadToSilo(
    accessToken: string,
    params: {
      fileDataBase64: string;
      fileName: string;
      mimeType?: string;
      accountId?: string;
      encrypt?: boolean;
    }
  ): Promise<{ file: unknown }> {
    const res = await fetch(`${this.apiEndpoint}/api/drive/files`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        fileData: params.fileDataBase64,
        fileName: params.fileName,
        mimeType: params.mimeType || 'application/octet-stream',
        accountId: params.accountId,
        encrypt: params.encrypt !== false
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg =
        (data as { error_description?: string }).error_description ||
        (data as { error?: string }).error ||
        res.statusText;
      throw new Error(msg);
    }
    return data as { file: unknown };
  }
}

export function createIntegratorStorageClient(
  config?: IntegratorStorageClientConfig
): IntegratorStorageClient {
  return new IntegratorStorageClient(config);
}
