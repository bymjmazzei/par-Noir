/**
 * @vitest-environment node
 */
import { describe, expect, it, beforeEach } from 'vitest';
import {
  bindHandoffKem,
  brokerBodyHasPrivateKey,
  clearHandoffKemForTests,
  openHandoffPayload,
  openSealedBrokerPayload,
  sealHandoffPayload,
} from './handoffSeal';

describe('handoff seal', () => {
  beforeEach(() => {
    clearHandoffKemForTests();
  });

  it('seals shell and messaging secrets and opens them in the calling tab', async () => {
    const kem = bindHandoffKem('state-12345678');
    const sealed = await sealHandoffPayload(kem.publicKey, {
      shellResult: { mlKemSecretKey: 'shell-sk', did: 'did-1' },
      messagingSession: { mlKemSecretKey: 'msg-sk', mlDsaSecretKey: 'dsa-sk' },
    });
    expect(sealed.ciphertext).not.toContain('shell-sk');
    expect(sealed.ciphertext).not.toContain('dsa-sk');

    const opened = await openHandoffPayload(sealed, kem.secretKey);
    expect(opened.shellResult?.mlKemSecretKey).toBe('shell-sk');
    expect(opened.messagingSession?.mlDsaSecretKey).toBe('dsa-sk');

    const broker = {
      code: 'c',
      state: 'state-12345678',
      sealedHandoff: sealed,
      shellSession: { did: 'did-1', result: undefined },
      messagingHandoff: { v: 1 },
    };
    expect(brokerBodyHasPrivateKey(broker)).toBeNull();
    const restored = await openSealedBrokerPayload('state-12345678', broker);
    const shell = restored.shellSession as { result?: { mlKemSecretKey?: string } };
    const handoff = restored.messagingHandoff as { session?: { mlDsaSecretKey?: string } };
    expect(shell.result?.mlKemSecretKey).toBe('shell-sk');
    expect(handoff.session?.mlDsaSecretKey).toBe('dsa-sk');
    expect(restored.sealedHandoff).toBeUndefined();
  });

  it('rejects a nested mlKemSecretKey on a broker body', () => {
    expect(
      brokerBodyHasPrivateKey({
        messagingHandoff: { session: { mlKemSecretKey: 'sk' } },
      })
    ).toBe('mlKemSecretKey');
  });
});
