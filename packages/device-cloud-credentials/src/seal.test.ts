import { describe, expect, it } from 'vitest';
import { sealCredentials, unsealCredentials } from '../src/seal.js';
import { WEB_GRACE_TTL_MS } from '../src/types.js';

describe('device-cloud-credentials seal', () => {
  it('round-trips sealed credentials', async () => {
    const session = { sessionId: 's1', pnName: 'alice', passcode: 'secret' };
    const payload = { googleDriveAccounts: [{ accountId: 'a1', refreshToken: 'rt' }] };
    const sealed = await sealCredentials(payload, session, null);
    const opened = await unsealCredentials<typeof payload>(sealed, session);
    expect(opened.googleDriveAccounts?.[0]?.refreshToken).toBe('rt');
  });

  it('rejects expired web grace envelopes', async () => {
    const session = { sessionId: 's1', pnName: 'alice', passcode: 'secret' };
    const sealed = await sealCredentials({ ok: true }, session, new Date(Date.now() - 1000).toISOString());
    await expect(unsealCredentials(sealed, session)).rejects.toThrow(/expired/);
  });

  it('exposes web grace constant', () => {
    expect(WEB_GRACE_TTL_MS).toBeGreaterThan(60_000);
  });
});
