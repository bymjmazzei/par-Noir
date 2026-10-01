/**
 * @jest-environment node
 */
process.env.STORAGE_CREDENTIALS_SECRET = 'unit-test-storage-secret';
process.env.DEVICE_CLOUD_CUSTODY = '0';

import { storageCredentialsService } from './storageCredentialsService';
import { getDatabasePool } from '../utils/database';

jest.mock('../utils/database', () => ({
  getDatabasePool: jest.fn(),
}));

describe('rewriteCloudSecretsAtRest', () => {
  it('removes accessToken and keeps the folder id', async () => {
    const rows = new Map<string, { encrypted_metadata: string; cid: string | null }>();
    const query = jest.fn(async (sql: string, params?: unknown[]) => {
      if (sql.includes('INSERT INTO storage_credentials')) {
        rows.set(String(params?.[0]), {
          encrypted_metadata: String(params?.[1]),
          cid: (params?.[2] as string | null) ?? null,
        });
        return {
          rows: [
            {
              identity_id: params?.[0],
              encrypted_metadata: params?.[1],
              cid: params?.[2] ?? null,
              updated_at: new Date(),
              created_at: new Date(),
            },
          ],
        };
      }
      if (sql.includes('SELECT identity_id FROM storage_credentials')) {
        return { rows: [...rows.keys()].map((identity_id) => ({ identity_id })) };
      }
      if (sql.includes('FROM storage_credentials') && sql.includes('WHERE identity_id')) {
        const stored = rows.get(String(params?.[0]));
        if (!stored) return { rows: [] };
        return {
          rows: [
            {
              identity_id: params?.[0],
              encrypted_metadata: stored.encrypted_metadata,
              cid: stored.cid,
              updated_at: new Date(),
              created_at: new Date(),
            },
          ],
        };
      }
      return { rows: [] };
    });
    (getDatabasePool as jest.Mock).mockReturnValue({ query });

    await storageCredentialsService.upsertCredentials('pn-self', {
      driveFolderId: 'folder-1',
      pnDriveIndex: { metadataFolderId: 'meta-1' },
      googleDriveAccounts: [{ accountId: 'acct', accessToken: 'ya29-secret' }],
    });

    process.env.DEVICE_CLOUD_CUSTODY = '1';
    const rewritten = await storageCredentialsService.rewriteCloudSecretsAtRest();
    expect(rewritten).toBe(1);

    const after = await storageCredentialsService.getCredentials('pn-self');
    expect(after?.credentials.driveFolderId).toBe('folder-1');
    expect(after?.credentials.pnDriveIndex.metadataFolderId).toBe('meta-1');
    expect(JSON.stringify(after?.credentials)).not.toContain('ya29-secret');
    expect(JSON.stringify(after?.credentials)).not.toContain('accessToken');
  });
});
