/**
 * FTP storage through a relay the user hosts (apps/pn-storage-relay). The
 * dashboard generates the relay's settings, never collects the FTP login, and
 * keeps the relay URL and token only in this device's cloud vault.
 */
import { buildAccountId, type RelayAccount, type StorageCredentialsEnvelope } from '@par-noir/user-owned-storage';
import type { RelayProbeResult } from '@par-noir/device-cloud-credentials';

/** par Noir apps that read and write the user's cloud from the browser. */
export const RELAY_APP_ORIGINS = [
  'https://pn.parnoir.com',
  'https://browse.parnoir.com',
  'https://messaging.parnoir.com',
  'https://pen.parnoir.com',
] as const;

export const RELAY_IMAGE_SOURCE = 'https://github.com/bymjmazzei/par-Noir.git#main:apps/pn-storage-relay';

function base64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** 256-bit bearer token from the browser's CSPRNG. */
export function generateRelayToken(): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(32)));
}

export function normalizePn(pnIdentifier: string): string {
  return pnIdentifier.startsWith('pn-') ? pnIdentifier : `pn-${pnIdentifier}`;
}

export function relayPrefixFor(pnIdentifier: string): string {
  return `par-noir-${normalizePn(pnIdentifier)}`;
}

export function relayAccountIdFor(pnIdentifier: string): string {
  return buildAccountId('relay', pnIdentifier, 'relay');
}

/** App origins plus the one this dashboard runs on, so dev and preview hosts work too. */
export function relayAllowedOrigins(currentOrigin?: string): string[] {
  const origins: string[] = [...RELAY_APP_ORIGINS];
  if (currentOrigin && /^https?:\/\/[^/]+$/.test(currentOrigin) && !origins.includes(currentOrigin)) {
    origins.push(currentOrigin);
  }
  return origins;
}

export interface RelayEnvVar {
  name: string;
  value: string;
  /** Typed by the user on their relay host; the dashboard has no value for it. */
  userSupplied?: boolean;
}

export function relayEnvVars(opts: { token: string; prefix: string; origins: string[] }): RelayEnvVar[] {
  return [
    { name: 'RELAY_TOKEN', value: opts.token },
    { name: 'RELAY_PREFIX', value: opts.prefix },
    { name: 'ALLOWED_ORIGINS', value: opts.origins.join(',') },
    { name: 'STORAGE_PROTOCOL', value: 'sftp or ftps', userSupplied: true },
    { name: 'STORAGE_HOST', value: 'your server', userSupplied: true },
    { name: 'STORAGE_USER', value: 'your username', userSupplied: true },
    { name: 'STORAGE_PASSWORD', value: 'your password', userSupplied: true },
  ];
}

export function relayDockerCommands(vars: RelayEnvVar[]): string {
  const env = vars
    .map((v) => `  -e ${v.name}=${v.userSupplied ? `<${v.value}>` : `'${v.value}'`} \\`)
    .join('\n');
  return [
    `docker build -t pn-storage-relay ${RELAY_IMAGE_SOURCE}`,
    `docker run -d --restart unless-stopped -p 8080:8080 \\`,
    env,
    `  pn-storage-relay`,
  ].join('\n');
}

const CAUSE_TEXT: Record<Exclude<RelayProbeResult, { ok: true }>['cause'], string> = {
  not_https: 'The relay URL must start with https://.',
  unreachable_or_cors:
    "Couldn't reach the relay. Check the URL, that the relay is running, and that ALLOWED_ORIGINS includes this site.",
  bad_token: 'The relay refused the token. Make sure RELAY_TOKEN on the relay matches the one shown here.',
  origin_not_allowed: 'The relay blocked this site. Add it to ALLOWED_ORIGINS on the relay.',
  prefix_mismatch: 'RELAY_PREFIX on the relay does not match the one shown here.',
  backend_login_failed: 'The relay could not log in to your FTP server. Check STORAGE_USER and STORAGE_PASSWORD.',
  backend_unreachable: 'The relay could not reach your FTP server. Check STORAGE_HOST and STORAGE_PORT.',
  no_write_permission: 'Your FTP account cannot write under the prefix. Give it write access to that folder.',
  read_mismatch: 'The relay wrote the test file but read back something different.',
  relay_error: 'The relay returned an error.',
};

export function describeRelayProbeFailure(result: Exclude<RelayProbeResult, { ok: true }>): string {
  return `${CAUSE_TEXT[result.cause]} (${result.step}: ${result.message})`;
}

export interface RelaySaveDeps {
  /** Seal the envelope into this device's cloud vault. */
  persistVault(envelope: StorageCredentialsEnvelope): Promise<void>;
  /** PUT the layout shell to the API; returns its JSON. */
  putLayout(body: { provider: 'relay'; relay: { accountId: string; prefix: string } }): Promise<{
    socialCloudProvider?: string;
    accountId?: string;
  }>;
  initializeLayout(envelope: StorageCredentialsEnvelope): Promise<void>;
}

/** Vault gets the URL and token; the API gets the account id and prefix only. */
export async function saveRelayConnection(
  input: { pnIdentifier: string; url: string; token: string },
  deps: RelaySaveDeps
): Promise<{ isSocialCloud: boolean }> {
  const account: RelayAccount = {
    accountId: relayAccountIdFor(input.pnIdentifier),
    url: input.url.trim().replace(/\/+$/, ''),
    token: input.token,
    prefix: relayPrefixFor(input.pnIdentifier),
  };
  const envelope = { socialCloudProvider: 'relay', relayAccounts: [account] } as StorageCredentialsEnvelope;
  await deps.persistVault(envelope);
  const saved = await deps.putLayout({
    provider: 'relay',
    relay: { accountId: account.accountId, prefix: account.prefix },
  });
  const isSocialCloud = saved.socialCloudProvider === 'relay';
  if (isSocialCloud) {
    await deps.initializeLayout({ ...envelope, socialCloudAccountId: saved.accountId ?? account.accountId });
  }
  return { isSocialCloud };
}
