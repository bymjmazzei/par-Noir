/**
 * @jest-environment jsdom
 *
 * Device-custody regressions for Drive discovery.
 *
 * Under device cloud custody the API holds no Google OAuth secrets. Two paths have
 * repeatedly regressed into POSTing /storage/initialize, which 400s and loops the
 * multi-minute setup UI:
 *   1. owner-index returning 403 (device policy) or 409 (incomplete server index)
 *   2. credential persist returning clientSideLayoutRequired
 * Both must fall through to client-side Drive discovery instead.
 */
import React from 'react';

const ownerGet = jest.fn();
const ownerFetch = jest.fn();

jest.mock('../services/ownerApiService', () => ({
  ownerGet: (...args: unknown[]) => ownerGet(...args),
  ownerFetch: (...args: unknown[]) => ownerFetch(...args),
}));

const getOrCreatePNFolder = jest.fn();
const getOrCreateMetadataFolder = jest.fn();
const getOwnerFileIndexFromContentClasses = jest.fn();

jest.mock('../services/storage/GoogleDriveMetadataService', () => ({
  GoogleDriveMetadataService: {
    getOrCreatePNFolder: (...args: unknown[]) => getOrCreatePNFolder(...args),
    getOrCreateMetadataFolder: (...args: unknown[]) => getOrCreateMetadataFolder(...args),
    getOwnerFileIndexFromContentClasses: (...args: unknown[]) =>
      getOwnerFileIndexFromContentClasses(...args),
  },
}));

import { fetchOwnerIndex } from '../components/storage/hooks/loadFiles/fetchOwnerIndex';
import {
  shouldRunServerDriveInit,
  shouldSkipServerDriveInit,
} from '../components/storage/hooks/driveCredentials/driveInitDecision';

const BACKEND_ID = 'google_drive::acct-1';
const PN_ID = 'pn-abcdef123456';
const ACCESS_TOKEN = 'google-access-token';
const OWNER_API_TOKEN = 'owner-api-token';

function ref<T>(value: T): React.MutableRefObject<T> {
  return { current: value };
}

function makeParams(overrides: Record<string, unknown> = {}) {
  return {
    backendId: BACKEND_ID,
    accessToken: ACCESS_TOKEN,
    currentPnIdentifier: PN_ID,
    resolveOwnerApiToken: () => OWNER_API_TOKEN,
    retryBackends: new Set<string>(),
    rateLimitedBackendsRef: ref(new Set<string>()),
    ownerIndexWarningLoggedRef: ref(new Set<string>()),
    ...overrides,
  } as Parameters<typeof fetchOwnerIndex>[0];
}

function clientDiscoveryReturns(index: unknown) {
  getOrCreatePNFolder.mockResolvedValue('pn-folder-id');
  getOrCreateMetadataFolder.mockResolvedValue('metadata-folder-id');
  getOwnerFileIndexFromContentClasses.mockResolvedValue(index);
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('fetchOwnerIndex owner-index fallthrough', () => {
  it('falls through to client Drive discovery on 409 without asking the server to rebuild', async () => {
    ownerGet.mockResolvedValue({ ok: false, status: 409, json: jest.fn() });
    clientDiscoveryReturns({ files: [{ id: 'file-1', backend: 'google_drive' }] });

    const result = await fetchOwnerIndex(makeParams());

    expect(getOwnerFileIndexFromContentClasses).toHaveBeenCalledTimes(1);
    expect(result.ownerIndex).toEqual({ files: [{ id: 'file-1', backend: 'google_drive' }] });
    expect(result.ownerIndexFromApi).toBe(false);
    expect(result.skipBackend).toBe(false);

    // The regression: a 409 must never trigger POST /storage/initialize.
    expect(ownerFetch).not.toHaveBeenCalled();
    const requestedPaths = ownerGet.mock.calls.map((call) => call[1]);
    expect(requestedPaths.some((path: string) => path.includes('initialize'))).toBe(false);
  });

  it('falls through to client Drive discovery on 403', async () => {
    ownerGet.mockResolvedValue({ ok: false, status: 403, json: jest.fn() });
    clientDiscoveryReturns({ files: [] });

    const result = await fetchOwnerIndex(makeParams());

    expect(getOwnerFileIndexFromContentClasses).toHaveBeenCalledTimes(1);
    expect(result.ownerIndexFromApi).toBe(false);
    expect(result.skipBackend).toBe(false);
    expect(ownerFetch).not.toHaveBeenCalled();
  });

  it('uses the server index and skips client discovery when owner-index succeeds', async () => {
    ownerGet.mockResolvedValue({
      ok: true,
      status: 200,
      json: jest
        .fn()
        .mockResolvedValue({ files: [{ id: 'file-1', backend: 'google_drive' }], version: 3 }),
    });
    clientDiscoveryReturns({ files: [{ id: 'should-not-be-used' }] });

    const result = await fetchOwnerIndex(makeParams());

    expect(result.ownerIndexFromApi).toBe(true);
    expect(result.ownerIndex.version).toBe(3);
    expect(getOwnerFileIndexFromContentClasses).not.toHaveBeenCalled();
  });

  it('filters the server index down to the backend provider', async () => {
    ownerGet.mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({
        files: [
          { id: 'drive-file', backend: 'google_drive' },
          { id: 'other-file', backend: 'dropbox' },
          { id: 'legacy-file' },
        ],
      }),
    });

    const result = await fetchOwnerIndex(makeParams());

    // Entries with no backend default to google_drive.
    expect(result.ownerIndex.files.map((file: { id: string }) => file.id)).toEqual([
      'drive-file',
      'legacy-file',
    ]);
  });

  it('requests owner-index with a pn- prefixed identifier even when the caller omits it', async () => {
    ownerGet.mockResolvedValue({ ok: false, status: 409, json: jest.fn() });
    clientDiscoveryReturns({ files: [] });

    await fetchOwnerIndex(makeParams({ currentPnIdentifier: 'abcdef123456' }));

    expect(ownerGet).toHaveBeenCalledWith(
      OWNER_API_TOKEN,
      `/api/storage/owner-index/${encodeURIComponent('pn-abcdef123456')}`
    );
  });

  it('skips the backend for this pass when client discovery hits an auth error', async () => {
    ownerGet.mockResolvedValue({ ok: false, status: 409, json: jest.fn() });
    getOrCreatePNFolder.mockRejectedValue(new Error('Failed to search for pN folder'));
    const rateLimitedBackendsRef = ref(new Set<string>());
    const retryBackends = new Set<string>();

    const result = await fetchOwnerIndex(makeParams({ retryBackends, rateLimitedBackendsRef }));

    expect(result.skipBackend).toBe(true);
    expect(retryBackends.has(BACKEND_ID)).toBe(true);
    expect(rateLimitedBackendsRef.current.has(BACKEND_ID)).toBe(true);
  });

  it('treats a non-auth discovery failure as non-blocking and warns once per backend', async () => {
    ownerGet.mockResolvedValue({ ok: false, status: 409, json: jest.fn() });
    getOwnerFileIndexFromContentClasses.mockRejectedValue(new Error('index parse failed'));
    getOrCreatePNFolder.mockResolvedValue('pn-folder-id');
    getOrCreateMetadataFolder.mockResolvedValue('metadata-folder-id');
    const ownerIndexWarningLoggedRef = ref(new Set<string>());

    const first = await fetchOwnerIndex(makeParams({ ownerIndexWarningLoggedRef }));
    const second = await fetchOwnerIndex(makeParams({ ownerIndexWarningLoggedRef }));

    expect(first.skipBackend).toBe(false);
    expect(second.skipBackend).toBe(false);
    expect(first.ownerIndex).toBeNull();
    expect(ownerIndexWarningLoggedRef.current.has(BACKEND_ID)).toBe(true);
  });

  it('does not call the owner API when no owner token is available', async () => {
    clientDiscoveryReturns({ files: [] });

    await fetchOwnerIndex(makeParams({ resolveOwnerApiToken: () => null }));

    expect(ownerGet).not.toHaveBeenCalled();
    expect(getOwnerFileIndexFromContentClasses).toHaveBeenCalledTimes(1);
  });

  it('does not attempt client discovery without a Google access token', async () => {
    ownerGet.mockResolvedValue({ ok: false, status: 409, json: jest.fn() });

    const result = await fetchOwnerIndex(makeParams({ accessToken: null }));

    expect(getOrCreatePNFolder).not.toHaveBeenCalled();
    expect(result.ownerIndex).toBeNull();
    expect(result.skipBackend).toBe(false);
  });

  it('swallows owner-index transport errors and still runs client discovery', async () => {
    ownerGet.mockRejectedValue(new Error('network down'));
    clientDiscoveryReturns({ files: [{ id: 'file-1' }] });

    const result = await fetchOwnerIndex(makeParams());

    expect(result.ownerIndex).toEqual({ files: [{ id: 'file-1' }] });
    expect(result.ownerIndexFromApi).toBe(false);
  });
});

describe('shouldSkipServerDriveInit', () => {
  it('flags custody when the client must forward a Google token for init', () => {
    expect(shouldSkipServerDriveInit({ clientSideLayoutRequired: true })).toBe(true);
  });

  it('wins over initInProgress and directoryBuilt for secretless init', () => {
    const result = {
      clientSideLayoutRequired: true,
      initInProgress: true,
      directoryBuilt: false,
    };

    expect(shouldSkipServerDriveInit(result)).toBe(true);
    expect(shouldRunServerDriveInit(result)).toBe(false);
  });

  it('does not skip when the flag is absent or falsy', () => {
    expect(shouldSkipServerDriveInit({})).toBe(false);
    expect(shouldSkipServerDriveInit({ clientSideLayoutRequired: false })).toBe(false);
    expect(shouldSkipServerDriveInit(null)).toBe(false);
    expect(shouldSkipServerDriveInit(undefined)).toBe(false);
  });
});

describe('shouldRunServerDriveInit', () => {
  it('runs when the server reports an init already in progress', () => {
    expect(shouldRunServerDriveInit({ initInProgress: true })).toBe(true);
  });

  it('runs when the directory is explicitly not built', () => {
    expect(shouldRunServerDriveInit({ directoryBuilt: false })).toBe(true);
  });

  it('does not run when the layout is already built', () => {
    expect(shouldRunServerDriveInit({ directoryBuilt: true })).toBe(false);
  });

  it('does not run on an empty or missing response', () => {
    expect(shouldRunServerDriveInit({})).toBe(false);
    expect(shouldRunServerDriveInit(null)).toBe(false);
  });
});
