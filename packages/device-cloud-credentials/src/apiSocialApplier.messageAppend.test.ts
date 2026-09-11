import { describe, expect, it, vi } from 'vitest';
import { createApiSocialApplier } from './apiSocialApplier.js';
import type { MailboxJob } from './types.js';

describe('createApiSocialApplier message_append', () => {
  it('POSTs opaque message_append to /api/messages/apply-inbound', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const apply = createApiSocialApplier({
      apiBaseUrl: 'https://api.example.test',
      authToken: 'oauth-at',
      identityId: 'pn-recipient',
      getCloudAccessToken: async () => 'cloud-at',
    });

    const job: MailboxJob = {
      jobId: 'job-1',
      routeKey: 'a'.repeat(64),
      jobType: 'message_append',
      createdAt: new Date().toISOString(),
      payload: {
        messageId: 'msg_1',
        encryptedContent: 'ciphertext',
        connectionId: 'conn-1',
        role: 'recipient',
      },
    };

    await expect(apply(job)).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.example.test/api/messages/apply-inbound');
    expect(init.method).toBe('POST');
    const body = JSON.parse(String(init.body));
    expect(body.jobType).toBe('message_append');
    expect(body.connectionId).toBe('conn-1');
    expect(body.userPnIdentifier).toBe('pn-recipient');
    expect(body.fromPnIdentifier).toBeUndefined();
    expect((init.headers as Record<string, string>)['X-PN-Cloud-Access-Token']).toBe('cloud-at');

    vi.unstubAllGlobals();
  });
});
