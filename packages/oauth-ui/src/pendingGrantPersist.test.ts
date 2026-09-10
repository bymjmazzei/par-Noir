import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { clearPendingGrant, hasPendingGrant, setPendingGrant, flushPendingGrant } from './pendingGrantPersist';

describe('pendingGrantPersist', () => {
  beforeEach(() => {
    clearPendingGrant();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ success: true }), { status: 200 }))
    );
  });

  afterEach(() => {
    clearPendingGrant();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
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
    const ok = await flushPendingGrant({
      authToken: 'tok',
      pnIdentifier: 'pn-abc',
      apiEndpoint: 'https://api.example'
    });
    expect(ok).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });
});
