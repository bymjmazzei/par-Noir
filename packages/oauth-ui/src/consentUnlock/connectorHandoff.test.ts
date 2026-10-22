import { describe, expect, it, vi } from 'vitest';
import { PN_OAUTH_MESSAGE_TYPE } from '../pnOAuthPopup';
import {
  connectorConsentProblem,
  connectorReturnUrl,
  isConnectorConsent,
  runConnectorHandoff,
} from './connectorHandoff';
import { parseConsentUnlockParams } from './parseConsentParams';

const CONNECTOR = 'pn-connector-0123456789abcdef';
const REDIRECT = 'https://claude.ai/api/mcp/auth_callback';
const STATE = 'state-abcdefgh';
const CHALLENGE = 'c'.repeat(43);

const consentHref =
  'https://unlock.parnoir.com/oauth/consent?' +
  new URLSearchParams({
    client_id: CONNECTOR,
    redirect_uri: REDIRECT,
    api_endpoint: 'https://api.parnoir.com',
    scope: 'ai:files.published ai:pen.drafts',
    state: STATE,
    code_challenge: CHALLENGE,
    code_challenge_method: 'S256',
    resource: 'https://api.parnoir.com/mcp',
  }).toString();

const params = parseConsentUnlockParams(new URL(consentHref).search);

function pending(over: Record<string, unknown>) {
  return { type: PN_OAUTH_MESSAGE_TYPE, state: STATE, ...over } as never;
}

function harness(polls: Array<unknown>, opened = true) {
  const navigate = vi.fn();
  const openApp = vi.fn(
    async (_appUrl: string) => (opened ? { opened: true, mode: 'app' } : { opened: false, mode: 'fallback' }) as never
  );
  const poll = vi.fn(
    async (_state: string, _opts: { apiEndpoint: string; clientId: string }) =>
      (polls.length > 0 ? polls.shift() : null) as never
  );
  let t = 0;
  return {
    navigate,
    openApp,
    poll,
    run: () =>
      runConnectorHandoff({
        params,
        consentHref,
        navigate,
        openApp,
        poll,
        sleep: async () => {
          t += 1_000;
        },
        now: () => t,
        timeoutMs: 5_000,
      }),
  };
}

describe('connector consent handoff', () => {
  it('recognises connector clients only', () => {
    expect(isConnectorConsent(params)).toBe(true);
    expect(isConnectorConsent({ clientId: 'pn-agent-mcp' })).toBe(false);
    expect(isConnectorConsent({ clientId: 'browser-app' })).toBe(false);
  });

  it('opens the Unlock app on the same request, as a broker (popup=false) launch', async () => {
    const h = harness([null, pending({ code: 'code-1' })]);
    await h.run();
    const appUrl = h.openApp.mock.calls[0][0] as string;
    expect(appUrl.startsWith('com.parnoir.unlock://oauth/consent?')).toBe(true);
    const q = new URLSearchParams(appUrl.split('?')[1]);
    expect(q.get('client_id')).toBe(CONNECTOR);
    expect(q.get('state')).toBe(STATE);
    expect(q.get('code_challenge')).toBe(CHALLENGE);
    expect(q.get('popup')).toBe('false');
  });

  it('after the broker delivers, returns code + state to the connector', async () => {
    const h = harness([null, null, pending({ code: 'code-1' })]);
    expect(await h.run()).toBe('returned');
    expect(h.poll).toHaveBeenCalledWith(STATE, { apiEndpoint: 'https://api.parnoir.com', clientId: CONNECTOR });
    expect(h.navigate).toHaveBeenCalledTimes(1);
    const back = new URL(h.navigate.mock.calls[0][0]);
    expect(`${back.origin}${back.pathname}`).toBe(REDIRECT);
    expect(back.searchParams.get('code')).toBe('code-1');
    expect(back.searchParams.get('state')).toBe(STATE);
    expect(back.searchParams.get('error')).toBeNull();
  });

  it('ignores a broker payload for another state', async () => {
    const h = harness([pending({ state: 'other-state-xyz', code: 'stolen' }), pending({ code: 'code-2' })]);
    await h.run();
    expect(new URL(h.navigate.mock.calls[0][0]).searchParams.get('code')).toBe('code-2');
  });

  it('a denial in Unlock returns access_denied, never a code', async () => {
    const h = harness([pending({ error: 'access_denied', code: 'x' })]);
    expect(await h.run()).toBe('returned');
    const back = new URL(h.navigate.mock.calls[0][0]);
    expect(back.searchParams.get('error')).toBe('access_denied');
    expect(back.searchParams.get('code')).toBeNull();
    expect(back.searchParams.get('state')).toBe(STATE);
  });

  it('stays on the page when the app is missing or never answers', async () => {
    const missing = harness([], false);
    expect(await missing.run()).toBe('app_missing');
    expect(missing.poll).not.toHaveBeenCalled();
    expect(missing.navigate).not.toHaveBeenCalled();

    const silent = harness([]);
    expect(await silent.run()).toBe('timeout');
    expect(silent.navigate).not.toHaveBeenCalled();
  });

  it('refuses links without state, S256 PKCE or a return address', () => {
    expect(connectorConsentProblem(params)).toBeNull();
    expect(connectorConsentProblem({ ...params, state: '' })).toMatch(/state/);
    expect(connectorConsentProblem({ ...params, codeChallengeMethod: 'plain' })).toMatch(/PKCE/);
    expect(connectorConsentProblem({ ...params, codeChallenge: '' })).toMatch(/PKCE/);
    expect(connectorConsentProblem({ ...params, redirectUri: 'not a url' })).toMatch(/return address/);
  });

  it('builds RFC 6749 return URLs, keeping existing query params', () => {
    expect(connectorReturnUrl('https://app.example/cb?x=1', 's1', { code: 'c' })).toBe(
      'https://app.example/cb?x=1&code=c&state=s1'
    );
    expect(connectorReturnUrl('https://app.example/cb', 's1', { error: 'access_denied' })).toBe(
      'https://app.example/cb?error=access_denied&state=s1'
    );
  });
});
