import { afterEach, beforeEach, expect, test, vi } from 'vitest';

const h = vi.hoisted(() => ({
  fetchMailboxPending: vi.fn(),
  setInterval: vi.fn(),
}));

vi.mock('@par-noir/device-cloud-credentials', () => ({
  ackMailboxJobsRemote: vi.fn(async () => 0),
  ensureMailboxRouteKey: vi.fn(async () => 'a'.repeat(64)),
  fetchMailboxPending: (...args: unknown[]) => h.fetchMailboxPending(...args),
  createApiSocialApplier: () => async () => true,
  getCloudAccessTokenFromSession: () => 'cloud-at',
  PN_CLOUD_CREDENTIALS_READY_EVENT: 'pn-cloud-credentials-ready',
  waitForCloudCredentialsReady: vi.fn(async () => true),
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
vi.mock('./sessionDrive', () => ({ sessionDriveFor: vi.fn(async () => ({ accessToken: 'cloud-at', index: {} })) }));
vi.mock('./inboundMailboxPreview', () => ({ tryBuildInboundPreview: vi.fn() }));
vi.mock('./messageService', () => ({
  notifyMessagingInboxRefresh: vi.fn(),
  notifyMessagingMailboxApplied: vi.fn(),
}));

import {
  requestHotDrain,
  startSocialMailboxConsumer,
  stopSocialMailboxConsumer,
} from './socialMailboxConsumer';

beforeEach(() => {
  h.fetchMailboxPending.mockReset().mockResolvedValue([]);
  h.setInterval.mockReset().mockReturnValue(1);
  vi.stubGlobal('document', {
    visibilityState: 'hidden',
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  vi.stubGlobal('window', {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    setInterval: h.setInterval,
  });
});

afterEach(() => {
  stopSocialMailboxConsumer();
  vi.unstubAllGlobals();
});

test('hidden tab, not unlocked: realtime hint does not drain', async () => {
  await requestHotDrain();
  expect(h.fetchMailboxPending).not.toHaveBeenCalled();
});

test('hidden tab while unlocked: realtime hint drains', async () => {
  startSocialMailboxConsumer();
  await vi.waitFor(() => expect(h.fetchMailboxPending).toHaveBeenCalledTimes(1), { timeout: 2000 });
  await requestHotDrain();
  expect(h.fetchMailboxPending).toHaveBeenCalledTimes(2);
});

test('hidden tab while unlocked: the slow backstop stays visible-only', async () => {
  startSocialMailboxConsumer();
  await vi.waitFor(() => expect(h.fetchMailboxPending).toHaveBeenCalledTimes(1), { timeout: 2000 });
  const backstop = h.setInterval.mock.calls[0][0] as () => void;
  backstop();
  await new Promise((r) => setTimeout(r, 600));
  expect(h.fetchMailboxPending).toHaveBeenCalledTimes(1);
});
