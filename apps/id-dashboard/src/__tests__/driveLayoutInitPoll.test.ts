/**
 * @jest-environment jsdom
 *
 * Drive layout init: POST returns 202 and work runs in the background.
 * Client polls /status infrequently (~15s) until complete — never a tight loop.
 */
import React from 'react';
import { renderHook, act } from '@testing-library/react';

const ownerGet = jest.fn();
const ownerFetch = jest.fn();

jest.mock('../services/ownerApiService', () => ({
  ownerGet: (...args: unknown[]) => ownerGet(...args),
  ownerFetch: (...args: unknown[]) => ownerFetch(...args),
}));

import { useDriveLayoutInit } from '../components/storage/hooks/useDriveLayoutInit';
import { clearOwnerIndexUnavailable } from '../services/storage/ownerIndexAvailability';

const PN_ID = 'pn-abcdef123456';
const OWNER_TOKEN = 'owner-api-token';
const GOOGLE_TOKEN = 'ya29.google-token';

beforeEach(() => {
  jest.clearAllMocks();
  clearOwnerIndexUnavailable();
});

describe('useDriveLayoutInit postDriveInitializeWithRetry', () => {
  it('polls /status after 202 until complete, without a request storm', async () => {
    ownerFetch.mockResolvedValue({
      ok: true,
      status: 202,
      text: async () => '',
      json: async () => ({ success: true, initInProgress: true }),
    });
    ownerGet.mockImplementation(async (_token: string, path: string) => {
      if (path.includes('/status')) {
        return {
          ok: true,
          json: async () => ({
            inFlight: false,
            complete: true,
            failed: false,
            progress: { phase: 'complete', stepLabel: 'Storage ready', percent: 100 },
          }),
        };
      }
      if (path.includes('/owner-index/')) {
        return { ok: true, status: 200, json: async () => ({ entries: [] }) };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });

    const setError = jest.fn();
    const { result } = renderHook(() => useDriveLayoutInit({ setError }));

    let ok = false;
    await act(async () => {
      ok = await result.current.postDriveInitializeWithRetry(PN_ID, OWNER_TOKEN, {
        googleAccessToken: GOOGLE_TOKEN,
        maxAttempts: 1,
      });
    });

    expect(ok).toBe(true);
    expect(ownerFetch).toHaveBeenCalledTimes(1);
    expect(String(ownerFetch.mock.calls[0]?.[2] ?? '')).toContain('/storage/initialize/');

    const statusCalls = ownerGet.mock.calls.filter((call) =>
      String(call[1]).includes('/status')
    );
    const ownerIndexCalls = ownerGet.mock.calls.filter((call) =>
      String(call[1]).includes('/owner-index/')
    );

    // First status poll is immediate; complete ends the loop — no 90s storm.
    expect(statusCalls.length).toBeGreaterThanOrEqual(1);
    expect(statusCalls.length).toBeLessThanOrEqual(3);
    expect(ownerIndexCalls.length).toBeGreaterThanOrEqual(1);
    expect(ownerIndexCalls.length).toBeLessThanOrEqual(4);
  });

  it('treats legacy sync 200 with folder ids as done without status polls', async () => {
    ownerFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '',
      json: async () => ({
        success: true,
        metadataFolderId: 'meta',
        pnFolderId: 'pn-folder',
      }),
    });
    ownerGet.mockImplementation(async (_token: string, path: string) => {
      if (path.includes('/owner-index/')) {
        return { ok: true, status: 200, json: async () => ({ entries: [] }) };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });

    const setError = jest.fn();
    const { result } = renderHook(() => useDriveLayoutInit({ setError }));

    let ok = false;
    await act(async () => {
      ok = await result.current.postDriveInitializeWithRetry(PN_ID, OWNER_TOKEN, {
        googleAccessToken: GOOGLE_TOKEN,
        maxAttempts: 1,
      });
    });

    expect(ok).toBe(true);
    const statusCalls = ownerGet.mock.calls.filter((call) =>
      String(call[1]).includes('/status')
    );
    expect(statusCalls.length).toBe(0);
  });

  it('does not retry non-transient initialize failures', async () => {
    ownerFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'server exploded',
      json: async () => ({}),
    });
    ownerGet.mockResolvedValue({
      ok: true,
      json: async () => ({ inFlight: false, progress: null }),
    });

    const setError = jest.fn();
    const { result } = renderHook(() => useDriveLayoutInit({ setError }));

    let ok = true;
    await act(async () => {
      ok = await result.current.postDriveInitializeWithRetry(PN_ID, OWNER_TOKEN, {
        googleAccessToken: GOOGLE_TOKEN,
        maxAttempts: 3,
      });
    });

    expect(ok).toBe(false);
    expect(ownerFetch).toHaveBeenCalledTimes(1);
    expect(setError).toHaveBeenCalled();
  });
});
