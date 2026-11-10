import { beforeEach, expect, test, vi } from 'vitest';

const h = vi.hoisted(() => ({
  waitForCloudCredentialsReady: vi.fn(),
  sessionSocialFor: vi.fn(),
  fetchMailboxPending: vi.fn(),
  createApiSocialApplier: vi.fn(),
}));

vi.mock('@par-noir/device-cloud-credentials', () => ({
  ackMailboxJobsRemote: vi.fn(async () => 0),
  ensureMailboxRouteKey: vi.fn(async () => 'a'.repeat(64)),
  fetchMailboxPending: (...args: unknown[]) => h.fetchMailboxPending(...args),
  createApiSocialApplier: (...args: unknown[]) => h.createApiSocialApplier(...args),
  getCloudAccessTokenFromSession: () => 'cloud-at',
  PN_CLOUD_CREDENTIALS_READY_EVENT: 'pn-cloud-credentials-ready',
  waitForCloudCredentialsReady: (...args: unknown[]) => h.waitForCloudCredentialsReady(...args),
}));
vi.mock('@par-noir/dm-crypto', () => ({ openSocialEnvelope: vi.fn() }));
vi.mock('@par-noir/device-client', () => ({ loadDeviceRegistration: vi.fn(async () => null) }));
vi.mock('../config/api', () => ({ API_ENDPOINT: 'https://api.example.test' }));
vi.mock('./pnOAuthService', () => ({
  PNOAuthService: {
    loadSession: () => ({ pnIdentifier: 'pn-me', accessToken: 'oauth-at' }),
    isSessionValid: () => true,
  },
}));
vi.mock('./dmIdentitySession', () => ({ getDmIdentity: () => ({ mlKemSecretKey: 'sk' }) }));
vi.mock('./deviceService', () => ({ fetchDeviceRegistry: vi.fn(async () => null) }));
vi.mock('./sessionSocial', () => ({ sessionSocialFor: (...args: unknown[]) => h.sessionSocialFor(...args) }));
vi.mock('./inboundMailboxPreview', () => ({ tryBuildInboundPreview: vi.fn() }));
vi.mock('./messageService', () => ({
  notifyMessagingInboxRefresh: vi.fn(),
  notifyMessagingMailboxApplied: vi.fn(),
}));

import { drainSocialMailbox, requestHotDrain } from './socialMailboxConsumer';

beforeEach(() => {
  h.waitForCloudCredentialsReady.mockReset().mockResolvedValue(true);
  h.sessionSocialFor.mockReset().mockResolvedValue({ kind: 'google_drive', accessToken: 'cloud-at', index: {} });
  h.fetchMailboxPending.mockReset().mockResolvedValue([]);
  h.createApiSocialApplier.mockReset().mockReturnValue(async () => true);
});

test('does not fetch or apply mailbox jobs until cloud credentials are ready', async () => {
  h.waitForCloudCredentialsReady.mockResolvedValue(false);
  const result = await drainSocialMailbox();
  expect(result).toEqual({ pulled: 0, applied: 0, acked: 0, errors: [] });
  expect(h.fetchMailboxPending).not.toHaveBeenCalled();
  expect(h.createApiSocialApplier).not.toHaveBeenCalled();
});

test('defers the drain when the Drive layout cannot load, leaving jobs pending', async () => {
  h.sessionSocialFor.mockRejectedValue(new Error('cloud_on_device'));
  const result = await drainSocialMailbox();
  expect(result.errors).toEqual(['drive: cloud_on_device']);
  expect(h.fetchMailboxPending).not.toHaveBeenCalled();
  expect(h.createApiSocialApplier).not.toHaveBeenCalled();
});

test('a drain requested while one is running runs again afterwards instead of being dropped', async () => {
  let release!: () => void;
  h.fetchMailboxPending.mockImplementationOnce(
    () => new Promise((resolve) => {
      release = () => resolve([]);
    })
  );

  void requestHotDrain();
  await vi.waitFor(() => expect(h.fetchMailboxPending).toHaveBeenCalledTimes(1), { timeout: 2000 });

  const during = requestHotDrain();
  await expect(during).resolves.toEqual({ pulled: 0, applied: 0, acked: 0, errors: [] });
  expect(h.fetchMailboxPending).toHaveBeenCalledTimes(1);

  release();
  await vi.waitFor(() => expect(h.fetchMailboxPending).toHaveBeenCalledTimes(2), { timeout: 3000 });
});
