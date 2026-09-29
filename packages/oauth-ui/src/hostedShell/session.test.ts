import { describe, expect, it } from 'vitest';
import {
  ShellFactorLeak,
  applyShellFragment,
  assertFactorFree,
  buildShellLaunchUrl,
  encodeShellReturn,
  parseShellReturn,
} from './session';

describe('hosted shell session', () => {
  const session = {
    v: 1 as const,
    op: 'session' as const,
    did: 'did:pn:abc',
    publicKey: 'pub',
    accessToken: '',
    code: 'auth-code',
  };

  it('round-trips a factor-free handoff in the url fragment', () => {
    const fragment = encodeShellReturn(session);
    const url = applyShellFragment('https://pn.parnoir.com/oauth-callback.html', fragment);
    expect(url.includes('passcode')).toBe(false);
    expect(url.includes('pnName')).toBe(false);
    expect(parseShellReturn(url)).toEqual(session);
  });

  it('rejects a handoff that contains key 1 or key 2', () => {
    expect(() => assertFactorFree({ passcode: 'secret' })).toThrow(ShellFactorLeak);
    expect(() => assertFactorFree({ nested: { pnName: 'alice' } })).toThrow(ShellFactorLeak);
    expect(() =>
      encodeShellReturn({ ...session, nickname: 'ok' })
    ).not.toThrow();
    const leaked = encodeShellReturn(session).replace(
      'pn_shell=',
      'pn_shell='
    );
    expect(parseShellReturn(leaked)?.did).toBe('did:pn:abc');
    const bad = btoa(JSON.stringify({ ...session, passcode: 'nope' }))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
    expect(() => parseShellReturn(`pn_shell=${bad}`)).toThrow(ShellFactorLeak);
  });

  it('accepts a sealed vault string and rejects a passcode field', () => {
    expect(() =>
      encodeShellReturn({
        ...session,
        op: 'seal_vault',
        result: { sealedVault: JSON.stringify({ encryptedData: 'ciphertext', iv: 'iv' }) },
      })
    ).not.toThrow();
    expect(() =>
      encodeShellReturn({
        ...session,
        result: { passcode: 'nope' },
      })
    ).toThrow(ShellFactorLeak);
  });

  it('launches the unlock binary rather than a hosted factor form', () => {
    const url = buildShellLaunchUrl({
      returnTo: 'https://pn.parnoir.com/oauth-callback.html',
      op: 'dm',
    });
    expect(url.startsWith('com.parnoir.unlock://oauth/consent?')).toBe(true);
    expect(url).toContain('flow=shell');
    expect(url).toContain('op=dm');
    expect(url).not.toContain('passcode');
  });
});
