import { brokerPrivateKeyName } from './brokerPrivateKeys';

describe('brokerPrivateKeyName', () => {
  it('rejects a nested mlKemSecretKey', () => {
    expect(
      brokerPrivateKeyName({
        shellSession: { result: { mlKemSecretKey: 'secret' } },
      })
    ).toBe('mlKemSecretKey');
  });

  it('allows a sealed handoff', () => {
    expect(
      brokerPrivateKeyName({
        sealedHandoff: { kemCiphertext: 'ct', ciphertext: 'blob' },
        shellSession: { did: 'did', publicKey: 'pk' },
      })
    ).toBeNull();
  });

  it('rejects a passcode nested under messaging', () => {
    expect(
      brokerPrivateKeyName({
        messagingHandoff: { identity: { passcode: 'nope' } },
      })
    ).toBe('passcode');
  });
});
