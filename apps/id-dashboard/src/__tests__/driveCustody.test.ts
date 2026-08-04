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
 * On 403/409, fetchOwnerIndex leaves ownerIndex null (one API attempt only) so
 * mergeDriveScanWithIndex can fill via Drive listFiles — never a second owner-index
 * GET and never POST /storage/initialize.
 */
import React from 'react';

const ownerGet = jest.fn();
const ownerFetch = jest.fn();

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

describe('fetchOwnerIndex owner-index fallthrough', () => {
  it('leaves ownerIndex null on 409 without a second API call or server rebuild', async () => {
    ownerGet.mockResolvedValue({ ok: false, status: 409, json: jest.fn() });

    const result = await fetchOwnerIndex(makeParams());

    expect(ownerGet).toHaveBeenCalledTimes(1);
    expect(result.ownerIndex).toBeNull();
    expect(result.ownerIndexFromApi).toBe(false);
    expect(result.skipBackend).toBe(false);

    // The regression: a 409 must never trigger POST /storage/initialize.
    expect(ownerFetch).not.toHaveBeenCalled();
    const requestedPaths = ownerGet.mock.calls.map((call) => call[1]);
    expect(requestedPaths.some((path: string) => path.includes('initialize'))).toBe(false);
  });

  it('skips the network call after a prior 409 for the same identity this session', async () => {
    ownerGet.mockResolvedValue({ ok: false, status: 409, json: jest.fn() });

    await fetchOwnerIndex(makeParams());
    const second = await fetchOwnerIndex(makeParams());

    expect(ownerGet).toHaveBeenCalledTimes(1);
    expect(second.ownerIndex).toBeNull();
    expect(second.ownerIndexFromApi).toBe(false);
  });

  it('leaves ownerIndex null on 403 without a second API call', async () => {
    ownerGet.mockResolvedValue({ ok: false, status: 403, json: jest.fn() });

    const result = await fetchOwnerIndex(makeParams());

    expect(ownerGet).toHaveBeenCalledTimes(1);
    expect(result.ownerIndex).toBeNull();
    expect(result.ownerIndexFromApi).toBe(false);
    expect(result.skipBackend).toBe(false);
    expect(ownerFetch).not.toHaveBeenCalled();
  });

  it('uses the server index when owner-index succeeds', async () => {
    ownerGet.mockResolvedValue({
      ok: true,
      status: 200,
      json: jest
        .fn()
        .mockResolvedValue({ files: [{ id: 'file-1', backend: 'google_drive' }], version: 3 }),
    });

    const result = await fetchOwnerIndex(makeParams());

    expect(result.ownerIndexFromApi).toBe(true);
    expect(result.ownerIndex.version).toBe(3);
    expect(ownerGet).toHaveBeenCalledTimes(1);
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

    await fetchOwnerIndex(makeParams({ currentPnIdentifier: 'abcdef123456' }));

    expect(ownerGet).toHaveBeenCalledWith(
      OWNER_API_TOKEN,
      `/api/storage/owner-index/${encodeURIComponent('pn-abcdef123456')}`
    );
  });

  it('does not call the owner API when no owner token is available', async () => {
    const result = await fetchOwnerIndex(makeParams({ resolveOwnerApiToken: () => null }));

    expect(ownerGet).not.toHaveBeenCalled();
    expect(result.ownerIndex).toBeNull();
    expect(result.ownerIndexFromApi).toBe(false);
  });

  it('swallows owner-index transport errors and leaves ownerIndex null', async () => {
    ownerGet.mockRejectedValue(new Error('network down'));

    const result = await fetchOwnerIndex(makeParams());

    expect(result.ownerIndex).toBeNull();
    expect(result.ownerIndexFromApi).toBe(false);
    expect(result.skipBackend).toBe(false);
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
