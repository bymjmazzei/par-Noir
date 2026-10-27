/**
 * @jest-environment jsdom
 */
import { TextEncoder, TextDecoder } from 'util';
import { webcrypto } from 'crypto';
import {
  generateRecoveryKeyPair,
  generateRecoveryMaster,
  recoveryRequestIdFor,
  splitSecret,
  type RecoveryKeyPair,
} from '@par-noir/recovery-crypto';

if (typeof globalThis.TextEncoder === 'undefined') {
  globalThis.TextEncoder = TextEncoder as typeof globalThis.TextEncoder;
  globalThis.TextDecoder = TextDecoder as typeof globalThis.TextDecoder;
}
Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });

const OWNER_PK = 'owner-identity-public-key';
const CUSTODIAN_ID = 'cust-1';
const EPOCH = 3;

let custodianKeys: RecoveryKeyPair;
const driveFiles = new Map<string, unknown[]>();
const driveProofs = new Map<string, string>();
const relay = {
  deliveries: [] as Array<Record<string, unknown>>,
  acked: [] as string[],
  approvals: [] as Array<Record<string, unknown>>,
  startPayload: null as null | Record<string, unknown>,
  releasePayload: null as null | Record<string, unknown>,
};

jest.mock('../services/recoveryApiService', () => ({
  sendCustodyDelivery: jest.fn(async (_t: string, custodianId: string, p: { epoch: number; sealedShare: string }) => {
    relay.deliveries.push({
      deliveryId: `d-${relay.deliveries.length + 1}`,
      ownerPublicKey: OWNER_PK,
      custodianId,
      shareIndex: 2,
      epoch: p.epoch,
      sealedShare: p.sealedShare,
    });
    return { success: true };
  }),
  fetchCustodyDeliveries: jest.fn(async () => relay.deliveries),
  ackCustodyDeliveries: jest.fn(async (_t: string, ids: string[]) => {
    relay.acked.push(...ids);
    return ids.length;
  }),
  submitRecoveryApproval: jest.fn(async (_t: string, requestId: string, payload: Record<string, unknown>) => {
    relay.approvals.push({ requestId, ...payload });
    return { status: 'ready', approvalCount: 1, includesUnrevokableShare: true };
  }),
  hashRecoveryKey: jest.fn(async () => 'a'.repeat(64)),
  startRecoveryWithFailsafeKey: jest.fn(async (p: Record<string, unknown>) => {
    relay.startPayload = p;
    return {
      requestId: await recoveryRequestIdFor(p.temporaryPublicKey as string),
      pnIdentifier: 'pn-owner',
      publicKey: OWNER_PK,
      envelope: {},
      threshold: 2,
      releaseAfter: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    };
  }),
  releaseRecoveryShares: jest.fn(async (requestId: string, p: Record<string, unknown>) => {
    relay.releasePayload = { requestId, ...p };
    return {
      pnIdentifier: 'pn-owner',
      publicKey: OWNER_PK,
      envelope: {},
      shares: relay.approvals
        .filter((a) => a.requestId === requestId && a.sealedShare)
        .map((a) => ({ custodianId: a.custodianId, shareIndex: 2, epoch: EPOCH, sealedShare: a.sealedShare })),
    };
  }),
}));

jest.mock('@par-noir/device-cloud-credentials', () => ({
  getCloudAccessTokenFromSession: () => 'drive-token',
  writeRecoveryCustody: jest.fn(async (o: { pnIdentifier: string; entries: unknown[] }) => {
    driveFiles.set(o.pnIdentifier, o.entries);
  }),
  findRecoveryCustody: jest.fn(async (o: { pnIdentifier: string; custodianId: string; epoch: number }) =>
    ((driveFiles.get(o.pnIdentifier) || []) as Array<{ custodianId: string; epoch: number }>).find(
      (e) => e.custodianId === o.custodianId && e.epoch === o.epoch
    ) ?? null
  ),
  readRecoveryDriveProof: jest.fn(async (o: { accessToken: string; pnIdentifier: string }) =>
    driveProofs.get(`${o.accessToken}:${o.pnIdentifier}`) ?? null
  ),
  writeRecoveryDriveProof: jest.fn(),
  createRecoveryDriveProofSecret: () => 'b'.repeat(64),
  recoveryDriveProofHash: async () => 'c'.repeat(64),
}));

jest.mock('@par-noir/identity-crypto', () => ({
  SecureCredentialManager: { getCredentials: () => ({ key1: 'key-one', key2: 'key-two' }) },
}));

jest.mock('../services/resolveIdentityMlKem', () => ({
  resolveIdentityMlKemSecret: async () => custodianKeys.secretKey,
}));

jest.mock('../services/recoveryZkService', () => ({
  issueRecoveryApprovalZkp: async () => 'approval-zkp',
}));

import {
  approveRelayRecoveryRequest,
  custodiansAwaitingShare,
  finishRelayRecovery,
  sendPendingCustody,
  startRelayRecovery,
  syncCustodianCustody,
} from '../services/recoveryRelayFlows';
import type { CustodianRecoveryRequest, RecoveryCustodianSummary } from '../services/recoveryApiService';

function summaryWith(overrides: Partial<RecoveryCustodianSummary['custodians'][number]>): RecoveryCustodianSummary {
  return {
    configured: true,
    epoch: EPOCH,
    threshold: 2,
    totalShares: 3,
    custodians: [
      {
        custodianId: CUSTODIAN_ID,
        name: 'Bob',
        custodianType: 'person',
        shareIndex: 2,
        custodianshipCredential: 'cred',
        status: 'accepted',
        createdAt: new Date().toISOString(),
        unrevokable: true,
        mlKemPublicKey: custodianKeys.publicKey,
        custodyCurrent: false,
        custodyPending: false,
        ...overrides,
      },
    ],
    counts: { accepted: 1, acceptedUnrevokable: 1, invited: 0, ready: 0, readyUnrevokable: 0 },
  };
}

describe('recovery relay flows', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    (localStorage.getItem as jest.Mock).mockImplementation((k: string) => store.get(k) ?? null);
    (localStorage.setItem as jest.Mock).mockImplementation((k: string, v: string) => store.set(k, v));
    (localStorage.removeItem as jest.Mock).mockImplementation((k: string) => store.delete(k));
    custodianKeys = generateRecoveryKeyPair();
    driveFiles.clear();
    driveProofs.clear();
    relay.deliveries = [];
    relay.acked = [];
    relay.approvals = [];
  });

  it('only sends to accepted custodians with a key and no share yet', () => {
    expect(custodiansAwaitingShare(summaryWith({}))).toHaveLength(1);
    expect(custodiansAwaitingShare(summaryWith({ custodyPending: true }))).toHaveLength(0);
    expect(custodiansAwaitingShare(summaryWith({ custodyCurrent: true }))).toHaveLength(0);
    expect(custodiansAwaitingShare(summaryWith({ mlKemPublicKey: null }))).toHaveLength(0);
    expect(custodiansAwaitingShare(summaryWith({ status: 'invited' }))).toHaveLength(0);
  });

  it('carries a share from owner to custodian Drive to the claimant device', async () => {
    const shares = splitSecret(generateRecoveryMaster(32), 2, 3);
    const sent = await sendPendingCustody({
      authToken: 'owner',
      ownerPublicKey: OWNER_PK,
      shares,
      summary: summaryWith({}),
    });
    expect(sent).toBe(1);
    expect(relay.deliveries[0].sealedShare).not.toContain(shares[1].share);

    const acked = await syncCustodianCustody({
      authToken: 'custodian',
      custodianPn: 'pn-bob',
      custodianIdentityId: 'bob',
    });
    expect(acked).toBe(1);
    expect(driveFiles.get('pn-bob')).toHaveLength(1);

    const started = await startRelayRecovery({ recoveryKey: 'failsafe', claimantContact: 'a@b.c' });
    expect(relay.startPayload?.temporaryPublicKey).toBeTruthy();

    const request: CustodianRecoveryRequest = {
      requestId: started.requestId,
      requestType: 'identity_recovery',
      status: 'pending',
      approvalCount: 0,
      threshold: 2,
      includesUnrevokableShare: false,
      claimantContact: 'a@b.c',
      createdAt: new Date().toISOString(),
      releaseAfter: started.releaseAfter,
      expiresAt: started.expiresAt,
      ownerPublicKey: OWNER_PK,
      custodianId: CUSTODIAN_ID,
      shareIndex: 2,
      custodianshipCredential: 'cred',
      epoch: EPOCH,
      temporaryPublicKey: relay.startPayload!.temporaryPublicKey as string,
    };
    await approveRelayRecoveryRequest({
      authToken: 'custodian',
      request,
      custodianPn: 'pn-bob',
      custodianIdentityId: 'bob',
      custodianEncryptedIdentity: { publicKey: 'bob-pk', encryptedData: '', iv: '', salt: '' },
    });
    expect(relay.approvals[0].sealedShare).toBeTruthy();

    driveProofs.set('google-token:pn-owner', 'proof-secret');
    const finished = await finishRelayRecovery({
      requestId: started.requestId,
      keyHash: started.keyHash,
      pnIdentifier: 'pn-owner',
      googleAccessToken: 'google-token',
    });
    expect(relay.releasePayload?.driveProof).toBe('proof-secret');
    expect(finished.shares).toEqual([shares[1]]);
  });

  it('refuses to approve when the request id does not match the claimant key', async () => {
    const other = generateRecoveryKeyPair();
    await expect(
      approveRelayRecoveryRequest({
        authToken: 'custodian',
        request: {
          requestId: 'f'.repeat(64),
          requestType: 'identity_recovery',
          status: 'pending',
          approvalCount: 0,
          threshold: 2,
          includesUnrevokableShare: false,
          claimantContact: '',
          createdAt: '',
          releaseAfter: '',
          expiresAt: '',
          ownerPublicKey: OWNER_PK,
          custodianId: CUSTODIAN_ID,
          shareIndex: 2,
          custodianshipCredential: 'cred',
          epoch: EPOCH,
          temporaryPublicKey: other.publicKey,
        },
        custodianPn: 'pn-bob',
        custodianIdentityId: 'bob',
        custodianEncryptedIdentity: { publicKey: 'bob-pk', encryptedData: '', iv: '', salt: '' },
      })
    ).rejects.toThrow(/does not match/);
    expect(relay.approvals).toHaveLength(0);
  });

  it('will not finish without the owner Drive proof', async () => {
    const started = await startRelayRecovery({ recoveryKey: 'failsafe', claimantContact: 'a@b.c' });
    await expect(
      finishRelayRecovery({
        requestId: started.requestId,
        keyHash: started.keyHash,
        pnIdentifier: 'pn-owner',
        googleAccessToken: 'wrong-account',
      })
    ).rejects.toThrow(/Google account/);
  });
});
