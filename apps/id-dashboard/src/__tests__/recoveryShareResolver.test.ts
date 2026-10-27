/**
 * @jest-environment jsdom
 */
import { TextEncoder, TextDecoder } from 'util';
import { webcrypto } from 'crypto';
import {
  generateRecoveryMaster,
  sealRecoveryShares,
  splitSecret,
  type ShamirShare,
} from '@par-noir/recovery-crypto';

if (typeof globalThis.TextEncoder === 'undefined') {
  globalThis.TextEncoder = TextEncoder as typeof globalThis.TextEncoder;
  globalThis.TextDecoder = TextDecoder as typeof globalThis.TextDecoder;
}
Object.defineProperty(globalThis, 'crypto', {
  value: webcrypto,
  configurable: true,
});

let bufferState: { publicKey: string; shares: ShamirShare[]; threshold: number } | null = null;

jest.mock('../services/recoveryVaultService', () => ({
  getPendingRecoverySharesBuffer: () => bufferState,
  setPendingRecoverySharesBuffer: (data: typeof bufferState) => {
    bufferState = data;
  },
  clearPendingRecoverySharesBuffer: () => {
    bufferState = null;
  },
}));

import {
  RecoverySharesUnavailableError,
  resolveRecoveryShares,
} from '../services/recoveryShareResolver';
import type { EncryptedIdentity } from '@par-noir/identity-crypto';

const KEY1 = 'alice';
const KEY2 = 'SecretPass1!';
const PUBLIC_KEY = 'test-public-key';

function baseIdentity(overrides: Partial<EncryptedIdentity> = {}): EncryptedIdentity {
  return {
    publicKey: PUBLIC_KEY,
    encryptedData: 'x',
    iv: 'y',
    salt: 'z',
    ...overrides,
  };
}

describe('resolveRecoveryShares', () => {
  beforeEach(() => {
    bufferState = null;
  });

  it('unseals shares from recoverySharesSealed on identity', async () => {
    const master = generateRecoveryMaster(32);
    const shares = splitSecret(master, 2, 5);
    const recoverySharesSealed = await sealRecoveryShares(shares, KEY1, KEY2);
    const out = await resolveRecoveryShares({
      encryptedIdentity: baseIdentity({ recoverySharesSealed }),
      key1: KEY1,
      key2: KEY2,
    });
    expect(out).toHaveLength(5);
    expect(out[0].share).toBe(shares[0].share);
  });

  it('falls back to session buffer when sealed field is absent', async () => {
    const master = generateRecoveryMaster(32);
    const shares = splitSecret(master, 2, 5);
    bufferState = { publicKey: PUBLIC_KEY, shares, threshold: 2 };
    const out = await resolveRecoveryShares({
      encryptedIdentity: baseIdentity(),
      key1: KEY1,
      key2: KEY2,
      publicKey: PUBLIC_KEY,
    });
    expect(out).toHaveLength(5);
    expect(out[2].index).toBe(3);
  });

  it('throws when neither sealed shares nor buffer are available', async () => {
    await expect(
      resolveRecoveryShares({
        encryptedIdentity: baseIdentity(),
        key1: KEY1,
        key2: KEY2,
      })
    ).rejects.toBeInstanceOf(RecoverySharesUnavailableError);
  });
});
