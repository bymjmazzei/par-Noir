import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./deviceDriveLayout.js', () => ({
  ensureDeviceDriveLayout: vi.fn(async () => ({
    schemaVersion: 1,
    pnFolderId: 'pn-folder',
    metadataFolderId: 'meta-folder',
    integratorsRootId: 'int',
    messagesFolderId: 'msg',
    inboxSheetId: 'inbox',
    filesFolderId: 'files',
    sheetIds: { connections: 's1', 'owner-file-index': 's2' },
    conversationSheets: {},
  })),
  clearDeviceDriveLayoutInflight: vi.fn(),
}));

import {
  buildLayoutCredentialsForPut,
  CloudRegistrationIncomplete,
  ensureServerCloudRegistration,
  storageAccountsHasLayout,
} from './serverCloudRegistration.js';

const PN = 'pn-test-reg';
const API = 'https://api.example.com';
const BEARER = 'owner-bearer';
const GOOGLE = 'google-access';

function minimalEnvelope() {
  return {
    socialCloudProvider: 'google_drive' as const,
    socialCloudAccountId: 'acc-1',
    googleDriveAccounts: [
      {
        accountId: 'acc-1',
        email: 'u@example.com',
        accessToken: 'secret-at',
        refreshToken: 'secret-rt',
      },
    ],
  };
}

describe('buildLayoutCredentialsForPut', () => {
  it('strips provider secrets from account shells', () => {
    const body = buildLayoutCredentialsForPut(minimalEnvelope());
    expect(body).not.toBeNull();
    const acct = (body!.googleDriveAccounts as Record<string, unknown>[])[0];
    expect(acct.accessToken).toBeUndefined();
    expect(acct.refreshToken).toBeUndefined();
    expect(acct.accountId).toBe('acc-1');
    expect(body!.socialCloudProvider).toBe('google_drive');
  });
});

describe('storageAccountsHasLayout', () => {
  it('is true when socialCloudProvider is set', () => {
    expect(storageAccountsHasLayout({ accounts: [], socialCloudProvider: 'google_drive' })).toBe(
      true
    );
  });
});

describe('ensureServerCloudRegistration', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('runs PUT then POST initialize then GET accounts', async () => {
    const calls: string[] = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? 'GET'} ${url}`);
      if (url.includes('/api/storage/credentials/') && init?.method === 'PUT') {
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }
      if (url.includes('/api/storage/initialize/') && init?.method === 'POST') {
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }
      if (url.includes('/api/storage/accounts/')) {
        return new Response(
          JSON.stringify({
            success: true,
            accounts: [{ provider: 'google_drive', accountId: 'acc-1' }],
            socialCloudProvider: 'google_drive',
          }),
          { status: 200 }
        );
      }
      return new Response('not found', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await ensureServerCloudRegistration({
      apiEndpoint: API,
      authToken: BEARER,
      pnIdentifier: PN,
      envelope: minimalEnvelope(),
      googleAccessToken: GOOGLE,
    });

    expect(result.accounts.length).toBe(1);
    expect(calls.some((c) => c.startsWith('PUT ') && c.includes('/storage/credentials/'))).toBe(
      true
    );
    expect(calls.some((c) => c.startsWith('POST ') && c.includes('/storage/initialize/'))).toBe(
      true
    );
    expect(calls.some((c) => c.startsWith('GET ') && c.includes('/storage/accounts/'))).toBe(true);
  });

  it('throws when POST initialize runs without prior PUT row (404)', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/api/storage/credentials/') && init?.method === 'PUT') {
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }
      if (url.includes('/api/storage/initialize/') && init?.method === 'POST') {
        return new Response(JSON.stringify({ error: 'No storage credentials found' }), {
          status: 404,
        });
      }
      return new Response('{}', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      ensureServerCloudRegistration({
        apiEndpoint: API,
        authToken: BEARER,
        pnIdentifier: PN,
        envelope: minimalEnvelope(),
        googleAccessToken: GOOGLE,
      })
    ).rejects.toMatchObject({ phase: 'init_failed', status: 404 });
  });

  it('throws verify_empty when accounts stay empty after init', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/api/storage/credentials/') && init?.method === 'PUT') {
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }
      if (url.includes('/api/storage/initialize/')) {
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }
      if (url.includes('/api/storage/accounts/')) {
        return new Response(
          JSON.stringify({ success: true, accounts: [], socialCloudProvider: null }),
          { status: 200 }
        );
      }
      return new Response('{}', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      ensureServerCloudRegistration({
        apiEndpoint: API,
        authToken: BEARER,
        pnIdentifier: PN,
        envelope: minimalEnvelope(),
        googleAccessToken: GOOGLE,
      })
    ).rejects.toBeInstanceOf(CloudRegistrationIncomplete);
  });
});
