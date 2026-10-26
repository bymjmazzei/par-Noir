/**
 * @jest-environment jsdom
 */
import { TextEncoder, TextDecoder } from 'util';
import { webcrypto } from 'crypto';
import {
  combineShares,
  decryptRecoveryEnvelope,
  encryptRecoveryEnvelope,
  generateRecoveryMaster,
  splitSecret,
  unsealRecoveryShares,
} from '@par-noir/recovery-crypto';

if (typeof globalThis.TextEncoder === 'undefined') {
  globalThis.TextEncoder = TextEncoder as typeof globalThis.TextEncoder;
  globalThis.TextDecoder = TextDecoder as typeof globalThis.TextDecoder;
}
Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });

const OWNER_PK = 'owner-identity-public-key';
const PN = 'pn-owner';
const PN_NAME = 'fixture-name';
const PASSCODE = 'fixture-passcode-123';

const mockOldShares: { current: Array<{ index: number; share: string }> } = { current: [] };
const updateIdentity = jest.fn(async () => undefined);

jest.mock('@par-noir/device-cloud-credentials', () => ({
  getCloudAccessTokenFromSession: jest.fn(() => 'drive-token'),
  readLegacyRecoveryRoster: jest.fn(async () => ({
    workbookId: 'wb-legacy',
    custodians: [
      { custodianId: 'cust_relay', name: 'Already moved', custodianType: 'person' },
      { custodianId: 'cust_old', name: 'Bob', custodianType: 'person', unrevokable: true },
    ],
  })),
  deleteLegacyRecoveryWorkbook: jest.fn(async () => undefined),
}));
jest.mock('../services/recoveryApiService', () => ({
  fetchRecoveryCustodianSummary: jest.fn(async () => ({ custodians: [{ custodianId: 'cust_relay', shareIndex: 1 }] })),
  registerRecoveryFailsafe: jest.fn(async () => undefined),
  setupRecoveryEpoch: jest.fn(async () => ({ epoch: 2 })),
}));
jest.mock('../services/recoveryShareResolver', () => ({
  resolveRecoveryShares: jest.fn(async () => mockOldShares.current),
}));
jest.mock('../services/recoveryCustodianSetup', () => ({
  assignCustodianVaultAndIssueCredential: jest.fn(async () => undefined),
}));
jest.mock('../services/recoveryAuthSession', () => ({ setRecoveryAuthSession: jest.fn() }));
jest.mock('../utils/simpleStorage', () => ({
  SimpleStorage: {
    getInstance: () => ({
      getIdentities: async () => [{ publicKey: OWNER_PK, encryptedData: { publicKey: OWNER_PK } }],
      updateIdentity,
    }),
  },
}));

import { deleteLegacyRecoveryWorkbook } from '@par-noir/device-cloud-credentials';
import { registerRecoveryFailsafe, setupRecoveryEpoch } from '../services/recoveryApiService';
import { assignCustodianVaultAndIssueCredential } from '../services/recoveryCustodianSetup';
import {
  isRecoveryResplitRequired,
  markRecoveryResplitRequired,
  resecureRecovery,
} from '../services/recoveryResecure';

const payload = {
  publicKey: OWNER_PK,
  mlKemPublicKey: 'kem-pk',
  mlKemSecretKey: 'kem-sk',
  mlDsaSecretKey: 'dsa-sk',
  identityId: 'id-1',
  pnName: PN_NAME,
  recoveryConfig: { threshold: 2, totalShares: 3, version: 1 as const, createdAt: '2025-01-01T00:00:00Z' },
};

beforeEach(() => {
  jest.clearAllMocks();
  const store = new Map<string, string>();
  (localStorage.getItem as jest.Mock).mockImplementation((k: string) => store.get(k) ?? null);
  (localStorage.setItem as jest.Mock).mockImplementation((k: string, v: string) => store.set(k, v));
  (localStorage.removeItem as jest.Mock).mockImplementation((k: string) => store.delete(k));
});

describe('resecureRecovery', () => {
  it('re-splits under a new master, rotates the epoch, invites legacy custodians and deletes the workbook', async () => {
    const oldMaster = generateRecoveryMaster();
    const oldEnvelope = await encryptRecoveryEnvelope(oldMaster, payload);
    mockOldShares.current = splitSecret(oldMaster, 2, 3);
    markRecoveryResplitRequired(PN);

    const { encryptedIdentity, invited } = await resecureRecovery({
      authToken: 'api-token',
      pnIdentifier: PN,
      identityId: 'id-1',
      auth: {
        encryptedIdentity: { publicKey: OWNER_PK, recoveryEnvelope: oldEnvelope } as never,
        pnName: PN_NAME,
        passcode: PASSCODE,
        expiresAt: Date.now() + 60_000,
      },
      threshold: 3,
    });

    const newShares = await unsealRecoveryShares(encryptedIdentity.recoverySharesSealed as never, PN_NAME, PASSCODE);
    expect(newShares).toHaveLength(5);
    const opened = await decryptRecoveryEnvelope(
      combineShares(newShares.slice(0, 3)),
      encryptedIdentity.recoveryEnvelope as never
    );
    expect(opened.publicKey).toBe(OWNER_PK);
    expect(opened.recoveryConfig).toMatchObject({ threshold: 3, totalShares: 5 });
    await expect(
      decryptRecoveryEnvelope(combineShares(mockOldShares.current.slice(0, 2)), encryptedIdentity.recoveryEnvelope as never)
    ).rejects.toThrow();

    expect(updateIdentity).toHaveBeenCalledTimes(1);
    expect(registerRecoveryFailsafe).toHaveBeenCalledWith('api-token', {
      userPnIdentifier: PN,
      publicKey: OWNER_PK,
      envelope: encryptedIdentity.recoveryEnvelope,
    });
    expect(setupRecoveryEpoch).toHaveBeenCalledWith('api-token', {
      ownerPublicKey: OWNER_PK,
      threshold: 3,
      totalShares: 5,
      rotate: true,
    });

    expect(invited).toBe(1);
    expect(assignCustodianVaultAndIssueCredential).toHaveBeenCalledTimes(1);
    expect(assignCustodianVaultAndIssueCredential).toHaveBeenCalledWith(
      expect.objectContaining({ custodianId: 'cust_old', unrevokable: true, encryptedIdentity })
    );
    expect(deleteLegacyRecoveryWorkbook).toHaveBeenCalledWith({
      accessToken: 'drive-token',
      pnIdentifier: PN,
      workbookId: 'wb-legacy',
    });
    expect(isRecoveryResplitRequired(PN)).toBe(false);
  });

  it('refuses when the old shares open an envelope for a different pN', async () => {
    const oldMaster = generateRecoveryMaster();
    const oldEnvelope = await encryptRecoveryEnvelope(oldMaster, { ...payload, publicKey: 'someone-else' });
    mockOldShares.current = splitSecret(oldMaster, 2, 3);

    await expect(
      resecureRecovery({
        authToken: 'api-token',
        pnIdentifier: PN,
        identityId: 'id-1',
        auth: {
          encryptedIdentity: { publicKey: OWNER_PK, recoveryEnvelope: oldEnvelope } as never,
          pnName: PN_NAME,
          passcode: PASSCODE,
          expiresAt: Date.now() + 60_000,
        },
        threshold: 2,
      })
    ).rejects.toThrow('does not match');
    expect(setupRecoveryEpoch).not.toHaveBeenCalled();
    expect(deleteLegacyRecoveryWorkbook).not.toHaveBeenCalled();
  });
});
