/**
 * Messaging OAuth handoff contract — must stay in sync with:
 * - apps/aggregator-browser/public/oauth-authorize.html (same-origin stash before redirect)
 * - packages/oauth-ui/static/oauth-messaging-stash.js
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

/** Extract ML-KEM session from decrypted identity (matches oauth-consent / oauth-authorize). */
export function extractMessagingSessionFromDecrypted(
  decrypted: unknown
): MessagingHandoffSession | null {
  if (!isRecord(decrypted)) return null;
  const pqc = isRecord(decrypted.pqcSecrets) ? decrypted.pqcSecrets : null;
  const mlKemSecretKey =
    (pqc && typeof pqc.mlKemSecretKey === 'string' ? pqc.mlKemSecretKey : undefined) ||
    (typeof decrypted.mlKemSecretKey === 'string' ? decrypted.mlKemSecretKey : undefined);
  if (!mlKemSecretKey) return null;
  const mlKemPublicKey =
    (pqc && typeof pqc.mlKemPublicKey === 'string' ? pqc.mlKemPublicKey : undefined) ||
    (typeof decrypted.mlKemPublicKey === 'string' ? decrypted.mlKemPublicKey : undefined);
  return { mlKemSecretKey, mlKemPublicKey };
}

/** Build encrypted identity handoff payload from unlock material. */
export function buildMessagingIdentityPayload(
  encryptedIdentity: unknown,
  decrypted: unknown
): MessagingHandoffIdentity | null {
  if (!isRecord(encryptedIdentity)) return null;
  const { encryptedData, iv, salt } = encryptedIdentity;
  if (
    typeof encryptedData !== 'string' ||
    typeof iv !== 'string' ||
    typeof salt !== 'string'
  ) {
    return null;
  }
  const dec = isRecord(decrypted) ? decrypted : null;
  const pqc = dec && isRecord(dec.pqcSecrets) ? dec.pqcSecrets : null;
  const mlKemPublicKey =
    (typeof encryptedIdentity.mlKemPublicKey === 'string'
      ? encryptedIdentity.mlKemPublicKey
      : undefined) ||
    (pqc && typeof pqc.mlKemPublicKey === 'string' ? pqc.mlKemPublicKey : undefined) ||
    (dec && typeof dec.mlKemPublicKey === 'string' ? dec.mlKemPublicKey : undefined);
  return {
    encryptedData,
    iv,
    salt,
    publicKey:
      typeof encryptedIdentity.publicKey === 'string'
        ? encryptedIdentity.publicKey
        : undefined,
    mlKemPublicKey,
  };
}

/** Build full handoff payload after unlock decrypt. */
export function buildMessagingHandoffFromUnlock(
  encryptedIdentity: unknown,
  decrypted: unknown,
  timestamp = Date.now()
): MessagingOAuthHandoffPayload | null {
  const session = extractMessagingSessionFromDecrypted(decrypted);
  const identity = buildMessagingIdentityPayload(encryptedIdentity, decrypted);
  if (!session && !identity) return null;
  return {
    v: 1,
    timestamp,
    session: session ?? undefined,
    identity: identity ?? undefined,
  };
}

export interface StashMessagingHandoffOptions {
  /** When true (browser-app), throw if ML-KEM session is missing. */
  requireSession?: boolean;
  /** Notify opener via postMessage (same-origin unlock popup). */
  notifyOpener?: boolean;
}

/**
 * Write messaging handoff to same-origin localStorage + BroadcastChannel.
 * Must run before redirect to oauth-callback.html on app origin.
 */
export function stashMessagingHandoffOnOrigin(
  payload: MessagingOAuthHandoffPayload,
  options: StashMessagingHandoffOptions = {}
): void {
  const normalized = normalizeMessagingHandoffPayload(payload);
  if (!normalized) {
    throw new Error('Invalid messaging handoff payload');
  }
  if (options.requireSession && !handoffProvidesMessagingSession(normalized)) {
    throw new Error(
      'This pN identity does not include messaging encryption keys. Create or update your identity at pn.parnoir.com, then try again.'
    );
  }

  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(
      PN_MESSAGING_OAUTH_HANDOFF_STORAGE,
      serializeMessagingHandoffForStorage(normalized)
    );
  }

  if (typeof BroadcastChannel !== 'undefined') {
    try {
      const ch = new BroadcastChannel(PN_MESSAGING_OAUTH_BROADCAST);
      ch.postMessage(normalized);
      ch.close();
    } catch {
      /* ignore */
    }
  }

  if (
    options.notifyOpener &&
    typeof window !== 'undefined' &&
    window.opener &&
    !window.opener.closed
  ) {
    const origin = window.location.origin;
    if (normalized.identity) {
      try {
        window.opener.postMessage(
          { type: 'pn_messaging_identity', identity: normalized.identity },
          origin
        );
      } catch {
        /* ignore */
      }
    }
    if (normalized.session) {
      try {
        window.opener.postMessage(
          { type: 'pn_messaging_session', session: normalized.session },
          origin
        );
      } catch {
        /* ignore */
      }
    }
  }
}
