import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchDeviceDriveForSession } from './deviceDriveCall.js';
import { clearAllSessionCloudCredentials, setSessionCloudCredentials } from './sessionMemory.js';

describe('fetchDeviceDriveForSession', () => {
  afterEach(() => {
    clearAllSessionCloudCredentials();
    vi.unstubAllGlobals();
  });

  it('sends /api/drive/files to Google and leaves other routes alone', async () => {
    setSessionCloudCredentials('pn-drive', {
      googleDriveAccounts: [
        { accountId: 'a1', access_token: 'google-token', expires_at: Date.now() + 3600_000 },
      ],
    } as never);
    const fetchMock = vi.fn(async (url: string) => {
      expect(String(url)).toContain('www.googleapis.com/drive');
      expect(String(url)).not.toContain('api.parnoir.com');
      return new Response(JSON.stringify({ files: [] }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const drive = await fetchDeviceDriveForSession({
      method: 'GET',
      pathOrUrl: 'https://api.parnoir.com/api/drive/files?q=name%3D%27doc%27&pageSize=5',
      pnIdentifier: 'pn-drive',
    });
    expect(drive?.status).toBe(200);
    expect(fetchMock).toHaveBeenCalled();

    const other = await fetchDeviceDriveForSession({
      method: 'POST',
      pathOrUrl: '/api/pen/apply-inbound',
      pnIdentifier: 'pn-drive',
      body: { docId: 'd' },
    });
    expect(other).toBeNull();
  });

  it('returns a local 409 when the session has no Drive token', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const res = await fetchDeviceDriveForSession({
      method: 'GET',
      pathOrUrl: '/api/drive/files?pageSize=1',
      pnIdentifier: 'pn-empty',
    });
    expect(res?.status).toBe(409);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
