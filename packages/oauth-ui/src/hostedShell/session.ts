/**
 * Factor-free session handed from the unlock binary back to a hosted shell.
 * The fragment never carries Key 1 or Key 2.
 */

import { DEFAULT_UNLOCK_ORIGIN, UNLOCK_CUSTOM_SCHEME } from '../consentUnlock/constants';

export const SHELL_OPS = ['session', 'export', 'recovery', 'sub_pn', 'dm', 'rotate', 'create', 'seal_vault'] as const;
export type ShellOp = (typeof SHELL_OPS)[number];

export type HostedShellSession = {
  v: 1;
  op: ShellOp;
  did: string;
  publicKey: string;
  /** Set when the unlock app already exchanged the code. */
  accessToken: string;
  /** Authorization code. The hosted shell exchanges it; factors are not attached. */
  code?: string;
  nickname?: string;
  /** Operation output. Must not contain identity factors. */
  result?: Record<string, string>;
};

const FACTOR_KEYS = new Set([
  'passcode',
  'pnname',
  'pn_name',
  'key1',
  'key2',
  'encryptedidentityjson',
  'encrypteddata',
]);

export class ShellFactorLeak extends Error {
  constructor() {
    super('Unlock handoff must not include identity factors');
    this.name = 'ShellFactorLeak';
  }
}

function isShellOp(value: string): value is ShellOp {
  return (SHELL_OPS as readonly string[]).includes(value);
}

export function assertFactorFree(value: unknown): void {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (FACTOR_KEYS.has(key.toLowerCase())) {
      throw new ShellFactorLeak();
    }
    if (child && typeof child === 'object') assertFactorFree(child);
  }
}

export function encodeShellReturn(session: HostedShellSession): string {
  assertFactorFree(session);
  if (!session.did || !session.publicKey) {
    throw new Error('Shell session requires did and publicKey');
  }
  const json = JSON.stringify(session);
  const b64 = btoa(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  return `pn_shell=${b64}`;
}

function decodeB64Url(b64: string): string {
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
  const std = b64.replace(/-/g, '+').replace(/_/g, '/') + pad;
  return atob(std);
}

export function parseShellReturn(fragmentOrUrl: string): HostedShellSession | null {
  const raw = fragmentOrUrl.startsWith('#') ? fragmentOrUrl.slice(1) : fragmentOrUrl;
  const query = raw.includes('pn_shell=')
    ? new URLSearchParams(raw.split('#').pop() || raw)
    : new URLSearchParams(raw);
  const encoded = query.get('pn_shell');
  if (!encoded) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(decodeB64Url(encoded));
  } catch {
    throw new Error('Invalid shell handoff');
  }
  assertFactorFree(parsed);
  if (!parsed || typeof parsed !== 'object') throw new Error('Invalid shell handoff');
  const row = parsed as Partial<HostedShellSession>;
  if (row.v !== 1 || !row.op || !isShellOp(row.op) || !row.did || !row.publicKey) {
    throw new Error('Invalid shell handoff');
  }
  return {
    v: 1,
    op: row.op,
    did: row.did,
    publicKey: row.publicKey,
    accessToken: typeof row.accessToken === 'string' ? row.accessToken : '',
    code: typeof row.code === 'string' ? row.code : undefined,
    nickname: typeof row.nickname === 'string' ? row.nickname : undefined,
    result:
      row.result && typeof row.result === 'object'
        ? (row.result as Record<string, string>)
        : undefined,
  };
}

/** Broker completion for a shell unlock. Rejects identity factors. */
export function shellSessionFromBrokerPayload(payload: Record<string, unknown>): HostedShellSession | null {
  const raw = payload.shellSession;
  if (!raw || typeof raw !== 'object') return null;
  assertFactorFree(raw);
  const row = raw as Record<string, unknown>;
  if (row.v !== 1) return null;
  if (typeof row.did !== 'string' || typeof row.publicKey !== 'string') return null;
  if (typeof row.op !== 'string' || !isShellOp(row.op)) return null;
  const code = typeof row.code === 'string' ? row.code : '';
  const accessToken = typeof row.accessToken === 'string' ? row.accessToken : '';
  if (!code && !accessToken && row.op !== 'seal_vault') return null;
  return {
    v: 1,
    op: row.op,
    did: row.did,
    publicKey: row.publicKey,
    accessToken,
    code: code || undefined,
    nickname: typeof row.nickname === 'string' ? row.nickname : undefined,
    result:
      row.result && typeof row.result === 'object'
        ? (row.result as Record<string, string>)
        : undefined,
  };
}

/** The tab that clicked Unlock. A new tab from the app must not spend the code. */
export const SHELL_OWNER_STORAGE_KEY = 'pn_shell_owner';
/** Cross-tab handoff. The app's new tab writes this; the original tab reads it. */
export const SHELL_RETURN_STORAGE_KEY = 'pn_hosted_shell_v1';

export function shellHandoffDisposition(args: {
  fragment: string;
  isOwnerTab: boolean;
}): 'apply' | 'forward' | 'ignore' {
  if (!args.fragment.includes('pn_shell=')) return 'ignore';
  return args.isOwnerTab ? 'apply' : 'forward';
}

export function applyShellFragment(redirectUri: string, fragment: string): string {
  const url = new URL(redirectUri);
  url.hash = fragment.startsWith('#') ? fragment.slice(1) : fragment;
  return url.toString();
}

/** Custom-scheme launch. Factors are typed in the unlock binary, not the hosted page. */
export function createShellState(): string {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function buildShellLaunchUrl(args: {
  returnTo: string;
  op?: ShellOp;
  clientId?: string;
  apiEndpoint?: string;
  /** OAuth state. Required so the original tab can see that the app opened. */
  state?: string;
  /** Base64url JSON the unlock app seals. Never Key 1 or Key 2. */
  vaultPayload?: string;
  /** Ephemeral ML-KEM public key. The matching secret stays in the calling tab. */
  handoffPk?: string;
}): string {
  const params = new URLSearchParams({
    flow: 'shell',
    op: args.op || 'session',
    client_id: args.clientId || 'browser-app',
    redirect_uri: args.returnTo,
    popup: 'false',
    scope: 'openid profile',
  });
  if (args.state && args.state.length >= 8) params.set('state', args.state);
  if (args.apiEndpoint) params.set('api_endpoint', args.apiEndpoint);
  if (args.vaultPayload) params.set('vault_payload', args.vaultPayload);
  if (args.handoffPk) params.set('handoff_pk', args.handoffPk);
  return `${UNLOCK_CUSTOM_SCHEME}://oauth/consent?${params.toString()}`;
}

export type ShellLaunchArgs = {
  returnTo: string;
  op?: ShellOp;
  clientId?: string;
  apiEndpoint?: string;
  state?: string;
  vaultPayload?: string;
  handoffPk?: string;
};

/** Same shell query on the web unlock page. Factors stay there, not on the hosted site. */
export function buildShellWebUrl(args: ShellLaunchArgs): string {
  const appUrl = buildShellLaunchUrl(args);
  const query = appUrl.slice(appUrl.indexOf('?'));
  return `${DEFAULT_UNLOCK_ORIGIN}/oauth/consent${query}`;
}

/** Installed app keeps the custom scheme. A missing app uses the web unlock page. */
export function chooseShellLaunchUrl(args: ShellLaunchArgs & { appOpened: boolean }): string {
  return args.appOpened ? buildShellLaunchUrl(args) : buildShellWebUrl(args);
}

/**
 * After the custom-scheme probe: stay with the app only when this is the native
 * shell or the page actually went to the background. A window blur is not enough.
 */
export function shellLaunchAfterAppProbe(args: {
  nativePlatform: boolean;
  documentHidden: boolean;
}): 'app' | 'web' {
  if (args.nativePlatform || args.documentHidden) return 'app';
  return 'web';
}
