import { describe, expect, it, vi } from 'vitest';
import { createApiSocialApplier } from './apiSocialApplier.js';
import { setSessionDriveIndex } from './sessionMemory.js';
import type { MailboxJob } from './types.js';

describe('createApiSocialApplier message_append', () => {
  it('POSTs opaque message_append to /api/messages/apply-inbound', async () => {
    setSessionDriveIndex('pn-recipient', {
      schemaVersion: 1,
      pnFolderId: 'pn-folder',
      metadataFolderId: 'meta',
      integratorsRootId: 'int',
      messagesFolderId: 'msg',
      inboxSheetId: 'sheet-1',
      sheetIds: { connections: 'sheet-connections' },
      conversationSheets: {},
    });
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('sheets.googleapis.com')) {
        expect(String(url)).toContain('sheet-1');
        expect(String(url)).not.toContain('api.parnoir.com');
        return new Response('{}', { status: 200 });
      }
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    });
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
    const apiCall = fetchMock.mock.calls.find((call) =>
      String(call[0]).includes('/api/messages/apply-inbound')
    );
    expect(apiCall).toBeDefined();
    const url = apiCall![0] as string;
    const init = apiCall![1] as RequestInit;
    expect(url).toBe('https://api.example.test/api/messages/apply-inbound');
    expect(init.method).toBe('POST');
    const body = JSON.parse(String(init.body));
    expect(body.jobType).toBe('message_append');
    expect(body.connectionId).toBe('conn-1');
    expect(body.userPnIdentifier).toBe('pn-recipient');
    expect(body.fromPnIdentifier).toBeUndefined();
    expect(body.deviceCloudResult.spreadsheetId).toBe('sheet-1');
    expect((init.headers as Record<string, string>)['X-PN-Cloud-Access-Token']).toBeUndefined();
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes('sheets.googleapis.com'))).toBe(true);

    vi.unstubAllGlobals();
  });

  it('writes a connection request onto the connections sheet and posts a receipt', async () => {
    setSessionDriveIndex('pn-recipient', {
      schemaVersion: 1,
      pnFolderId: 'pn-folder',
      metadataFolderId: 'meta',
      integratorsRootId: 'int',
      messagesFolderId: 'msg',
      inboxSheetId: 'inbox-sheet',
      sheetIds: { connections: 'sheet-connections' },
      conversationSheets: {},
    });
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const href = String(url);
      if (href.includes('sheets.googleapis.com')) {
        return new Response(JSON.stringify({ values: [] }), { status: 200 });
      }
      const body = JSON.parse(String(init?.body || '{}'));
      expect(href).toContain('/api/connections/apply-inbound');
      expect(body.deviceCloudResult.spreadsheetId).toBe('sheet-connections');
      expect(body.deviceCloudResult.provider).toBe('google');
      expect((init?.headers as Record<string, string>)['X-PN-Cloud-Access-Token']).toBeUndefined();
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const apply = createApiSocialApplier({
      apiBaseUrl: 'https://api.example.test',
      authToken: 'oauth-at',
      identityId: 'pn-recipient',
      getCloudAccessToken: async () => 'cloud-at',
    });
    const job: MailboxJob = {
      id: 'job-conn',
      routeKey: 'b'.repeat(64),
      jobType: 'connection_request',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      payload: {
        connectionId: 'conn-9',
        peerPnIdentifier: 'pn-sender',
        peerMailboxRouteKey: 'c'.repeat(64),
      },
    };
    await expect(apply(job)).resolves.toBe(true);
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes('sheets.googleapis.com'))).toBe(true);
    vi.unstubAllGlobals();
  });

  it('writes an accepted connection and an inbox thread before the receipt', async () => {
    setSessionDriveIndex('pn-recipient', {
      schemaVersion: 1,
      pnFolderId: 'pn-folder',
      metadataFolderId: 'meta',
      integratorsRootId: 'int',
      messagesFolderId: 'msg',
      inboxSheetId: 'inbox-sheet',
      sheetIds: { connections: 'sheet-connections' },
      conversationSheets: {},
    });
    const sheetUrls: string[] = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const href = String(url);
      if (href.includes('sheets.googleapis.com')) {
        sheetUrls.push(href);
        return new Response(JSON.stringify({ values: [] }), { status: 200 });
      }
      const body = JSON.parse(String(init?.body || '{}'));
      expect(body.jobType).toBe('connection_accept');
      expect(body.deviceCloudResult.spreadsheetId).toBe('sheet-connections');
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const apply = createApiSocialApplier({
      apiBaseUrl: 'https://api.example.test',
      authToken: 'oauth-at',
      identityId: 'pn-recipient',
      getCloudAccessToken: async () => 'cloud-at',
    });
    const job: MailboxJob = {
      id: 'job-accept',
      routeKey: 'd'.repeat(64),
      jobType: 'connection_accept',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      payload: {
        connectionId: 'conn-9',
        peerPnIdentifier: 'pn-sender',
        conversationSpreadsheetId: 'dm-sheet',
        kemCiphertext: 'kem',
        wrappedMessageRootKey: 'wrap',
      },
    };
    await expect(apply(job)).resolves.toBe(true);
    expect(sheetUrls.some((href) => href.includes('sheet-connections'))).toBe(true);
    expect(sheetUrls.some((href) => href.includes('inbox-sheet'))).toBe(true);
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
    const apiCall = fetchMock.mock.calls.find((call) => String(call[0]).includes('/api/pen/apply-inbound'));
    const body = JSON.parse(String((apiCall![1] as RequestInit).body));
    expect(body.jobType).toBe('pen.poll_vote');
    expect(body.optionId).toBe('yes');
    expect(body.spreadsheetId).toBe('sheet-1');
    vi.unstubAllGlobals();
  });
});
