/**
 * @jest-environment node
 *
 * getUserDriveMetadataContext resolves a Drive token plus the `_metadata` folder id.
 * Every failure along the way is a soft null, never a throw.
 */
jest.mock('./storageCredentialsService', () => ({
  storageCredentialsService: { getCredentials: jest.fn() },
}));

jest.mock('./googleDriveProxy', () => ({
  googleDriveProxyService: { getAccessToken: jest.fn() },
}));

import { getUserDriveMetadataContext, normalizePnIdentifier } from './driveMetadataHelper';
import { storageCredentialsService } from './storageCredentialsService';
import { googleDriveProxyService } from './googleDriveProxy';

const mockGetCredentials = storageCredentialsService.getCredentials as jest.Mock;
const mockGetAccessToken = googleDriveProxyService.getAccessToken as jest.Mock;

const PN = 'pn-test';

function driveFetch(options: { pnFolder?: boolean; metadataFolder?: boolean; pnStatus?: number; metadataStatus?: number } = {}) {
  const { pnFolder = true, metadataFolder = true, pnStatus = 200, metadataStatus = 200 } = options;
  const fetchMock = jest.fn(async (input: RequestInfo | URL) => {
    const url = decodeURIComponent(String(input));
    if (url.includes("name='par Noir - ")) {
      return new Response(JSON.stringify({ files: pnFolder ? [{ id: 'pn-folder' }] : [] }), {
        status: pnStatus,
      });
    }
    if (url.includes("name='_metadata'")) {
      return new Response(
        JSON.stringify({ files: metadataFolder ? [{ id: 'meta-folder' }] : [] }),
        { status: metadataStatus }
      );
    }
    throw new Error(`Unexpected fetch: ${url}`);
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

describe('normalizePnIdentifier', () => {
  it('prefixes a bare identifier', () => {
    expect(normalizePnIdentifier('test')).toBe('pn-test');
  });

  it('is idempotent for an already-normalized identifier', () => {
    expect(normalizePnIdentifier('pn-test')).toBe('pn-test');
  });
});

describe('getUserDriveMetadataContext', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    mockGetCredentials.mockReset();
    mockGetAccessToken.mockReset();
    global.fetch = jest.fn(async () => {
      throw new Error('fetch should not be called');
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('returns null when the identity has no stored credentials', async () => {
    mockGetCredentials.mockResolvedValue(null);
    await expect(getUserDriveMetadataContext(PN)).resolves.toBeNull();
  });

  it('returns null when no Drive account is attached', async () => {
    mockGetCredentials.mockResolvedValue({ credentials: {} });
    await expect(getUserDriveMetadataContext(PN)).resolves.toBeNull();
    expect(mockGetAccessToken).not.toHaveBeenCalled();
  });

  it('returns null without throwing when device cloud custody strips OAuth secrets', async () => {
    mockGetCredentials.mockResolvedValue({
      credentials: { googleDriveAccounts: [{ backendId: 'acct-1' }] },
    });
    mockGetAccessToken.mockRejectedValue(new Error('no refresh token on server'));

    await expect(getUserDriveMetadataContext(PN)).resolves.toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('returns null when the access token is blank', async () => {
    mockGetCredentials.mockResolvedValue({
      credentials: { googleDriveAccounts: [{ backendId: 'acct-1' }] },
    });
    mockGetAccessToken.mockResolvedValue('');

    await expect(getUserDriveMetadataContext(PN)).resolves.toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('returns null when the pN root folder search fails', async () => {
    mockGetCredentials.mockResolvedValue({
      credentials: { googleDriveAccounts: [{ backendId: 'acct-1' }] },
    });
    mockGetAccessToken.mockResolvedValue('drive-token');
    driveFetch({ pnStatus: 401 });

    await expect(getUserDriveMetadataContext(PN)).resolves.toBeNull();
  });

  it('returns null when the pN root folder does not exist', async () => {
    mockGetCredentials.mockResolvedValue({
      credentials: { googleDriveAccounts: [{ backendId: 'acct-1' }] },
    });
    mockGetAccessToken.mockResolvedValue('drive-token');
    driveFetch({ pnFolder: false });

    await expect(getUserDriveMetadataContext(PN)).resolves.toBeNull();
  });

  it('returns null when the _metadata folder does not exist', async () => {
    mockGetCredentials.mockResolvedValue({
      credentials: { googleDriveAccounts: [{ backendId: 'acct-1' }] },
    });
    mockGetAccessToken.mockResolvedValue('drive-token');
    driveFetch({ metadataFolder: false });

    await expect(getUserDriveMetadataContext(PN)).resolves.toBeNull();
  });

  it('resolves the full context and sends the bearer token on each lookup', async () => {
    mockGetCredentials.mockResolvedValue({
      credentials: { googleDriveAccounts: [{ backendId: 'acct-1' }] },
    });
    mockGetAccessToken.mockResolvedValue('drive-token');
    const fetchMock = driveFetch();

    await expect(getUserDriveMetadataContext('test')).resolves.toEqual({
      normalizedPnIdentifier: PN,
      accessToken: 'drive-token',
      accountId: 'acct-1',
      metadataFolderId: 'meta-folder',
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const call of fetchMock.mock.calls) {
      expect((call[1] as RequestInit).headers).toEqual({ Authorization: 'Bearer drive-token' });
    }
  });

  it('falls back through backendId, keyPrefix, accountId, then id', async () => {
    mockGetCredentials.mockResolvedValue({
      credentials: { googleDriveAccounts: [{ keyPrefix: 'key-1', accountId: 'acct-2', id: 'id-3' }] },
    });
    mockGetAccessToken.mockResolvedValue('drive-token');
    driveFetch();

    const context = await getUserDriveMetadataContext(PN);
    expect(context?.accountId).toBe('key-1');
    expect(mockGetAccessToken).toHaveBeenCalledWith(PN, 'key-1');
  });

  it('reads the legacy single googleDrive account shape', async () => {
    mockGetCredentials.mockResolvedValue({
      credentials: { googleDrive: { backendId: 'legacy-acct' } },
    });
    mockGetAccessToken.mockResolvedValue('drive-token');
    driveFetch();

    const context = await getUserDriveMetadataContext(PN);
    expect(context?.accountId).toBe('legacy-acct');
  });
});
