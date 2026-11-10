import {
  describeRelayProbeFailure,
  generateRelayToken,
  relayAllowedOrigins,
  relayDockerCommands,
  relayEnvVars,
  saveRelayConnection,
} from './relaySetup';

describe('relay setup', () => {
  it('generates a fresh 256-bit url-safe token each time', () => {
    const a = generateRelayToken();
    const b = generateRelayToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
  });

  it('lists the env vars without any FTP login values', () => {
    const vars = relayEnvVars({ token: 'tok', prefix: 'par-noir-pn-abc', origins: relayAllowedOrigins('http://localhost:5173') });
    expect(vars.find((v) => v.name === 'ALLOWED_ORIGINS')!.value).toContain('http://localhost:5173');
    const login = vars.filter((v) => v.name.startsWith('STORAGE_'));
    expect(login.every((v) => v.userSupplied)).toBe(true);
    expect(relayDockerCommands(vars)).toContain('-e STORAGE_PASSWORD=<your password>');
  });

  it('seals the URL and token in the vault and sends the API only the shell', async () => {
    const persistVault = jest.fn(async () => undefined);
    const putLayout = jest.fn(async () => ({ socialCloudProvider: 'relay', accountId: 'relay::pn-abc::relay' }));
    const initializeLayout = jest.fn(async () => undefined);

    const result = await saveRelayConnection(
      { pnIdentifier: 'abc', url: 'https://relay.example/', token: 'secret-token' },
      { persistVault, putLayout, initializeLayout }
    );

    expect(persistVault).toHaveBeenCalledWith({
      socialCloudProvider: 'relay',
      relayAccounts: [
        { accountId: 'relay::pn-abc::relay', url: 'https://relay.example', token: 'secret-token', prefix: 'par-noir-pn-abc' },
      ],
    });
    expect(putLayout).toHaveBeenCalledWith({
      provider: 'relay',
      relay: { accountId: 'relay::pn-abc::relay', prefix: 'par-noir-pn-abc' },
    });
    expect(JSON.stringify(putLayout.mock.calls)).not.toMatch(/secret-token|relay\.example/);
    expect(initializeLayout).toHaveBeenCalled();
    expect(result.isSocialCloud).toBe(true);
  });

  it('turns each probe failure into a specific instruction', () => {
    expect(describeRelayProbeFailure({ ok: false, step: 'health', cause: 'bad_token', message: 'x' })).toMatch(/RELAY_TOKEN/);
    expect(
      describeRelayProbeFailure({ ok: false, step: 'health', cause: 'unreachable_or_cors', message: 'x' })
    ).toMatch(/ALLOWED_ORIGINS/);
    expect(
      describeRelayProbeFailure({ ok: false, step: 'write', cause: 'backend_login_failed', message: 'x' })
    ).toMatch(/STORAGE_USER/);
    expect(
      describeRelayProbeFailure({ ok: false, step: 'write', cause: 'no_write_permission', message: 'x' })
    ).toMatch(/write access/);
  });
});
