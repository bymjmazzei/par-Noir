/**
 * Prism API client unit tests (hermetic; fetch + cloud headers mocked).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@par-noir/device-cloud-credentials', () => ({
  omitCloudAccessHeader: (headers?: Record<string, string> | null) => {
    if (!headers) return {};
    const out = { ...headers };
    delete out['X-PN-Cloud-Access-Token'];
    delete out['x-pn-cloud-access-token'];
    return out;
  },
}));

vi.mock('../config/api', () => ({
  API_ENDPOINT: 'https://api.test.parnoir',
}));

import {
  fetchAdminCheck,
  fetchAdminStats,
  fetchQueue,
  fetchReputation,
  getPrismPnIdentifier,
  prismOwnerFetch,
  seedDemoQueue,
  setPrismPnIdentifier,
  submitRayApply,
  submitVote,
} from './prismApi';

describe('prismApi', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    setPrismPnIdentifier(null);
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('pn identifier', () => {
    it('sets and gets trimmed pn', () => {
      setPrismPnIdentifier('  pn-abc  ');
      expect(getPrismPnIdentifier()).toBe('pn-abc');
      setPrismPnIdentifier(null);
      expect(getPrismPnIdentifier()).toBeNull();
      setPrismPnIdentifier(undefined);
      expect(getPrismPnIdentifier()).toBeNull();
    });
  });

  describe('bearer-only helpers', () => {
    it('fetchQueue calls queue with Authorization', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ items: [{ id: 'q1', file_id: 'f1' }] }),
      });
      const items = await fetchQueue('tok-1');
      expect(items).toEqual([{ id: 'q1', file_id: 'f1' }]);
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.test.parnoir/api/prism/queue?limit=20',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer tok-1',
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('submitVote POSTs vote body with bearer', async () => {
      fetchMock.mockResolvedValue({ ok: true });
      await submitVote('tok-2', 'qi-1', 'approve');
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.test.parnoir/api/prism/vote',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ Authorization: 'Bearer tok-2' }),
          body: JSON.stringify({ queueItemId: 'qi-1', vote: 'approve' }),
        })
      );
    });

    it('fetchReputation and submitRayApply use bearer', async () => {
      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ score: 50, eligible: true }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true, applicationId: 'app-1' }),
        });
      await expect(fetchReputation('tok-r')).resolves.toMatchObject({ score: 50 });
      await expect(submitRayApply('tok-a')).resolves.toMatchObject({
        success: true,
        applicationId: 'app-1',
      });
      expect(fetchMock.mock.calls[0][0]).toBe('https://api.test.parnoir/api/prism/reputation');
      expect(fetchMock.mock.calls[1][0]).toBe('https://api.test.parnoir/api/prism/apply');
    });

    it('admin helpers use bearer URLs', async () => {
      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ isAdmin: true, isBootstrapMode: false }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ pending: 1, approved: 0, denied: 0 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ added: 1, fileIds: ['f'], message: 'ok' }),
        });
      await expect(fetchAdminCheck('tok')).resolves.toEqual({
        isAdmin: true,
        isBootstrapMode: false,
      });
      await expect(fetchAdminStats('tok')).resolves.toEqual({
        pending: 1,
        approved: 0,
        denied: 0,
      });
      await expect(seedDemoQueue('tok', 3)).resolves.toMatchObject({ added: 1 });
      expect(fetchMock.mock.calls[2][0]).toBe(
        'https://api.test.parnoir/api/prism/admin/seed-demo?limit=3'
      );
    });

    it('fetchQueue throws on non-ok', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        text: async () => 'nope',
      });
      await expect(fetchQueue('tok')).rejects.toThrow('nope');
    });
  });

  describe('prismOwnerFetch', () => {
    it('sends the bearer and drops a provider access token', async () => {
      setPrismPnIdentifier('pn-owner');
      fetchMock.mockResolvedValue(new Response('ok', { status: 200 }));
      const res = await prismOwnerFetch('/api/prism/preview?fileId=1', 'tok', {
        pnIdentifier: 'pn-owner',
        headers: { 'X-PN-Cloud-Access-Token': 'ga-token' },
      });
      expect(res.status).toBe(200);
      const init = fetchMock.mock.calls[0][1] as { headers: Record<string, string> };
      expect(init.headers.Authorization).toBe('Bearer tok');
      expect(init.headers['X-PN-Cloud-Access-Token']).toBeUndefined();
    });
  });
});
