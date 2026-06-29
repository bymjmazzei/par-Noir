/**
 * Messaging OAuth handoff contract — must stay in sync with:
 * - api/src/templates/oauth-consent.html (stash in window.name before redirect)
 * - packages/oauth-ui/static/oauth-callback.html (read + deliver same-origin)
 * - apps/aggregator-browser/public/oauth-callback.html
 * - sdk/identity-sdk/static/oauth-callback.html
 */

export const PN_MESSAGING_HANDOFF_WINDOW_PREFIX = 'pn_messaging_handoff_v1:' as const;
export const PN_MESSAGING_OAUTH_HANDOFF_STORAGE = 'pn_messaging_oauth_handoff' as const;
export const PN_MESSAGING_OAUTH_BROADCAST = 'par-noir-messaging-oauth-v1' as const;

export interface MessagingHandoffIdentity {
  encryptedData: string;
  iv: string;
  salt: string;
  publicKey?: string;
  mlKemPublicKey?: string;
}

export interface MessagingHandoffSession {
  mlKemSecretKey: string;
  mlKemPublicKey?: string;
}

export interface MessagingOAuthHandoffPayload {
  v: 1;
  identity?: MessagingHandoffIdentity;
  session?: MessagingHandoffSession;
  timestamp: number;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function isMessagingHandoffIdentity(v: unknown): v is MessagingHandoffIdentity {
  if (!isRecord(v)) return false;
  return (
    typeof v.encryptedData === 'string' &&
    typeof v.iv === 'string' &&
    typeof v.salt === 'string'
  );
}

function isMessagingHandoffSession(v: unknown): v is MessagingHandoffSession {
  if (!isRecord(v)) return false;
  return typeof v.mlKemSecretKey === 'string' && v.mlKemSecretKey.length > 0;
}

export function isMessagingOAuthHandoffPayload(v: unknown): v is MessagingOAuthHandoffPayload {
  if (!isRecord(v)) return false;
  if (v.v !== 1) return false;
  if (typeof v.timestamp !== 'number' || !Number.isFinite(v.timestamp)) return false;
  if (v.identity !== undefined && !isMessagingHandoffIdentity(v.identity)) return false;
  if (v.session !== undefined && !isMessagingHandoffSession(v.session)) return false;
  if (!v.identity && !v.session) return false;
  return true;
}

export function buildMessagingHandoffWindowName(payload: MessagingOAuthHandoffPayload): string {
  return PN_MESSAGING_HANDOFF_WINDOW_PREFIX + JSON.stringify(payload);
}

export function parseMessagingHandoffFromWindowName(
  windowName: string | null | undefined
): MessagingOAuthHandoffPayload | null {
  if (!windowName || !windowName.startsWith(PN_MESSAGING_HANDOFF_WINDOW_PREFIX)) {
    return null;
  }
  const json = windowName.slice(PN_MESSAGING_HANDOFF_WINDOW_PREFIX.length);
  try {
    const parsed: unknown = JSON.parse(json);
    return isMessagingOAuthHandoffPayload(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function clearMessagingHandoffFromWindowName(windowName: string | null | undefined): string {
  if (!windowName || !windowName.startsWith(PN_MESSAGING_HANDOFF_WINDOW_PREFIX)) {
    return windowName ?? '';
  }
  return '';
}

export function serializeMessagingHandoffForStorage(payload: MessagingOAuthHandoffPayload): string {
  return JSON.stringify(payload);
}

export function parseMessagingHandoffFromStorage(
  raw: string | null | undefined
): MessagingOAuthHandoffPayload | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isMessagingOAuthHandoffPayload(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
