/**
 * @jest-environment node
 *
 * Custodian-held recovery relay: custody, approvals, quorum, release gates.
 */
import type { Request, Response } from 'express';

jest.mock('./deviceCapabilityService', () => ({
  gateOwnerRoute: jest.fn(async (req: { headers: Record<string, string> }) => ({
    pnIdentifier: req.headers['x-test-pn'],
  })),
  assertDeviceCapability: jest.fn(async () => ({ ok: true })),
  getBearerPnIdentifier: jest.fn((req: { headers: Record<string, string> }) => req.headers['x-test-pn'] ?? null),
  DEVICE_CAPABILITIES: new Proxy({}, { get: (_t, p) => String(p) }),
}));

jest.mock('./recoveryZkService', () => ({
  verifyCustodianshipCredential: (zkp: string) => {
    try {
      return { ok: true, data: JSON.parse(zkp) };
    } catch {
      return { ok: false, reason: 'invalid_envelope' };
    }
  },
  verifyRecoveryApprovalPayload: (payload: { approvalZkp: string }) => {
    try {
      const a = JSON.parse(payload.approvalZkp);
      return { ok: true, requestId: a.requestId, identityPublicKey: a.identityPublicKey };
    } catch {
      return { ok: false, reason: 'invalid_approval' };
    }
  },
}));

const resolveRecoveryFailsafe = jest.fn();
jest.mock('./recoveryFailsafeService', () => ({
  resolveRecoveryFailsafe: (...args: unknown[]) => resolveRecoveryFailsafe(...args),
  getFailsafeStatus: jest.fn(),
  upsertRecoveryFailsafe: jest.fn(),
  upsertRecoveryEnvelopeOnly: jest.fn(),
}));

jest.mock('@par-noir/pqc-crypto/oauth-unlock-proof', () => ({
  deriveCanonicalPnIdentifier: (pk: string) => `pn-${pk}`,
}));

const emitNewNotification = jest.fn();
jest.mock('./realtimeEvents', () => ({
  emitNewNotification: (...args: unknown[]) => emitNewNotification(...args),
}));

jest.mock('./pnOAuthService', () => ({ PNOAuthService: { validateAccessToken: jest.fn() } }));

jest.mock('../../utils/logger', () => ({
  safeLogger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
  hashIdentifier: (v: string) => v,
}));

process.env.RECOVERY_PEPPER = 'test-pepper';

import { registerRecoveryRoutes } from './recoveryRoutes';
import { registerRecoveryFailsafeRoutes } from './recoveryFailsafeRoutes';
import { recoveryDriveProofDigest, setRecoveryRelayStoreForTests, sha256Hex } from './recoveryRelayService';
import { createMemoryRecoveryRelayStore } from './recoveryRelay.testStore';

type Handler = (req: Request, res: Response) => Promise<unknown>;

const handlers = new Map<string, Handler>();
const app = {
  get: (path: string, h: Handler) => handlers.set(`GET ${path}`, h),
  post: (path: string, h: Handler) => handlers.set(`POST ${path}`, h),
};
registerRecoveryRoutes(app as never);
registerRecoveryFailsafeRoutes(app as never);

const OWNER = 'pn-owner';
const OWNER_PK = 'owner';
const ML_KEM_PK = Buffer.alloc(1184, 1).toString('base64');
const TEMP_PK = Buffer.alloc(1184, 2).toString('base64');
const DRIVE_PROOF = 'drive-proof-secret';

const CUSTODIANS = [
  { custodianId: 'c1', pn: 'pn-c1', shareIndex: 1, unrevokable: true },
  { custodianId: 'c2', pn: 'pn-c2', shareIndex: 2, unrevokable: false },
  { custodianId: 'c3', pn: 'pn-c3', shareIndex: 3, unrevokable: false },
];

let store: ReturnType<typeof createMemoryRecoveryRelayStore>;

async function call(
  method: 'GET' | 'POST',
  route: string,
  opts: { pn?: string; body?: unknown; params?: Record<string, string> } = {}
): Promise<{ status: number; body: Record<string, any> }> {
  const h = handlers.get(`${method} ${route}`);
  if (!h) throw new Error(`${method} ${route} not registered`);
  let status = 200;
  let body: Record<string, any> = {};
  const res = {
    status(code: number) {
      status = code;
      return res;
    },
    json(payload: Record<string, any>) {
      body = payload;
      return res;
    },
  };
  await h(
    { headers: opts.pn ? { 'x-test-pn': opts.pn } : {}, body: opts.body ?? {}, params: opts.params ?? {} } as never,
    res as never
  );
  return { status, body };
}

function credential(c: (typeof CUSTODIANS)[number]): string {
  return JSON.stringify({
    custodianId: c.custodianId,
    shareIndex: c.shareIndex,
    identityPublicKey: OWNER_PK,
    unrevokable: c.unrevokable,
  });
}

function sealed(index: number): string {
  return JSON.stringify({ v: 1, alg: 'ML-KEM-768+HKDF-SHA256+AES-256-GCM', index, kem: 'k', iv: 'i', ct: 'c' });
}

function approval(c: (typeof CUSTODIANS)[number], requestId: string, approvalZkp?: string) {
  return {
    custodianId: c.custodianId,
    approval: {
      custodianId: c.custodianId,
      shareIndex: c.shareIndex,
      custodianshipZkp: credential(c),
      approvalZkp: approvalZkp ?? JSON.stringify({ requestId, identityPublicKey: OWNER_PK }),
      approvedAt: new Date().toISOString(),
    },
  };
}

async function setupCustody(): Promise<void> {
  expect(
    (await call('POST', '/api/recovery/owner/epoch', {
      pn: OWNER,
      body: { ownerPublicKey: OWNER_PK, threshold: 2, totalShares: 3 },
    })).body.epoch
  ).toBe(1);
  for (const c of CUSTODIANS) {
    const reg = await call('POST', '/api/recovery/owner/custodians', {
      pn: OWNER,
      body: { ...c, name: c.custodianId, custodianType: 'person', custodianshipCredential: credential(c) },
    });
    expect(reg.status).toBe(200);
    const acc = await call('POST', '/api/recovery/custodian/accept', {
      pn: c.pn,
      body: {
        ownerPnIdentifier: OWNER,
        custodianId: c.custodianId,
        custodianshipZkp: credential(c),
        mlKemPublicKey: ML_KEM_PK,
      },
    });
    expect(acc.body.status).toBe('accepted');
    const sent = await call('POST', '/api/recovery/owner/custodians/:custodianId/custody', {
      pn: OWNER,
      params: { custodianId: c.custodianId },
      body: { epoch: 1, sealedShare: sealed(c.shareIndex) },
    });
    expect(sent.status).toBe(200);
    const pulled = await call('GET', '/api/recovery/custodian/custody', { pn: c.pn });
    expect(pulled.body.deliveries).toHaveLength(1);
    const ack = await call('POST', '/api/recovery/custodian/custody/ack', {
      pn: c.pn,
      body: { deliveryIds: pulled.body.deliveries.map((d: { deliveryId: string }) => d.deliveryId) },
    });
    expect(ack.body.acked).toBe(1);
  }
}

async function startRecovery(): Promise<string> {
  const res = await call('POST', '/api/recovery/failsafe/start', {
    body: { keyHash: 'good-key', temporaryPublicKey: TEMP_PK },
  });
  expect(res.status).toBe(200);
  return res.body.requestId as string;
}

function skipReleaseDelay(requestId: string): void {
  const row = store.requests.get(requestId)!;
  store.requests.set(requestId, { ...row, releaseAfter: new Date(Date.now() - 1000).toISOString() });
}

beforeEach(async () => {
  jest.clearAllMocks();
  store = createMemoryRecoveryRelayStore();
  setRecoveryRelayStoreForTests(store);
  resolveRecoveryFailsafe.mockImplementation(async ({ keyHash }: { keyHash: string }) => {
    if (keyHash === 'good-key') {
      return {
        pnIdentifier: OWNER,
        publicKey: OWNER_PK,
        envelope: { v: 1 },
        driveProofDigest: recoveryDriveProofDigest(sha256Hex(DRIVE_PROOF)),
      };
    }
    if (keyHash === 'other-owner-key') {
      return { pnIdentifier: 'pn-someone', publicKey: 'x', envelope: {}, driveProofDigest: 'aa' };
    }
    return null;
  });
  await setupCustody();
});

afterAll(() => setRecoveryRelayStoreForTests(null));

describe('custodian-held recovery', () => {
  it('releases sealed shares after quorum with the protected custodian, delay, key and Drive proof', async () => {
    const requestId = await startRecovery();
    expect(requestId).toBe(sha256Hex(TEMP_PK));
    expect(emitNewNotification).toHaveBeenCalledWith(OWNER, 'recovery_request');

    const pending = await call('GET', '/api/recovery/custodian/requests', { pn: 'pn-c2' });
    expect(pending.body.requests).toEqual([
      expect.objectContaining({ requestId, temporaryPublicKey: TEMP_PK, shareIndex: 2 }),
    ]);

    for (const c of [CUSTODIANS[0], CUSTODIANS[1]]) {
      const res = await call('POST', '/api/recovery/custodian/requests/:requestId/approve', {
        pn: c.pn,
        params: { requestId },
        body: { ...approval(c, requestId), sealedShare: sealed(c.shareIndex) },
      });
      expect(res.status).toBe(200);
    }
    expect(store.requests.get(requestId)!.status).toBe('ready');

    const early = await call('POST', '/api/recovery/requests/:requestId/release', {
      params: { requestId },
      body: { keyHash: 'good-key', driveProof: DRIVE_PROOF },
    });
    expect(early.status).toBe(409);
    expect(early.body.error).toBe('release_delay_active');

    skipReleaseDelay(requestId);
    const released = await call('POST', '/api/recovery/requests/:requestId/release', {
      params: { requestId },
      body: { keyHash: 'good-key', driveProof: DRIVE_PROOF },
    });
    expect(released.status).toBe(200);
    expect(released.body.shares.map((s: { shareIndex: number }) => s.shareIndex).sort()).toEqual([1, 2]);
    expect(released.body.publicKey).toBe(OWNER_PK);
  });

  it('does not reach quorum without the protected custodian', async () => {
    const requestId = await startRecovery();
    for (const c of [CUSTODIANS[1], CUSTODIANS[2]]) {
      await call('POST', '/api/recovery/custodian/requests/:requestId/approve', {
        pn: c.pn,
        params: { requestId },
        body: { ...approval(c, requestId), sealedShare: sealed(c.shareIndex) },
      });
    }
    expect(store.requests.get(requestId)!.status).toBe('pending');
    skipReleaseDelay(requestId);
    const res = await call('POST', '/api/recovery/requests/:requestId/release', {
      params: { requestId },
      body: { keyHash: 'good-key', driveProof: DRIVE_PROOF },
    });
    expect(res.body.error).toBe('request_not_ready');
  });

  it('rejects release with the wrong Drive proof or recovery key', async () => {
    const requestId = await startRecovery();
    const wrongProof = await call('POST', '/api/recovery/requests/:requestId/release', {
      params: { requestId },
      body: { keyHash: 'good-key', driveProof: 'not-the-proof' },
    });
    expect(wrongProof).toEqual({ status: 403, body: { error: 'drive_proof_mismatch' } });
    const wrongKey = await call('POST', '/api/recovery/requests/:requestId/release', {
      params: { requestId },
      body: { keyHash: 'unknown', driveProof: DRIVE_PROOF },
    });
    expect(wrongKey).toEqual({ status: 403, body: { error: 'invalid_recovery_key' } });
    const otherOwner = await call('POST', '/api/recovery/requests/:requestId/release', {
      params: { requestId },
      body: { keyHash: 'other-owner-key', driveProof: DRIVE_PROOF },
    });
    expect(otherOwner.status).toBe(403);
  });

  it('rejects approvals that are not signed proofs or are bound to another request', async () => {
    const requestId = await startRecovery();
    const binding = await call('POST', '/api/recovery/custodian/requests/:requestId/approve', {
      pn: 'pn-c1',
      params: { requestId },
      body: { ...approval(CUSTODIANS[0], requestId, 'passcode-binding'), sealedShare: sealed(1) },
    });
    expect(binding.status).toBe(400);
    expect(binding.body.error).toBe('invalid_approval');

    const otherRequest = await call('POST', '/api/recovery/custodian/requests/:requestId/approve', {
      pn: 'pn-c1',
      params: { requestId },
      body: { ...approval(CUSTODIANS[0], 'some-other-request'), sealedShare: sealed(1) },
    });
    expect(otherRequest.body.error).toBe('approval_request_mismatch');

    const wrongCustodianSession = await call('POST', '/api/recovery/custodian/requests/:requestId/approve', {
      pn: 'pn-c2',
      params: { requestId },
      body: { ...approval(CUSTODIANS[0], requestId), sealedShare: sealed(1) },
    });
    expect(wrongCustodianSession.status).toBe(403);
  });

  it('rotating the epoch cancels active requests and stale custodians cannot approve', async () => {
    const requestId = await startRecovery();
    const rotated = await call('POST', '/api/recovery/owner/epoch', {
      pn: OWNER,
      body: { ownerPublicKey: OWNER_PK, threshold: 2, totalShares: 3, rotate: true },
    });
    expect(rotated.body.epoch).toBe(2);
    expect(store.requests.get(requestId)!.status).toBe('cancelled');

    const restart = await call('POST', '/api/recovery/failsafe/start', {
      body: { keyHash: 'good-key', temporaryPublicKey: Buffer.alloc(1184, 3).toString('base64') },
    });
    expect(restart.body.error).toBe('custodians_not_ready');

    const staleCustody = await call('POST', '/api/recovery/owner/custodians/:custodianId/custody', {
      pn: OWNER,
      params: { custodianId: 'c1' },
      body: { epoch: 1, sealedShare: sealed(1) },
    });
    expect(staleCustody.body.error).toBe('stale_epoch');
  });

  it('owner can cancel a request, which blocks release', async () => {
    const requestId = await startRecovery();
    const list = await call('GET', '/api/recovery/owner/requests', { pn: OWNER });
    expect(list.body.requests[0]).toEqual(expect.objectContaining({ requestId, status: 'pending' }));
    const cancel = await call('POST', '/api/recovery/owner/requests/:requestId/cancel', {
      pn: OWNER,
      params: { requestId },
    });
    expect(cancel.body.status).toBe('cancelled');
    const notOwner = await call('POST', '/api/recovery/owner/requests/:requestId/cancel', {
      pn: 'pn-c1',
      params: { requestId },
    });
    expect(notOwner.status).toBe(404);
    const release = await call('POST', '/api/recovery/requests/:requestId/release', {
      params: { requestId },
      body: { keyHash: 'good-key', driveProof: DRIVE_PROOF },
    });
    expect(release.body.error).toBe('request_cancelled');
  });

  it('protects threshold and the unrevokable custodian on revoke', async () => {
    const protectedRevoke = await call('POST', '/api/recovery/owner/custodians/:custodianId/revoke', {
      pn: OWNER,
      params: { custodianId: 'c1' },
    });
    expect(protectedRevoke.body.error).toBe('custodian_unrevokable');
    const first = await call('POST', '/api/recovery/owner/custodians/:custodianId/revoke', {
      pn: OWNER,
      params: { custodianId: 'c3' },
    });
    expect(first.body).toEqual(expect.objectContaining({ success: true, resplitRequired: true }));
    const second = await call('POST', '/api/recovery/owner/custodians/:custodianId/revoke', {
      pn: OWNER,
      params: { custodianId: 'c2' },
    });
    expect(second.body.error).toBe('revoke_would_break_threshold');
  });

  it('owner summary reports custody delivery state per custodian', async () => {
    await call('POST', '/api/recovery/owner/epoch', {
      pn: OWNER,
      body: { ownerPublicKey: OWNER_PK, threshold: 2, totalShares: 3, rotate: true },
    });
    await call('POST', '/api/recovery/owner/custodians/:custodianId/custody', {
      pn: OWNER,
      params: { custodianId: 'c1' },
      body: { epoch: 2, sealedShare: sealed(1) },
    });
    const summary = await call('GET', '/api/recovery/owner/summary', { pn: OWNER });
    const c1 = summary.body.custodians.find((c: { custodianId: string }) => c.custodianId === 'c1');
    const c2 = summary.body.custodians.find((c: { custodianId: string }) => c.custodianId === 'c2');
    expect(c1).toEqual(expect.objectContaining({ custodyPending: true, custodyCurrent: false, mlKemPublicKey: ML_KEM_PK }));
    expect(c2).toEqual(expect.objectContaining({ custodyPending: false, custodyCurrent: false }));
    expect(summary.body.counts.ready).toBe(0);
  });

  it('validates recovery start and owner key binding', async () => {
    const badKey = await call('POST', '/api/recovery/failsafe/start', {
      body: { keyHash: 'good-key', temporaryPublicKey: 'short' },
    });
    expect(badKey.body.error).toBe('invalid_temporary_public_key');

    resolveRecoveryFailsafe.mockResolvedValueOnce({
      pnIdentifier: OWNER,
      publicKey: OWNER_PK,
      envelope: {},
      driveProofDigest: null,
    });
    const noProof = await call('POST', '/api/recovery/failsafe/start', {
      body: { keyHash: 'good-key', temporaryPublicKey: TEMP_PK },
    });
    expect(noProof.body.error).toBe('drive_proof_not_registered');

    const mismatch = await call('POST', '/api/recovery/owner/epoch', {
      pn: OWNER,
      body: { ownerPublicKey: 'someone-else', threshold: 2, totalShares: 3 },
    });
    expect(mismatch.body.error).toBe('owner_key_mismatch');
  });

  it('device registry reset collects approvals without shares and cannot be released', async () => {
    const start = await call('POST', '/api/recovery/owner/device-reset', { pn: OWNER });
    const requestId = start.body.requestId as string;
    expect(requestId).toMatch(/^device-reset-/);
    for (const c of [CUSTODIANS[0], CUSTODIANS[1]]) {
      const res = await call('POST', '/api/recovery/custodian/requests/:requestId/approve', {
        pn: c.pn,
        params: { requestId },
        body: approval(c, requestId),
      });
      expect(res.status).toBe(200);
    }
    expect(store.requests.get(requestId)!.status).toBe('ready');
    expect(await store.listReleaseDeliveries(requestId)).toHaveLength(0);
    const release = await call('POST', '/api/recovery/requests/:requestId/release', {
      params: { requestId },
      body: { keyHash: 'good-key', driveProof: DRIVE_PROOF },
    });
    expect(release.body.error).toBe('wrong_request_type');
  });
});
