import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@par-noir/device-cloud-credentials', () => ({
  ensureCloudAccessToken: vi.fn(),
  heldProofsFor: vi.fn(),
}));

import { ensureCloudAccessToken, heldProofsFor } from '@par-noir/device-cloud-credentials';
import { clearPendingGrant, hasPendingGrant, setPendingGrant, flushPendingGrant } from './pendingGrantPersist';

const PARAMS = { authToken: 'tok', pnIdentifier: 'pn-abc', apiEndpoint: 'https://api.example' };

function sentBody(): Record<string, unknown> {
  const init = vi.mocked(fetch).mock.calls[0][1] as RequestInit;
  return JSON.parse(String(init.body));
}

describe('pendingGrantPersist', () => {
  beforeEach(() => {
    clearPendingGrant();
    vi.clearAllMocks();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ success: true }), { status: 200 }))
    );
  });

  afterEach(() => {
    clearPendingGrant();
    vi.unstubAllGlobals();
  });

  it('stores and clears pending grant in memory only', () => {
    expect(hasPendingGrant()).toBe(false);
    setPendingGrant('browser-app', ['display_name']);
    expect(hasPendingGrant()).toBe(true);
    clearPendingGrant();
    expect(hasPendingGrant()).toBe(false);
  });

  it('ignores empty clientId', () => {
    setPendingGrant('  ', ['display_name']);
    expect(hasPendingGrant()).toBe(false);
  });

  it('flushPendingGrant no-ops without pending', async () => {
    expect(await flushPendingGrant(PARAMS)).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('sends the choice with the proofs read on this device, and no cloud token', async () => {
    vi.mocked(ensureCloudAccessToken).mockResolvedValue('drive-at');
    const proofs = [{ dataPointId: 'over_21', zkpProof: 'p' }];
    vi.mocked(heldProofsFor).mockResolvedValue(proofs as never);
    setPendingGrant('browser-app', ['over_21']);

    expect(await flushPendingGrant(PARAMS)).toBe(true);

    expect(heldProofsFor).toHaveBeenCalledWith({
      accessToken: 'drive-at',
      pnIdentifier: 'pn-abc',
      dataPointIds: ['over_21'],
    });
    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.example/oauth/grant/persist');
    expect(JSON.stringify(init.headers)).not.toMatch(/drive-at|Cloud-Access/i);
    expect(sentBody()).toEqual({
      client_id: 'browser-app',
      granted_data_points: ['over_21'],
      released_proofs: proofs,
    });
    expect(hasPendingGrant()).toBe(false);
  });

  it('persists a share-nothing choice without touching the cloud', async () => {
    setPendingGrant('browser-app', []);
    expect(await flushPendingGrant(PARAMS)).toBe(true);
    expect(ensureCloudAccessToken).not.toHaveBeenCalled();
    expect(sentBody().released_proofs).toEqual([]);
  });

  it('keeps the choice pending until the cloud vault is hydrated', async () => {
    vi.mocked(ensureCloudAccessToken).mockResolvedValue(null);
    setPendingGrant('browser-app', ['over_21']);
    expect(await flushPendingGrant(PARAMS)).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
    expect(hasPendingGrant()).toBe(true);
  });
});
