/**
 * Static OAuth contracts for par Noir first-party clients.
 *
 * One source of truth for what each first-party app may request: the scopes it
 * sends, the data points it may ask for, and the minimum verification level per
 * data point. The API seeds client registration from this, the consent screen
 * renders from the requested scopes, and the dashboard re-stamps stored grants
 * against it so a stale sheet row cannot widen or downgrade a contract.
 */

import type { DataPointLevels } from './verificationLevel';

export const BROWSER_APP_CLIENT_ID = 'browser-app';
export const MESSAGING_APP_CLIENT_ID = 'messaging-app';

export interface ClientContract {
  clientId: string;
  name: string;
  description: string;
  /** Granted implicitly; the user cannot decline these and keep using the app. */
  requiredDataPoints: readonly string[];
  /** Offered on the consent screen; the user chooses per data point. */
  optionalDataPoints: readonly string[];
  dataPointLevels: DataPointLevels;
  scopes: readonly string[];
}

/** NSFW gating requires a Veriff-verified over_21, never a self-attested one. */
const BROWSER_APP_CONTRACT: ClientContract = {
  clientId: BROWSER_APP_CLIENT_ID,
  name: 'par Noir Browser',
  description:
    'Official par Noir browser application for browsing and discovering encrypted content',
  requiredDataPoints: [],
  optionalDataPoints: ['over_21'],
  dataPointLevels: { over_21: 'verified' },
  scopes: ['openid', 'profile', 'zkp:over_21', 'cloud:read'],
};

/** Messaging needs cloud access for the mailbox but no identity data points. */
const MESSAGING_APP_CONTRACT: ClientContract = {
  clientId: MESSAGING_APP_CLIENT_ID,
  name: 'par Noir Messaging',
  description: 'Official par Noir messaging application for encrypted direct messages',
  requiredDataPoints: [],
  optionalDataPoints: [],
  dataPointLevels: {},
  scopes: ['openid', 'profile', 'cloud:read'],
};

export const CLIENT_CONTRACTS: Readonly<Record<string, ClientContract>> = {
  [BROWSER_APP_CLIENT_ID]: BROWSER_APP_CONTRACT,
  [MESSAGING_APP_CLIENT_ID]: MESSAGING_APP_CONTRACT,
};

export function getClientContract(clientId: string | undefined | null): ClientContract | null {
  if (!clientId) return null;
  return CLIENT_CONTRACTS[clientId] ?? null;
}

export function hasClientContract(clientId: string | undefined | null): boolean {
  return getClientContract(clientId) !== null;
}

/** Data points a contract app may ever hold, required first. */
export function contractDataPointIds(contract: ClientContract): string[] {
  return [...new Set([...contract.requiredDataPoints, ...contract.optionalDataPoints])];
}

/**
 * Re-stamp a stored grant with the app's static contract. Only the contract
 * fields are overwritten; `dataPoints` stays as the user granted it.
 */
export function applyStaticContract<
  T extends {
    requiredDataPoints?: string[];
    optionalDataPoints?: string[];
    dataPointLevels?: DataPointLevels;
    permissions?: string[];
  }
>(clientId: string, permission: T): T {
  const contract = getClientContract(clientId);
  if (!contract) return permission;
  return {
    ...permission,
    requiredDataPoints: [...contract.requiredDataPoints],
    optionalDataPoints: [...contract.optionalDataPoints],
    dataPointLevels: { ...contract.dataPointLevels },
    permissions: [...contract.scopes],
  };
}
