/**
 * Falsification gate for "Drive calls that cannot mint a token".
 *
 * Hypothesis: a Drive-backed call built with the SYNC header builder sends no
 * X-PN-Cloud-Access-Token once the vault token ages out, because the sync path
 * can only report a token that is already fresh -- it cannot mint one. The API
 * then answers 409 cloud_token_required, and the refresh_token sitting in the
 * same envelope is never used.
 *
 * Falsifying observation: the sync builder emits a cloud header here anyway, or
 * the async builder fails to produce one from the same envelope. Either would
 * mean the 409 comes from somewhere else and the diagnosis is wrong.
 *
 * apps/aggregator-browser getOwnerApiHeaders is a thin wrapper over
 * ownerCloudHeaders, and ownerApiHeadersAsync over ownerCloudHeadersAsync, so
 * the gap is measured here at the shared layer where the behaviour lives.
 */

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import {
  clearAllSessionCloudCredentials,
  setSessionCloudCredentials,
  ownerCloudHeadersAsync,
  PN_CLOUD_ACCESS_TOKEN_HEADER
} from './index.js';
// Module-private: reaching past the barrel is the point of this gate.
import { ownerCloudHeaders } from './ownerCloudHeaders.js';

const PN = 'pn-gate';
const API = 'https://api.example.com';

/** Aged out an hour ago, but carries everything needed to mint a replacement. */
function seedExpiredButRefreshable(): void {
  setSessionCloudCredentials(PN, {
    googleDriveAccounts: [
      {
        accountId: 'a1',
        access_token: 'stale-ga',
        refresh_token: 'rt-1',
        expires_at: Date.now() - 3600_000
      }
    ]
  } as never);
}

describe('sync header builder cannot mint', () => {
  beforeEach(() => {
    clearAllSessionCloudCredentials();
    vi.stubGlobal('window', {
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent() {
        return true;
      }
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ access_token: 'minted-ga', expires_in: 3600 })
      }))
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sync builder sends no cloud token once the vault token has aged out', () => {
    seedExpiredButRefreshable();

    const headers = ownerCloudHeaders({ authToken: 'oauth', pnIdentifier: PN });

    // The gap: a Drive-backed caller gets Bearer-only and the API 409s.
    expect(headers[PN_CLOUD_ACCESS_TOKEN_HEADER]).toBeUndefined();
    expect(headers.Authorization).toBe('Bearer oauth');
  });

  it('sync builder never forwards the dead token either', () => {
    seedExpiredButRefreshable();

    const headers = ownerCloudHeaders({ authToken: 'oauth', pnIdentifier: PN });

    // Forwarding 'stale-ga' would be the older bug (Google 401 reported as 500).
    expect(headers[PN_CLOUD_ACCESS_TOKEN_HEADER]).not.toBe('stale-ga');
  });

  it('async builder mints from the same envelope, so recovery was always possible', async () => {
    seedExpiredButRefreshable();

    const headers = await ownerCloudHeadersAsync({
      authToken: 'oauth',
      pnIdentifier: PN,
      apiEndpoint: API
    });

    expect(headers[PN_CLOUD_ACCESS_TOKEN_HEADER]).toBe('minted-ga');
  });

  it('produces no token when there is nothing to refresh with, so callers fail closed', async () => {
    // ownerFetch treats "pn known, no cloud header" as 409 cloud_token_required
    // and does not send the request. This is the input that must reach it.
    setSessionCloudCredentials(PN, {
      googleDriveAccounts: [{ accountId: 'a1', access_token: 'stale-ga', expires_at: Date.now() - 1 }]
    } as never);

    const headers = await ownerCloudHeadersAsync({
      authToken: 'oauth',
      pnIdentifier: PN,
      apiEndpoint: API,
      // No refresh token means no hydrate material, so the wait runs to its
      // limit. Bounded here to keep the assertion about the outcome.
      timeoutMs: 50
    });

    expect(headers[PN_CLOUD_ACCESS_TOKEN_HEADER]).toBeUndefined();
  });

  it('the two builders disagree on the same input, which is the defect', async () => {
    seedExpiredButRefreshable();

    const sync = ownerCloudHeaders({ authToken: 'oauth', pnIdentifier: PN });
    const asyncHeaders = await ownerCloudHeadersAsync({
      authToken: 'oauth',
      pnIdentifier: PN,
      apiEndpoint: API
    });

    expect(sync[PN_CLOUD_ACCESS_TOKEN_HEADER]).toBeUndefined();
    expect(asyncHeaders[PN_CLOUD_ACCESS_TOKEN_HEADER]).toBeTruthy();
  });
});
