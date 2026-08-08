/**
 * OAuth client identity for this build.
 *
 * Browse and messaging ship from the same source but are separate OAuth
 * clients, so each gets its own grant row and its own consent screen. Scopes
 * come from the shared contract registry rather than being restated here.
 */

import { CLIENT_CONTRACTS, BROWSER_APP_CLIENT_ID, MESSAGING_APP_CLIENT_ID } from '@par-noir/standard-data-points';
import { MESSAGING_ONLY } from './buildFlags';

const DEFAULT_CLIENT_ID = MESSAGING_ONLY ? MESSAGING_APP_CLIENT_ID : BROWSER_APP_CLIENT_ID;

/**
 * Deploy scripts and shared .env files can leak the browse client id into the
 * messaging build, which would break redirect validation and merge the two
 * apps back into one grant. Ignore the env value when it contradicts the mode.
 */
function resolveClientId(): string {
  const raw = import.meta.env.VITE_PN_CLIENT_ID && String(import.meta.env.VITE_PN_CLIENT_ID).trim();
  if (!raw) return DEFAULT_CLIENT_ID;
  if (MESSAGING_ONLY && raw === BROWSER_APP_CLIENT_ID) return MESSAGING_APP_CLIENT_ID;
  if (!MESSAGING_ONLY && raw === MESSAGING_APP_CLIENT_ID) return BROWSER_APP_CLIENT_ID;
  return raw;
}

export const PN_CLIENT_ID = resolveClientId();

export function getPnOAuthScopes(): string[] {
  const contract = CLIENT_CONTRACTS[PN_CLIENT_ID];
  return contract ? [...contract.scopes] : ['openid', 'profile'];
}
