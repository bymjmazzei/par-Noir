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
 * fetchOwnerIndex reads the device owner-file-index sheet. It never GETs
 * /api/storage/owner-index. An empty sheet leaves ownerIndex null so
 * mergeDriveScanWithIndex fills via Drive listFiles.
 */
import React from 'react';

const ownerGet = jest.fn();
const ownerFetch = jest.fn();
const readDeviceOwnerIndex = jest.fn(async (_pn?: string, _token?: string) => [] as Array<Record<string, unknown>>);

jest.mock('../services/storage/deviceOwnerIndex', () => ({
  readDeviceOwnerIndex: (pn: string, token: string) => readDeviceOwnerIndex(pn, token),
}));

jest.mock('../services/ownerApiService', () => ({
  ownerGet: (...args: unknown[]) => ownerGet(...args),
  ownerFetch: (...args: unknown[]) => ownerFetch(...args),
}));

import { fetchOwnerIndex } from '../components/storage/hooks/loadFiles/fetchOwnerIndex';
import {
  shouldRunServerDriveInit,
  shouldSkipServerDriveInit,
} from '../components/storage/hooks/driveCredentials/driveInitDecision';
import { clearOwnerIndexUnavailable } from '../services/storage/ownerIndexAvailability';

const BACKEND_ID = 'google_drive::acct-1';
const PN_ID = 'pn-abcdef123456';
const OWNER_API_TOKEN = 'owner-api-token';

function makeParams(overrides: Record<string, unknown> = {}) {
  return {
    backendId: BACKEND_ID,
    currentPnIdentifier: PN_ID,
    resolveOwnerApiToken: () => OWNER_API_TOKEN,
    ...overrides,
  } as Parameters<typeof fetchOwnerIndex>[0];
}

beforeEach(() => {
  jest.clearAllMocks();
  clearOwnerIndexUnavailable();
});

describe('fetchOwnerIndex device sheet', () => {
  it('leaves ownerIndex null when the device sheet is empty, without an owner-index GET', async () => {
    readDeviceOwnerIndex.mockResolvedValue([]);

    const result = await fetchOwnerIndex(makeParams());

    expect(ownerGet).not.toHaveBeenCalled();
    expect(readDeviceOwnerIndex).toHaveBeenCalledWith(PN_ID, OWNER_API_TOKEN);
    expect(result.ownerIndex).toBeNull();
    expect(result.ownerIndexFromApi).toBe(false);
    expect(result.skipBackend).toBe(false);
    expect(ownerFetch).not.toHaveBeenCalled();
  });

  it('reads the device sheet again on a later load', async () => {
    readDeviceOwnerIndex.mockResolvedValue([]);

    await fetchOwnerIndex(makeParams());
    const second = await fetchOwnerIndex(makeParams());

    expect(readDeviceOwnerIndex).toHaveBeenCalledTimes(2);
    expect(ownerGet).not.toHaveBeenCalled();
    expect(second.ownerIndex).toBeNull();
    expect(second.ownerIndexFromApi).toBe(false);
  });

  it('returns device sheet rows and never GETs owner-index', async () => {
    readDeviceOwnerIndex.mockResolvedValue([
      { fileId: 'file-1', backend: 'google_drive', fileName: 'a.png' },
    ]);

    const result = await fetchOwnerIndex(makeParams());

    expect(ownerGet).not.toHaveBeenCalled();
    expect(result.ownerIndexFromApi).toBe(true);
    expect(result.ownerIndex.files).toEqual([
      { fileId: 'file-1', backend: 'google_drive', fileName: 'a.png' },
    ]);
  });

  it('filters the device index down to the backend provider', async () => {
    readDeviceOwnerIndex.mockResolvedValue([
      { id: 'drive-file', backend: 'google_drive' },
      { id: 'other-file', backend: 'dropbox' },
      { id: 'legacy-file' },
    ]);

    const result = await fetchOwnerIndex(makeParams());

    expect(result.ownerIndex.files.map((file: { id: string }) => file.id)).toEqual([
      'drive-file',
      'legacy-file',
    ]);
  });

  it('reads the device sheet with a pn- prefixed identifier even when the caller omits it', async () => {
    readDeviceOwnerIndex.mockResolvedValue([]);

    await fetchOwnerIndex(makeParams({ currentPnIdentifier: 'abcdef123456' }));

    expect(readDeviceOwnerIndex).toHaveBeenCalledWith('pn-abcdef123456', OWNER_API_TOKEN);
    expect(ownerGet).not.toHaveBeenCalled();
  });

  it('does not call the owner API when no owner token is available', async () => {
    const result = await fetchOwnerIndex(makeParams({ resolveOwnerApiToken: () => null }));

    expect(ownerGet).not.toHaveBeenCalled();
    expect(readDeviceOwnerIndex).not.toHaveBeenCalled();
    expect(result.ownerIndex).toBeNull();
    expect(result.ownerIndexFromApi).toBe(false);
  });

  it('swallows device sheet errors and leaves ownerIndex null', async () => {
    readDeviceOwnerIndex.mockRejectedValue(new Error('sheets down'));

    const result = await fetchOwnerIndex(makeParams());

    expect(result.ownerIndex).toBeNull();
    expect(result.ownerIndexFromApi).toBe(false);
    expect(result.skipBackend).toBe(false);
    expect(ownerGet).not.toHaveBeenCalled();
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
