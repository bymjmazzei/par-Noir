/**
 * Messaging OAuth handoff contract — must stay in sync with:
 * - api/src/templates/oauth-consent.html (stash in window.name before redirect)
 * - packages/oauth-ui/static/oauth-callback.html (read + deliver same-origin)
 * - apps/aggregator-browser/public/oauth-callback.html
 * - sdk/identity-sdk/static/oauth-callback.html
 */

export const PN_MESSAGING_HANDOFF_WINDOW_PREFIX = 'pn_messaging_handoff_v1:' as const;
/** Large encrypted identity travels in the redirect URL hash (session stays in window.name). */
export const PN_MESSAGING_IDENTITY_HASH_PREFIX = 'pn_messaging_identity_v1:' as const;
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

/**
 * Drop invalid handoff parts instead of rejecting the whole payload.
 * A corrupt identity hash must not block a valid ML-KEM session.
 */
export function normalizeMessagingHandoffPayload(v: unknown): MessagingOAuthHandoffPayload | null {
  if (!isRecord(v) || v.v !== 1) return null;
  if (typeof v.timestamp !== 'number' || !Number.isFinite(v.timestamp)) return null;
  const identity = isMessagingHandoffIdentity(v.identity) ? v.identity : undefined;
  const session = isMessagingHandoffSession(v.session) ? v.session : undefined;
  if (!identity && !session) return null;
  return { v: 1, timestamp: v.timestamp, identity, session };
}

export function isMessagingOAuthHandoffPayload(v: unknown): v is MessagingOAuthHandoffPayload {
  return normalizeMessagingHandoffPayload(v) !== null;
}

/** OAuth unlock requires ML-KEM session in handoff (identity-only is not enough for messaging). */
export function handoffProvidesMessagingSession(v: unknown): boolean {
  if (!isRecord(v)) return false;
  return isMessagingHandoffSession(v.session);
}

export function buildMessagingHandoffWindowName(payload: MessagingOAuthHandoffPayload): string {
  return PN_MESSAGING_HANDOFF_WINDOW_PREFIX + JSON.stringify(payload);
}

/** Session-only window.name payload (small; reliable across browsers). */
export function buildMessagingSessionWindowName(
  session: MessagingHandoffSession,
  timestamp = Date.now()
): string {
  return buildMessagingHandoffWindowName({ v: 1, session, timestamp });
}

export function buildMessagingIdentityHash(
  identity: MessagingHandoffIdentity,
  timestamp = Date.now()
): string {
  const payload = { v: 1 as const, identity, timestamp };
  return `${PN_MESSAGING_IDENTITY_HASH_PREFIX}${encodeURIComponent(JSON.stringify(payload))}`;
}

export function parseMessagingIdentityFromHash(
  hash: string | null | undefined
): MessagingHandoffIdentity | null {
  if (!hash) return null;
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!raw.startsWith(PN_MESSAGING_IDENTITY_HASH_PREFIX)) return null;
  const encoded = raw.slice(PN_MESSAGING_IDENTITY_HASH_PREFIX.length);
  try {
    const parsed: unknown = JSON.parse(decodeURIComponent(encoded));
    if (!isRecord(parsed) || parsed.v !== 1) return null;
    return isMessagingHandoffIdentity(parsed.identity) ? parsed.identity : null;
  } catch {
    return null;
  }
}

export function mergeMessagingHandoffParts(
  windowPart: MessagingOAuthHandoffPayload | null,
  identity: MessagingHandoffIdentity | null
): MessagingOAuthHandoffPayload | null {
  const session = windowPart?.session;
  if (!session && !identity) return null;
  return {
    v: 1,
    timestamp: windowPart?.timestamp ?? Date.now(),
    session,
    identity: identity ?? windowPart?.identity,
  };
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
    return normalizeMessagingHandoffPayload(parsed);
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
    return normalizeMessagingHandoffPayload(parsed);
  } catch {
    return null;
  }
}
