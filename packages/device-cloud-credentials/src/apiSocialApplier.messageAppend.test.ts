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
      id: 'job-1',
      routeKey: 'a'.repeat(64),
      jobType: 'message_append',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      payload: {
        messageId: 'msg_1',
        encryptedContent: 'ciphertext',
        connectionId: 'conn-1',
        role: 'recipient',
      },
    };

    await expect(apply(job)).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0];
    expect(call).toBeDefined();
    const url = call![0] as string;
    const init = call![1] as RequestInit;
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

  it('opens a sealed pen.poll_vote and leaves it when no opener is available', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const job: MailboxJob = {
      id: 'job-vote',
      routeKey: 'a'.repeat(64),
      jobType: 'pen.poll_vote',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      payload: {
        envelope: { kemCiphertext: 'kem', ciphertext: 'ct' },
        envelopeContext: 'vote-1'
      }
    };
    const sealed = createApiSocialApplier({
      apiBaseUrl: 'https://api.example.test',
      authToken: 'oauth-at',
      identityId: 'pn-owner',
      getCloudAccessToken: async () => 'cloud-at'
    });
    await expect(sealed(job)).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();

    const opened = createApiSocialApplier({
      apiBaseUrl: 'https://api.example.test',
      authToken: 'oauth-at',
      identityId: 'pn-owner',
      getCloudAccessToken: async () => 'cloud-at',
      openEnvelope: async () => ({ optionId: 'yes', spreadsheetId: 'sheet-1', voteId: 'v1' })
    });
    await expect(opened(job)).resolves.toBe(true);
    const body = JSON.parse(String((fetchMock.mock.calls[0]![1] as RequestInit).body));
    expect(body.jobType).toBe('pen.poll_vote');
    expect(body.optionId).toBe('yes');
    expect(body.spreadsheetId).toBe('sheet-1');
    vi.unstubAllGlobals();
  });
});
