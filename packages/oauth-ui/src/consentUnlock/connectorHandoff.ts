/**
 * Hosted AI connectors (claude.ai, ChatGPT) send the owner to unlock.parnoir.com to sign an
 * agent in. Agents live only in the Unlock app's Touch ID vault, so this page opens the app,
 * waits for it to post the code to the API broker, then returns code + state to the
 * connector. The code is useless without the connector's PKCE verifier.
 */
import { isAgentConnectorClientId } from '@par-noir/standard-data-points';
import { httpsConsentUrlToAppUrl, tryPreferUnlockApp, type PreferUnlockAppResult } from '../unlockPreferApp';
import { pollUnlockDesktopBrokerOnce, type DesktopBrokerPendingResult } from '../unlockDesktopBrokerPoll';
import type { ConsentUnlockParams } from './parseConsentParams';

/** Slightly under the API's broker-pending TTL. */
export const CONNECTOR_WAIT_MS = 110_000;
const CONNECTOR_POLL_MS = 1_000;

export function isConnectorConsent(params: Pick<ConsentUnlockParams, 'clientId'>): boolean {
  return isAgentConnectorClientId(params.clientId);
}

/** What a connector consent link needs before the app is worth opening. */
export function connectorConsentProblem(params: ConsentUnlockParams): string | null {
  if (!params.state) return 'This sign-in link is missing its state. Start again from the AI app.';
  if (!params.codeChallenge || params.codeChallengeMethod !== 'S256') {
    return 'This sign-in link is missing PKCE. Start again from the AI app.';
  }
  try {
    new URL(params.redirectUri);
  } catch {
    return 'This sign-in link has no valid return address. Start again from the AI app.';
  }
  return null;
}

export type ConnectorOutcome = { code: string } | { error: 'access_denied' };

/** RFC 6749 4.1.2: code + state on success, error + state otherwise. */
export function connectorReturnUrl(redirectUri: string, state: string, outcome: ConnectorOutcome): string {
  const url = new URL(redirectUri);
  if ('code' in outcome) {
    url.searchParams.set('code', outcome.code);
  } else {
    url.searchParams.set('error', outcome.error);
  }
  if (state) url.searchParams.set('state', state);
  return url.toString();
}

type Poll = (
  state: string,
  opts: { apiEndpoint: string; clientId: string }
) => Promise<DesktopBrokerPendingResult | null>;

export async function waitForConnectorCode(args: {
  params: Pick<ConsentUnlockParams, 'state' | 'clientId' | 'apiEndpoint'>;
  poll?: Poll;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  timeoutMs?: number;
  isCancelled?: () => boolean;
}): Promise<ConnectorOutcome | 'timeout' | 'cancelled'> {
  const poll = args.poll ?? pollUnlockDesktopBrokerOnce;
  const sleep = args.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = args.now ?? Date.now;
  const deadline = now() + (args.timeoutMs ?? CONNECTOR_WAIT_MS);
  const { state, clientId, apiEndpoint } = args.params;
  for (;;) {
    if (args.isCancelled?.()) return 'cancelled';
    const data = await poll(state, { apiEndpoint, clientId });
    if (data && (!data.state || data.state === state)) {
      if (data.error) return { error: 'access_denied' };
      if (data.code) return { code: data.code };
    }
    if (now() >= deadline) return 'timeout';
    await sleep(CONNECTOR_POLL_MS);
  }
}

export type ConnectorHandoffResult = 'returned' | 'app_missing' | 'timeout' | 'cancelled';

/**
 * Open the Unlock app on this consent request (popup=false, so the app answers through the
 * broker), wait for its code, then send the browser back to the connector.
 */
export async function runConnectorHandoff(args: {
  params: ConsentUnlockParams;
  consentHref: string;
  navigate: (url: string) => void;
  openApp?: (appUrl: string) => Promise<PreferUnlockAppResult>;
  poll?: Poll;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  timeoutMs?: number;
  isCancelled?: () => boolean;
}): Promise<ConnectorHandoffResult> {
  const openApp = args.openApp ?? ((url: string) => tryPreferUnlockApp(url));
  const opened = await openApp(httpsConsentUrlToAppUrl(args.consentHref));
  if (!opened.opened) return 'app_missing';
  const outcome = await waitForConnectorCode(args);
  if (outcome === 'timeout' || outcome === 'cancelled') return outcome;
  args.navigate(connectorReturnUrl(args.params.redirectUri, args.params.state, outcome));
  return 'returned';
}
