/**
 * Root-signed statements for assets the owner creates without Unlock in the loop:
 * the personal feed sub-pN and handle transfers. Same canonical-bytes approach as
 * the agent delegation statement.
 */

export const PERSONAL_FEED_STATEMENT_VERSION = 1 as const;
const PERSONAL_FEED_DOMAIN = 'PN-PERSONAL-FEED-V1';

export const HANDLE_TRANSFER_STATEMENT_VERSION = 1 as const;
const HANDLE_TRANSFER_DOMAIN = 'PN-HANDLE-TRANSFER-V1';

const KEY_MAX = 4096;
const NAME_MAX = 64;
const NONCE_RE = /^[A-Za-z0-9_-]{16,128}$/;

/** Root pN binds its one personal feed key. */
export interface PersonalFeedStatement {
  v: typeof PERSONAL_FEED_STATEMENT_VERSION;
  kind: 'personal_feed';
  rootPublicKey: string;
  feedPnIdentifier: string;
  feedPublicKey: string;
  issuedAt: string;
  nonce: string;
}

/** Root pN hands one handle to another pN. The recipient still has to accept. */
export interface HandleTransferStatement {
  v: typeof HANDLE_TRANSFER_STATEMENT_VERSION;
  kind: 'handle_transfer';
  name: string;
  rootPublicKey: string;
  toPnIdentifier: string;
  issuedAt: string;
  nonce: string;
}

function str(v: unknown, max: number): string | null {
  return typeof v === 'string' && v.length > 0 && v.length <= max ? v : null;
}

function iso(v: unknown): string | null {
  if (typeof v !== 'string' || Number.isNaN(Date.parse(v))) return null;
  return new Date(v).toISOString();
}

function nonce(v: unknown): string | null {
  return typeof v === 'string' && NONCE_RE.test(v) ? v : null;
}

export function parsePersonalFeedStatement(raw: unknown): PersonalFeedStatement | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  if (row.v !== PERSONAL_FEED_STATEMENT_VERSION || row.kind !== 'personal_feed') return null;
  const rootPublicKey = str(row.rootPublicKey, KEY_MAX);
  const feedPnIdentifier = str(row.feedPnIdentifier, KEY_MAX);
  const feedPublicKey = str(row.feedPublicKey, KEY_MAX);
  const issuedAt = iso(row.issuedAt);
  const n = nonce(row.nonce);
  if (!rootPublicKey || !feedPnIdentifier || !feedPublicKey || !issuedAt || !n) return null;
  return {
    v: PERSONAL_FEED_STATEMENT_VERSION,
    kind: 'personal_feed',
    rootPublicKey,
    feedPnIdentifier,
    feedPublicKey,
    issuedAt,
    nonce: n,
  };
}

export function canonicalPersonalFeedBytes(s: PersonalFeedStatement): Uint8Array {
  const ordered = {
    v: s.v,
    kind: s.kind,
    rootPublicKey: s.rootPublicKey,
    feedPnIdentifier: s.feedPnIdentifier,
    feedPublicKey: s.feedPublicKey,
    issuedAt: s.issuedAt,
    nonce: s.nonce,
  };
  return new TextEncoder().encode(`${PERSONAL_FEED_DOMAIN}\n${JSON.stringify(ordered)}`);
}

export function buildPersonalFeedStatement(args: {
  rootPublicKey: string;
  feedPnIdentifier: string;
  feedPublicKey: string;
  nonce: string;
  issuedAt?: string;
}): PersonalFeedStatement {
  const parsed = parsePersonalFeedStatement({
    v: PERSONAL_FEED_STATEMENT_VERSION,
    kind: 'personal_feed',
    issuedAt: args.issuedAt ?? new Date().toISOString(),
    ...args,
  });
  if (!parsed) throw new Error('Invalid personal feed statement');
  return parsed;
}

export function parseHandleTransferStatement(raw: unknown): HandleTransferStatement | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  if (row.v !== HANDLE_TRANSFER_STATEMENT_VERSION || row.kind !== 'handle_transfer') return null;
  const name = str(row.name, NAME_MAX);
  const rootPublicKey = str(row.rootPublicKey, KEY_MAX);
  const toPnIdentifier = str(row.toPnIdentifier, KEY_MAX);
  const issuedAt = iso(row.issuedAt);
  const n = nonce(row.nonce);
  if (!name || !rootPublicKey || !toPnIdentifier || !issuedAt || !n) return null;
  return {
    v: HANDLE_TRANSFER_STATEMENT_VERSION,
    kind: 'handle_transfer',
    name,
    rootPublicKey,
    toPnIdentifier,
    issuedAt,
    nonce: n,
  };
}

export function canonicalHandleTransferBytes(s: HandleTransferStatement): Uint8Array {
  const ordered = {
    v: s.v,
    kind: s.kind,
    name: s.name,
    rootPublicKey: s.rootPublicKey,
    toPnIdentifier: s.toPnIdentifier,
    issuedAt: s.issuedAt,
    nonce: s.nonce,
  };
  return new TextEncoder().encode(`${HANDLE_TRANSFER_DOMAIN}\n${JSON.stringify(ordered)}`);
}

export function buildHandleTransferStatement(args: {
  name: string;
  rootPublicKey: string;
  toPnIdentifier: string;
  nonce: string;
  issuedAt?: string;
}): HandleTransferStatement {
  const parsed = parseHandleTransferStatement({
    v: HANDLE_TRANSFER_STATEMENT_VERSION,
    kind: 'handle_transfer',
    issuedAt: args.issuedAt ?? new Date().toISOString(),
    ...args,
  });
  if (!parsed) throw new Error('Invalid handle transfer statement');
  return parsed;
}
