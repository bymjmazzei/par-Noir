/**
 * Handle registry. One global namespace compared by confusable skeleton; handles live on feeds.
 * Proof ladder: claim (1) < youtube (2) < dns (3). The earliest provable date wins: a claim is
 * dated when made, a domain by its RDAP registration. YouTube cannot be dated, so it opens a
 * dispute instead of superseding. Protected names need one of their listed proofs.
 */

import { createHash, randomBytes, randomUUID } from 'crypto';
import { promises as dns } from 'dns';
import { parse as parseDomain } from 'tldts';
import {
  confusableSkeleton,
  isValidHandle,
  normalizePublicName,
  proofStrength,
  type HandleProofType,
  type SignedHandleReceipt
} from '@par-noir/public-names';
import { canonicalHandleTransferBytes, parseHandleTransferStatement } from '@par-noir/standard-data-points';
import { getDatabasePool } from '../utils/database';
import { appendAuditEvent } from './auditService';
import { HandleReceiptService, type Queryable } from './handleReceiptService';
import { verifyRootSignedStatement } from './ownedAssetService';
import { ProtectedNameService, proofSatisfiesProtected, type ProtectedName } from './protectedNameService';
import { fetchDomainRegistrationDate } from './rdapService';

export type PublicNameProofType = HandleProofType;
export type PublicNameStatus =
  | 'pending'
  | 'proven'
  | 'listed'
  | 'revoked'
  | 'superseded'
  | 'disputed'
  | 'expired'
  | 'released';

export interface PublicNameRow {
  publicName: string;
  pnIdentifier: string;
  proofType: PublicNameProofType;
  proofSubject: string;
  status: PublicNameStatus;
  isVanity: boolean;
  feedId: string | null;
  strength: number;
  priorityAt: string | null;
  releasedUntil: string | null;
  listedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** What the public sees for a handle. Never the owner's root pN. */
export interface HandleBadge {
  handle: string;
  proofType: PublicNameProofType;
  strength: number;
  isVanity: boolean;
  feedId: string | null;
  ownerVerified: boolean;
  verifiedDisplayName?: string;
}

export type HandleNotice =
  | { kind: 'superseded'; handle: string; fallback: string | null }
  | { kind: 'disputed'; handle: string }
  | { kind: 'expiring'; handle: string; expiresAt: string }
  | { kind: 'expired'; handle: string }
  | { kind: 'transfer_incoming'; transferId: string; handle: string };

export interface PendingTransfer {
  id: string;
  publicName: string;
  direction: 'incoming' | 'outgoing';
  createdAt: string;
}

export interface ReproofChallenge {
  proofType: 'dns' | 'youtube';
  token?: string;
  dnsName?: string;
  wellKnownUrl?: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
export const RELEASE_COOLDOWN_MS = 30 * DAY_MS;
export const EXPIRY_INACTIVE_MS = 90 * DAY_MS;
export const EXPIRY_NOTICE_MS = 14 * DAY_MS;

const RATE_WINDOW_MS = 60 * 60 * 1000;
const RATE_MAX_START = 20;
const rateBuckets = new Map<string, number[]>();

function rateKey(pn: string, action: string): string {
  return `${pn}::${action}`;
}

export function checkPublicNameRateLimit(pn: string, action: string): boolean {
  const key = rateKey(pn, action);
  const now = Date.now();
  const prev = (rateBuckets.get(key) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (prev.length >= RATE_MAX_START) {
    rateBuckets.set(key, prev);
    return false;
  }
  prev.push(now);
  rateBuckets.set(key, prev);
  return true;
}

export function normalizePnIdentifier(pn: string): string {
  const t = String(pn || '').trim();
  if (!t) return '';
  return t.startsWith('pn-') ? t : `pn-${t}`;
}

export function normalizeDomainInput(raw: string): string {
  let d = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/\.$/, '');
  if (d.startsWith('www.')) d = d.slice(4);
  return d;
}

export function domainToCandidateName(domain: string): string | null {
  const parsed = parseDomain(domain, { allowPrivateDomains: true });
  if (!parsed.domainWithoutSuffix || parsed.isIp) return null;
  if (parsed.isIcann === false && parsed.isPrivate === false) return null;
  const name = normalizePublicName(parsed.domainWithoutSuffix);
  return name.length >= 2 ? name : null;
}

function fail(code: string, details?: Record<string, unknown>): never {
  throw Object.assign(new Error(code), { code, details });
}

function isoOrNull(v: unknown): string | null {
  if (!v) return null;
  const t = Date.parse(v instanceof Date ? v.toISOString() : String(v));
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

function mapRow(row: Record<string, any>): PublicNameRow {
  return {
    publicName: String(row.public_name),
    pnIdentifier: String(row.pn_identifier),
    proofType: row.proof_type as PublicNameProofType,
    proofSubject: String(row.proof_subject),
    status: row.status as PublicNameStatus,
    isVanity: Boolean(row.is_vanity),
    feedId: row.feed_id ? String(row.feed_id) : null,
    strength: Number(row.strength) || proofStrength(row.proof_type),
    priorityAt: isoOrNull(row.priority_at),
    releasedUntil: isoOrNull(row.released_until),
    listedAt: isoOrNull(row.listed_at),
    createdAt: isoOrNull(row.created_at) ?? new Date(0).toISOString(),
    updatedAt: isoOrNull(row.updated_at) ?? new Date(0).toISOString()
  };
}

function protectedDetails(p: ProtectedName): Record<string, unknown> {
  return {
    display: p.display,
    source: p.source,
    requiredDomains: p.requiredDomains,
    requiredYoutubeChannelIds: p.requiredYoutubeChannelIds
  };
}

async function withTx<T>(fn: (q: Queryable) => Promise<T>): Promise<T> {
  const client = await getDatabasePool().connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
}

function mapUniqueViolation(e: unknown): never {
  const err = e as { code?: string; constraint?: string };
  if (err?.code === '23505') {
    if (err.constraint === 'idx_public_names_one_claim_per_pn') fail('CLAIM_LIMIT');
    if (err.constraint === 'idx_public_name_transfers_pending') fail('TRANSFER_PENDING');
    fail('NAME_TAKEN');
  }
  throw e;
}

async function heldBySkeleton(q: Queryable, skeleton: string): Promise<Record<string, any> | null> {
  const r = await q.query(
    `SELECT * FROM public_names WHERE skeleton = $1 AND status IN ('listed', 'disputed') LIMIT 1`,
    [skeleton]
  );
  return r.rows[0] ?? null;
}

async function activeClaimOf(q: Queryable, pn: string): Promise<Record<string, any> | null> {
  const r = await q.query(
    `SELECT * FROM public_names
     WHERE pn_identifier = $1 AND proof_type = 'claim' AND status IN ('listed', 'disputed') LIMIT 1`,
    [pn]
  );
  return r.rows[0] ?? null;
}

async function ownedFeed(q: Queryable, pn: string, feedId: string): Promise<Record<string, any>> {
  const r = await q.query(
    `SELECT feed_id, sub_pn_identifier FROM feeds
     WHERE feed_id = $1
       AND (owner_pn_identifier = $2 OR creator_did = $2
            OR EXISTS (SELECT 1 FROM feed_tokens ft WHERE ft.feed_id = feeds.feed_id AND ft.owner_pn_identifier = $2))
       AND (status IS NULL OR status = 'active')
     LIMIT 1`,
    [feedId, pn]
  );
  if (!r.rows[0]) fail('FEED_NOT_OWNED');
  return r.rows[0];
}

/** The given feed (must be the caller's) or the caller's personal feed. */
async function resolveFeed(q: Queryable, pn: string, feedId?: string | null): Promise<string> {
  const id = String(feedId || '').trim();
  if (id) return String((await ownedFeed(q, pn, id)).feed_id);
  const r = await q.query(
    `SELECT feed_id FROM feeds WHERE owner_pn_identifier = $1 AND creator_tier = 'personal' LIMIT 1`,
    [pn]
  );
  if (!r.rows[0]) fail('FEED_REQUIRED');
  return String(r.rows[0].feed_id);
}

async function feedHasVanity(q: Queryable, feedId: string): Promise<boolean> {
  const r = await q.query(
    `SELECT 1 FROM public_names WHERE feed_id = $1 AND is_vanity = true AND status IN ('listed', 'disputed') LIMIT 1`,
    [feedId]
  );
  return r.rows.length > 0;
}

async function isOwnerVerified(q: Queryable, pn: string): Promise<boolean> {
  try {
    const r = await q.query(
      `SELECT 1 FROM verified_identities WHERE identity_id = $1 AND is_active = TRUE LIMIT 1`,
      [pn]
    );
    return r.rows.length > 0;
  } catch {
    return false;
  }
}

function earliest(a: unknown, b: unknown): string | null {
  const x = isoOrNull(a);
  const y = isoOrNull(b);
  if (!x) return y;
  if (!y) return x;
  return Date.parse(x) <= Date.parse(y) ? x : y;
}

export class PublicNameService {
  // ---------------------------------------------------------------------------
  // Reads
  // ---------------------------------------------------------------------------

  static async listMine(pnIdentifier: string): Promise<{
    names: PublicNameRow[];
    notices: HandleNotice[];
    transfers: PendingTransfer[];
  }> {
    const pn = normalizePnIdentifier(pnIdentifier);
    const db = getDatabasePool();
    const current = await db.query(
      `SELECT * FROM public_names WHERE pn_identifier = $1 AND proof_type = 'dns' AND status = 'listed'`,
      [pn]
    );
    for (const row of current.rows) {
      try {
        await this.recheckDnsRow(row);
      } catch {
        /* ignore recheck failures */
      }
    }
    const result = await db.query(
      `SELECT pn.*, COALESCE(f.last_activity_at, pn.priority_at, pn.created_at) AS activity_at
       FROM public_names pn LEFT JOIN feeds f ON f.feed_id = pn.feed_id
       WHERE pn.pn_identifier = $1
         AND (pn.status IN ('pending', 'proven', 'listed', 'disputed', 'superseded', 'expired')
              OR (pn.status = 'released' AND pn.released_until > NOW()))
       ORDER BY pn.created_at ASC`,
      [pn]
    );
    const rows = result.rows as Record<string, any>[];
    const notices: HandleNotice[] = [];
    for (const row of rows) {
      if (row.status === 'superseded') {
        const fallback = rows.find((r) => r.proof_meta?.fallbackFor === row.public_name);
        notices.push({ kind: 'superseded', handle: row.public_name, fallback: fallback?.public_name ?? null });
      } else if (row.status === 'disputed') {
        notices.push({ kind: 'disputed', handle: row.public_name });
      } else if (row.status === 'expired') {
        notices.push({ kind: 'expired', handle: row.public_name });
      } else if (row.status === 'listed' && row.proof_type === 'claim' && row.expiry_notified_at) {
        const activity = Date.parse(isoOrNull(row.activity_at) ?? '');
        if (!Number.isNaN(activity)) {
          notices.push({
            kind: 'expiring',
            handle: row.public_name,
            expiresAt: new Date(activity + EXPIRY_INACTIVE_MS).toISOString()
          });
        }
      }
    }
    const transfers = await this.listTransfers(pn);
    for (const t of transfers) {
      if (t.direction === 'incoming') {
        notices.push({ kind: 'transfer_incoming', transferId: t.id, handle: t.publicName });
      }
    }
    return { names: rows.map(mapRow), notices, transfers };
  }

  static async getByPnListed(pnIdentifier: string): Promise<PublicNameRow[]> {
    const pn = normalizePnIdentifier(pnIdentifier);
    const result = await getDatabasePool().query(
      `SELECT * FROM public_names
       WHERE pn_identifier = $1 AND status IN ('listed', 'disputed')
       ORDER BY is_vanity DESC, listed_at ASC NULLS LAST`,
      [pn]
    );
    return result.rows.map(mapRow);
  }

  static async getByFeedListed(feedId: string): Promise<PublicNameRow[]> {
    const result = await getDatabasePool().query(
      `SELECT * FROM public_names
       WHERE feed_id = $1 AND status IN ('listed', 'disputed')
       ORDER BY is_vanity DESC, listed_at ASC NULLS LAST`,
      [String(feedId || '')]
    );
    return result.rows.map(mapRow);
  }

  /** Badge fields for handles; verification is looked up through the owner, which stays private. */
  static async badges(rows: PublicNameRow[]): Promise<HandleBadge[]> {
    const db = getDatabasePool();
    const verified = new Map<string, boolean>();
    const displayNames = new Map<string, string | null>();
    const out: HandleBadge[] = [];
    for (const row of rows) {
      if (!verified.has(row.pnIdentifier)) verified.set(row.pnIdentifier, await isOwnerVerified(db, row.pnIdentifier));
      if (row.feedId && !displayNames.has(row.feedId)) {
        const f = await db.query(`SELECT verified_display_name FROM feeds WHERE feed_id = $1`, [row.feedId]);
        displayNames.set(row.feedId, f.rows[0]?.verified_display_name ?? null);
      }
      const ownerVerified = verified.get(row.pnIdentifier) === true;
      const display = row.feedId ? displayNames.get(row.feedId) : null;
      out.push({
        handle: row.publicName,
        proofType: row.proofType,
        strength: row.strength,
        isVanity: row.isVanity,
        feedId: row.feedId,
        ownerVerified,
        ...(ownerVerified && display ? { verifiedDisplayName: display } : {})
      });
    }
    return out;
  }

  static async searchListedExact(query: string): Promise<PublicNameRow | null> {
    const skeleton = confusableSkeleton(query);
    if (!skeleton) return null;
    const row = await heldBySkeleton(getDatabasePool(), skeleton);
    return row ? mapRow(row) : null;
  }

  static async resolveVanity(slug: string): Promise<PublicNameRow | null> {
    const name = normalizePublicName(slug);
    if (!name) return null;
    const result = await getDatabasePool().query(
      `SELECT * FROM public_names
       WHERE status IN ('listed', 'disputed') AND is_vanity = true AND public_name = $1
       LIMIT 1`,
      [name]
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  /** Live availability for the claim form. */
  static async checkAvailability(
    pnIdentifier: string,
    nameRaw: string
  ): Promise<{
    name: string;
    available: boolean;
    reason?: 'invalid' | 'taken' | 'yours' | 'protected' | 'released';
    protected?: Record<string, unknown>;
  }> {
    const pn = normalizePnIdentifier(pnIdentifier);
    const name = normalizePublicName(nameRaw);
    if (!isValidHandle(name)) return { name, available: false, reason: 'invalid' };
    const db = getDatabasePool();
    const skeleton = confusableSkeleton(name);
    const prot = await ProtectedNameService.lookup(db, skeleton);
    if (prot) return { name, available: false, reason: 'protected', protected: protectedDetails(prot) };
    const held = await heldBySkeleton(db, skeleton);
    if (held) return { name, available: false, reason: held.pn_identifier === pn ? 'yours' : 'taken' };
    const cooling = await db.query(
      `SELECT pn_identifier FROM public_names
       WHERE skeleton = $1 AND status = 'released' AND released_until > NOW() LIMIT 1`,
      [skeleton]
    );
    if (cooling.rows[0] && cooling.rows[0].pn_identifier !== pn) {
      return { name, available: false, reason: 'released' };
    }
    return { name, available: true };
  }

  // ---------------------------------------------------------------------------
  // First-come claims
  // ---------------------------------------------------------------------------

  static async claim(
    pnIdentifier: string,
    nameRaw: string,
    feedId?: string | null
  ): Promise<{ name: PublicNameRow; receipt: SignedHandleReceipt | null }> {
    const pn = normalizePnIdentifier(pnIdentifier);
    const name = normalizePublicName(nameRaw);
    if (!isValidHandle(name)) fail('INVALID_NAME');
    if (!checkPublicNameRateLimit(pn, 'claim')) fail('RATE_LIMIT');
    try {
      return await withTx(async (q) => {
        const feed = await resolveFeed(q, pn, feedId);
        return this.claimInTx(q, pn, name, feed, 'claim', null);
      });
    } catch (e) {
      return mapUniqueViolation(e);
    }
  }

  private static async claimInTx(
    q: Queryable,
    pn: string,
    name: string,
    feedId: string,
    event: 'claim' | 'rename',
    prevReceiptHash: string | null
  ): Promise<{ name: PublicNameRow; receipt: SignedHandleReceipt | null }> {
    const skeleton = confusableSkeleton(name);
    const prot = await ProtectedNameService.lookup(q, skeleton);
    if (prot) fail('NAME_PROTECTED', protectedDetails(prot));
    const held = await heldBySkeleton(q, skeleton);
    if (held) {
      if (held.pn_identifier === pn && held.public_name === name) return { name: mapRow(held), receipt: null };
      fail('NAME_TAKEN');
    }
    const cooling = await q.query(
      `SELECT * FROM public_names
       WHERE skeleton = $1 AND status = 'released' AND released_until > NOW()
       ORDER BY released_until DESC LIMIT 1`,
      [skeleton]
    );
    const cool = cooling.rows[0] as Record<string, any> | undefined;
    if (cool && cool.pn_identifier !== pn) fail('NAME_RELEASED');
    const active = await activeClaimOf(q, pn);
    if (active) fail('CLAIM_LIMIT', { current: active.public_name });

    const vanity = !(await feedHasVanity(q, feedId));
    let row: Record<string, any>;
    let prev = prevReceiptHash;
    if (cool && cool.proof_type === 'claim' && cool.public_name === name) {
      row = (
        await q.query(
          `UPDATE public_names SET status = 'listed', feed_id = $3, is_vanity = $4, released_until = NULL,
             listed_at = NOW(), updated_at = NOW()
           WHERE proof_type = 'claim' AND proof_subject = $1 AND pn_identifier = $2
           RETURNING *`,
          [cool.proof_subject, pn, feedId, vanity]
        )
      ).rows[0];
      prev = prev ?? cool.receipt_hash ?? null;
    } else {
      row = (
        await q.query(
          `INSERT INTO public_names (
             public_name, pn_identifier, proof_type, proof_subject, status, is_vanity, listed_at, updated_at,
             feed_id, skeleton, strength, priority_at
           ) VALUES ($1, $2, 'claim', $3, 'listed', $4, NOW(), NOW(), $5, $6, 1, NOW())
           RETURNING *`,
          [name, pn, `claim-${randomUUID()}`, vanity, feedId, skeleton]
        )
      ).rows[0];
    }
    const receipt = await HandleReceiptService.issue(q, row, event, prev);
    return { name: mapRow(row), receipt };
  }

  /** Give up a first-come claim. Only the previous holder can take it back during the cooldown. */
  static async release(pnIdentifier: string, nameRaw: string): Promise<PublicNameRow> {
    const pn = normalizePnIdentifier(pnIdentifier);
    const name = normalizePublicName(nameRaw);
    return withTx(async (q) => {
      const row = await this.releaseInTx(q, pn, name);
      return mapRow(row);
    });
  }

  private static async releaseInTx(q: Queryable, pn: string, name: string): Promise<Record<string, any>> {
    const r = await q.query(
      `UPDATE public_names SET status = 'released', is_vanity = false,
         released_until = NOW() + ($3 || ' milliseconds')::interval, updated_at = NOW()
       WHERE pn_identifier = $1 AND public_name = $2 AND proof_type = 'claim' AND status = 'listed'
       RETURNING *`,
      [pn, name, String(RELEASE_COOLDOWN_MS)]
    );
    const row = r.rows[0];
    if (!row) fail('NOT_FOUND');
    const receipt = await HandleReceiptService.issue(q, row, 'release', row.receipt_hash ?? null);
    return { ...row, receipt_hash: receipt?.hash ?? row.receipt_hash };
  }

  /** Release the old handle and claim the new one in one transaction. */
  static async rename(
    pnIdentifier: string,
    oldRaw: string,
    newRaw: string
  ): Promise<{ name: PublicNameRow; receipt: SignedHandleReceipt | null }> {
    const pn = normalizePnIdentifier(pnIdentifier);
    const oldName = normalizePublicName(oldRaw);
    const newName = normalizePublicName(newRaw);
    if (!isValidHandle(newName)) fail('INVALID_NAME');
    if (newName === oldName) fail('INVALID_NAME');
    if (!checkPublicNameRateLimit(pn, 'claim')) fail('RATE_LIMIT');
    try {
      return await withTx(async (q) => {
        const released = await this.releaseInTx(q, pn, oldName);
        return this.claimInTx(q, pn, newName, String(released.feed_id), 'rename', released.receipt_hash ?? null);
      });
    } catch (e) {
      return mapUniqueViolation(e);
    }
  }

  /** Move a handle to another feed the same pN owns. */
  static async moveToFeed(
    pnIdentifier: string,
    nameRaw: string,
    feedId: string
  ): Promise<{ name: PublicNameRow; receipt: SignedHandleReceipt | null }> {
    const pn = normalizePnIdentifier(pnIdentifier);
    const name = normalizePublicName(nameRaw);
    return withTx(async (q) => {
      const target = String((await ownedFeed(q, pn, feedId)).feed_id);
      const cur = await q.query(
        `SELECT * FROM public_names WHERE pn_identifier = $1 AND public_name = $2 AND status IN ('listed', 'disputed') LIMIT 1`,
        [pn, name]
      );
      const row = cur.rows[0];
      if (!row) fail('NOT_FOUND');
      if (row.feed_id === target) return { name: mapRow(row), receipt: null };
      const vanity = !(await feedHasVanity(q, target));
      const moved = (
        await q.query(
          `UPDATE public_names SET feed_id = $3, is_vanity = $4, updated_at = NOW()
           WHERE proof_type = $1 AND proof_subject = $2 RETURNING *`,
          [row.proof_type, row.proof_subject, target, vanity]
        )
      ).rows[0];
      const receipt = await HandleReceiptService.issue(q, moved, 'move', row.receipt_hash ?? null);
      return { name: mapRow(moved), receipt };
    });
  }

  // ---------------------------------------------------------------------------
  // Domain and YouTube proofs
  // ---------------------------------------------------------------------------

  static async startDns(
    pnIdentifier: string,
    domainRaw: string
  ): Promise<{
    token: string;
    domain: string;
    dnsName: string;
    wellKnownUrl: string;
    candidateName: string;
  }> {
    const pn = normalizePnIdentifier(pnIdentifier);
    if (!checkPublicNameRateLimit(pn, 'dns_start')) fail('RATE_LIMIT');
    const domain = normalizeDomainInput(domainRaw);
    const candidateName = domainToCandidateName(domain);
    if (!candidateName) fail('INVALID_DOMAIN');
    const parsed = parseDomain(domain, { allowPrivateDomains: true });
    if (parsed.isIp || !parsed.hostname) fail('INVALID_DOMAIN');

    const token = `pn-verify-${randomBytes(16).toString('hex')}`;
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const skeleton = confusableSkeleton(candidateName);
    const db = getDatabasePool();

    const existing = await db.query(
      `SELECT pn_identifier, status FROM public_names
       WHERE proof_type = 'dns' AND proof_subject = $1`,
      [domain]
    );
    if (existing.rows[0]) {
      const owner = normalizePnIdentifier(String(existing.rows[0].pn_identifier));
      const st = String(existing.rows[0].status);
      if (owner !== pn && ['pending', 'proven', 'listed', 'disputed'].includes(st)) fail('PROOF_SUBJECT_TAKEN');
      await db.query(
        `UPDATE public_names SET
           public_name = $1,
           pn_identifier = $2,
           status = 'pending',
           verify_token_hash = $3,
           verify_token_expires_at = $4,
           is_vanity = false,
           listed_at = NULL,
           skeleton = $6,
           strength = 3,
           updated_at = NOW()
         WHERE proof_type = 'dns' AND proof_subject = $5`,
        [candidateName, pn, tokenHash, expiresAt.toISOString(), domain, skeleton]
      );
    } else {
      await db.query(
        `INSERT INTO public_names (
           public_name, pn_identifier, proof_type, proof_subject, status,
           verify_token_hash, verify_token_expires_at, is_vanity, skeleton, strength, updated_at
         ) VALUES ($1, $2, 'dns', $3, 'pending', $4, $5, false, $6, 3, NOW())`,
        [candidateName, pn, domain, tokenHash, expiresAt.toISOString(), skeleton]
      );
    }

    return {
      token,
      domain,
      dnsName: `_parnoir.${domain}`,
      wellKnownUrl: `https://${domain}/.well-known/parnoir-verify.txt`,
      candidateName
    };
  }

  static async verifyDnsProof(domain: string, expectedTokenHash: string, plainTokenHint?: string): Promise<boolean> {
    const dnsName = `_parnoir.${domain}`;
    try {
      const txts = await dns.resolveTxt(dnsName);
      const flat = txts.map((parts) => parts.join(''));
      for (const record of flat) {
        const hash = createHash('sha256').update(record.trim()).digest('hex');
        if (hash === expectedTokenHash) return true;
        if (plainTokenHint && record.trim() === plainTokenHint) return true;
      }
    } catch {
      /* no TXT */
    }

    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 8000);
      const res = await fetch(`https://${domain}/.well-known/parnoir-verify.txt`, {
        signal: ctrl.signal,
        redirect: 'follow',
        headers: { Accept: 'text/plain' }
      });
      clearTimeout(t);
      if (res.ok) {
        const body = (await res.text()).trim().split(/\r?\n/)[0]?.trim() || '';
        const hash = createHash('sha256').update(body).digest('hex');
        if (hash === expectedTokenHash) return true;
        if (plainTokenHint && body === plainTokenHint) return true;
      }
    } catch {
      /* no well-known */
    }
    return false;
  }

  /** Proven domains are dated by RDAP registration; no date means the proof cannot supersede. */
  static async completeDnsVerify(pnIdentifier: string, domainRaw: string): Promise<PublicNameRow> {
    const pn = normalizePnIdentifier(pnIdentifier);
    if (!checkPublicNameRateLimit(pn, 'dns_verify')) fail('RATE_LIMIT');
    const domain = normalizeDomainInput(domainRaw);
    const db = getDatabasePool();
    const result = await db.query(
      `SELECT * FROM public_names
       WHERE proof_type = 'dns' AND proof_subject = $1 AND pn_identifier = $2`,
      [domain, pn]
    );
    const row = result.rows[0];
    if (!row) fail('NOT_FOUND');
    if (row.verify_token_expires_at && new Date(row.verify_token_expires_at).getTime() < Date.now()) {
      fail('TOKEN_EXPIRED');
    }
    const ok = await this.verifyDnsProof(domain, String(row.verify_token_hash || ''));
    if (!ok) fail('DNS_VERIFY_FAILED');
    const registeredAt = await fetchDomainRegistrationDate(domain);
    const updated = await db.query(
      `UPDATE public_names SET
         status = 'proven',
         verify_token_hash = NULL,
         verify_token_expires_at = NULL,
         proof_meta = proof_meta || $3::jsonb,
         updated_at = NOW()
       WHERE proof_type = 'dns' AND proof_subject = $1 AND pn_identifier = $2
       RETURNING *`,
      [domain, pn, JSON.stringify({ registeredAt })]
    );
    return mapRow(updated.rows[0]);
  }

  static async completeYoutube(pnIdentifier: string, googleAccessToken: string): Promise<PublicNameRow> {
    const pn = normalizePnIdentifier(pnIdentifier);
    if (!checkPublicNameRateLimit(pn, 'youtube_complete')) fail('RATE_LIMIT');
    const channel = await this.fetchOwnYoutubeChannel(googleAccessToken);
    const db = getDatabasePool();

    const takenSubject = await db.query(
      `SELECT pn_identifier, status FROM public_names
       WHERE proof_type = 'youtube' AND proof_subject = $1`,
      [channel.id]
    );
    if (
      takenSubject.rows[0] &&
      normalizePnIdentifier(takenSubject.rows[0].pn_identifier) !== pn &&
      ['proven', 'listed', 'pending', 'disputed'].includes(String(takenSubject.rows[0].status))
    ) {
      fail('PROOF_SUBJECT_TAKEN');
    }

    const upsert = await db.query(
      `INSERT INTO public_names (
         public_name, pn_identifier, proof_type, proof_subject, status, is_vanity, skeleton, strength,
         proof_meta, updated_at
       ) VALUES ($1, $2, 'youtube', $3, 'proven', false, $4, 2, $5::jsonb, NOW())
       ON CONFLICT (proof_type, proof_subject) DO UPDATE SET
         public_name = EXCLUDED.public_name,
         pn_identifier = EXCLUDED.pn_identifier,
         skeleton = EXCLUDED.skeleton,
         strength = 2,
         proof_meta = public_names.proof_meta || EXCLUDED.proof_meta,
         status = CASE
           WHEN public_names.status IN ('listed', 'disputed') AND public_names.pn_identifier = EXCLUDED.pn_identifier
             THEN public_names.status
           ELSE 'proven'
         END,
         is_vanity = CASE
           WHEN public_names.status = 'listed' AND public_names.pn_identifier = EXCLUDED.pn_identifier
             THEN public_names.is_vanity
           ELSE false
         END,
         updated_at = NOW()
       RETURNING *`,
      [
        channel.handle,
        pn,
        channel.id,
        confusableSkeleton(channel.handle),
        JSON.stringify({ channelPublishedAt: channel.publishedAt })
      ]
    );
    return mapRow(upsert.rows[0]);
  }

  private static async fetchOwnYoutubeChannel(
    googleAccessToken: string
  ): Promise<{ id: string; handle: string; publishedAt: string | null }> {
    const res = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet,status&mine=true', {
      headers: { Authorization: `Bearer ${googleAccessToken}` }
    });
    if (!res.ok) fail('YOUTUBE_API_ERROR');
    const data = (await res.json()) as {
      items?: Array<{
        id?: string;
        snippet?: { customUrl?: string; title?: string; publishedAt?: string };
        status?: { isLinked?: boolean };
      }>;
    };
    const channel = data.items?.[0];
    if (!channel?.id) fail('NO_YOUTUBE_CHANNEL');
    const handle = normalizePublicName(String(channel.snippet?.customUrl || '').trim());
    if (!handle || handle.length < 2) fail('NO_YOUTUBE_HANDLE');
    if (channel.status && channel.status.isLinked === false) fail('YOUTUBE_NOT_VERIFIED');
    return { id: channel.id, handle, publishedAt: isoOrNull(channel.snippet?.publishedAt) };
  }

  /**
   * List a proven domain or YouTube handle. Against a holder: your own claim upgrades in place
   * and keeps its date; an earlier-registered domain supersedes a weaker holder; YouTube opens a
   * dispute and the holder keeps the name meanwhile.
   */
  static async listName(
    pnIdentifier: string,
    publicNameRaw: string,
    feedId?: string | null
  ): Promise<{ name: PublicNameRow; receipt: SignedHandleReceipt | null; disputed?: boolean }> {
    const pn = normalizePnIdentifier(pnIdentifier);
    const name = normalizePublicName(publicNameRaw);
    try {
      return await withTx(async (q) => {
        const mineRes = await q.query(
          `SELECT * FROM public_names
           WHERE pn_identifier = $1 AND public_name = $2 AND proof_type IN ('dns', 'youtube')
             AND status IN ('proven', 'listed', 'disputed')
           ORDER BY strength DESC LIMIT 1`,
          [pn, name]
        );
        const mine = mineRes.rows[0];
        if (!mine) {
          const claim = await q.query(
            `SELECT * FROM public_names WHERE pn_identifier = $1 AND public_name = $2 AND proof_type = 'claim'
               AND status IN ('listed', 'disputed') LIMIT 1`,
            [pn, name]
          );
          if (claim.rows[0]) return { name: mapRow(claim.rows[0]), receipt: null };
          fail('NOT_PROVEN');
        }
        if (mine.status !== 'proven') return { name: mapRow(mine), receipt: null };

        const skeleton = mine.skeleton || confusableSkeleton(name);
        const prot = await ProtectedNameService.lookup(q, skeleton);
        if (prot && !proofSatisfiesProtected(prot, mine.proof_type, mine.proof_subject)) {
          fail('NAME_PROTECTED', protectedDetails(prot));
        }

        const strength = proofStrength(mine.proof_type);
        let priorityAt: string | null =
          mine.proof_type === 'dns' ? isoOrNull(mine.proof_meta?.registeredAt) : null;
        let prev: string | null = mine.receipt_hash ?? null;
        let vanity: boolean | null = null;
        let target: string;

        const held = await heldBySkeleton(q, skeleton);
        if (held && held.pn_identifier === pn) {
          target = feedId ? String((await ownedFeed(q, pn, feedId)).feed_id) : String(held.feed_id || '');
          if (!target) target = await resolveFeed(q, pn, null);
          priorityAt = earliest(held.priority_at, priorityAt);
          vanity = Boolean(held.is_vanity) && target === held.feed_id;
          prev = held.receipt_hash ?? prev;
          await q.query(
            `UPDATE public_names SET status = 'revoked', is_vanity = false, updated_at = NOW(),
               proof_meta = proof_meta || $3::jsonb
             WHERE proof_type = $1 AND proof_subject = $2`,
            [held.proof_type, held.proof_subject, JSON.stringify({ upgradedTo: mine.proof_type })]
          );
        } else if (held) {
          if (held.status === 'disputed') fail('NAME_DISPUTED');
          if (mine.proof_type === 'youtube') {
            await this.openDispute(q, held, pn, 'youtube', {
              holderPriorityAt: isoOrNull(held.priority_at),
              holderProofType: held.proof_type,
              channelId: mine.proof_subject,
              channelPublishedAt: mine.proof_meta?.channelPublishedAt ?? null
            });
            return { name: mapRow(mine), receipt: null, disputed: true };
          }
          const heldAt = isoOrNull(held.priority_at);
          if (
            !priorityAt ||
            !heldAt ||
            Number(held.strength) >= strength ||
            Date.parse(priorityAt) >= Date.parse(heldAt)
          ) {
            fail('NAME_TAKEN');
          }
          await this.supersede(q, held, pn, { domain: mine.proof_subject, registeredAt: priorityAt });
          target = await resolveFeed(q, pn, feedId);
        } else {
          target = await resolveFeed(q, pn, feedId);
        }

        if (vanity === null) vanity = !(await feedHasVanity(q, target));
        const listed = (
          await q.query(
            `UPDATE public_names SET status = 'listed', listed_at = COALESCE(listed_at, NOW()),
               feed_id = $3, skeleton = $4, strength = $5, priority_at = COALESCE($6::timestamptz, NOW()),
               is_vanity = $7, updated_at = NOW()
             WHERE proof_type = $1 AND proof_subject = $2
             RETURNING *`,
            [mine.proof_type, mine.proof_subject, target, skeleton, strength, priorityAt, vanity]
          )
        ).rows[0];
        const receipt = await HandleReceiptService.issue(q, listed, 'prove', prev);
        return { name: mapRow(listed), receipt };
      });
    } catch (e) {
      return mapUniqueViolation(e);
    }
  }

  private static async openDispute(
    q: Queryable,
    held: Record<string, any>,
    challengerPn: string,
    kind: string,
    evidence: Record<string, unknown>
  ): Promise<void> {
    await q.query(
      `INSERT INTO public_name_disputes (
         skeleton, public_name, holder_pn_identifier, challenger_pn_identifier, kind, evidence
       ) VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [held.skeleton, held.public_name, held.pn_identifier, challengerPn, kind, JSON.stringify(evidence)]
    );
    await q.query(
      `UPDATE public_names SET status = 'disputed', updated_at = NOW() WHERE proof_type = $1 AND proof_subject = $2`,
      [held.proof_type, held.proof_subject]
    );
    await appendAuditEvent({
      eventType: 'public_name.disputed',
      actorHint: 'registry',
      subjectPnIdentifier: held.pn_identifier,
      metadata: { handle: held.public_name, kind }
    });
  }

  /** Demote the holder and give them `<name>-<4 chars of their feed sub-pN>` if they have no other claim. */
  private static async supersede(
    q: Queryable,
    held: Record<string, any>,
    winnerPn: string,
    evidence: Record<string, unknown>
  ): Promise<void> {
    const demoted = (
      await q.query(
        `UPDATE public_names SET status = 'superseded', is_vanity = false, updated_at = NOW(),
           proof_meta = proof_meta || $3::jsonb
         WHERE proof_type = $1 AND proof_subject = $2 RETURNING *`,
        [held.proof_type, held.proof_subject, JSON.stringify({ supersededBy: 'dns', ...evidence })]
      )
    ).rows[0];
    const supersedeReceipt = await HandleReceiptService.issue(q, demoted, 'supersede', held.receipt_hash ?? null);
    await appendAuditEvent({
      eventType: 'public_name.superseded',
      actorHint: 'registry',
      subjectPnIdentifier: held.pn_identifier,
      metadata: { handle: held.public_name, winnerProof: 'dns' }
    });
    if (winnerPn === held.pn_identifier || !held.feed_id) return;
    if (await activeClaimOf(q, held.pn_identifier)) return;

    const feed = await q.query(`SELECT sub_pn_identifier FROM feeds WHERE feed_id = $1`, [held.feed_id]);
    const sub = String(feed.rows[0]?.sub_pn_identifier || '').replace(/^pn-/, '') || randomBytes(8).toString('hex');
    for (const len of [4, 6, 8]) {
      const suffix = sub.slice(0, len);
      const fallback = `${String(held.public_name).slice(0, 32 - suffix.length - 1)}-${suffix}`;
      const skeleton = confusableSkeleton(fallback);
      if (!isValidHandle(fallback)) continue;
      if (await heldBySkeleton(q, skeleton)) continue;
      if (await ProtectedNameService.lookup(q, skeleton)) continue;
      const row = (
        await q.query(
          `INSERT INTO public_names (
             public_name, pn_identifier, proof_type, proof_subject, status, is_vanity, listed_at, updated_at,
             feed_id, skeleton, strength, priority_at, proof_meta
           ) VALUES ($1, $2, 'claim', $3, 'listed', $4, NOW(), NOW(), $5, $6, 1, NOW(), $7::jsonb)
           RETURNING *`,
          [
            fallback,
            held.pn_identifier,
            `claim-${randomUUID()}`,
            !(await feedHasVanity(q, held.feed_id)),
            held.feed_id,
            skeleton,
            JSON.stringify({ fallbackFor: held.public_name })
          ]
        )
      ).rows[0];
      await HandleReceiptService.issue(q, row, 'claim', supersedeReceipt?.hash ?? null);
      return;
    }
  }

  static async unlistName(pnIdentifier: string, publicNameRaw: string): Promise<PublicNameRow> {
    const pn = normalizePnIdentifier(pnIdentifier);
    const name = normalizePublicName(publicNameRaw);
    const db = getDatabasePool();
    const claim = await db.query(
      `SELECT 1 FROM public_names WHERE pn_identifier = $1 AND public_name = $2 AND proof_type = 'claim' AND status = 'listed'`,
      [pn, name]
    );
    if (claim.rows[0]) return this.release(pn, name);
    const updated = await db.query(
      `UPDATE public_names SET
         status = 'proven',
         is_vanity = false,
         listed_at = NULL,
         updated_at = NOW()
       WHERE pn_identifier = $1 AND public_name = $2 AND status = 'listed'
       RETURNING *`,
      [pn, name]
    );
    if (!updated.rows[0]) fail('NOT_FOUND');
    return mapRow(updated.rows[0]);
  }

  /** The handle a feed's URL shows. One per feed. */
  static async setVanity(pnIdentifier: string, publicNameRaw: string): Promise<PublicNameRow> {
    const pn = normalizePnIdentifier(pnIdentifier);
    const name = normalizePublicName(publicNameRaw);
    return withTx(async (q) => {
      const mine = await q.query(
        `SELECT * FROM public_names WHERE pn_identifier = $1 AND public_name = $2 AND status IN ('listed', 'disputed')`,
        [pn, name]
      );
      if (!mine.rows[0]) fail('NOT_LISTED');
      await q.query(
        `UPDATE public_names SET is_vanity = false, updated_at = NOW()
         WHERE feed_id = $1 AND is_vanity = true`,
        [mine.rows[0].feed_id]
      );
      const updated = await q.query(
        `UPDATE public_names SET is_vanity = true, updated_at = NOW()
         WHERE proof_type = $1 AND proof_subject = $2
         RETURNING *`,
        [mine.rows[0].proof_type, mine.rows[0].proof_subject]
      );
      return mapRow(updated.rows[0]);
    });
  }

  static async clearVanity(pnIdentifier: string): Promise<void> {
    const pn = normalizePnIdentifier(pnIdentifier);
    await getDatabasePool().query(
      `UPDATE public_names SET is_vanity = false, updated_at = NOW()
       WHERE pn_identifier = $1 AND is_vanity = true`,
      [pn]
    );
  }

  // ---------------------------------------------------------------------------
  // Transfers
  // ---------------------------------------------------------------------------

  /** The root signs a HandleTransferStatement; the recipient still has to accept. */
  static async createTransfer(
    pnIdentifier: string,
    statementRaw: unknown,
    signature: string,
    now: number = Date.now()
  ): Promise<{ id: string; publicName: string }> {
    const pn = normalizePnIdentifier(pnIdentifier);
    const raw = typeof statementRaw === 'string' ? safeJson(statementRaw) : statementRaw;
    const statement = parseHandleTransferStatement(raw);
    if (!statement) fail('INVALID_INPUT', { reason: 'handle_transfer_statement_required' });
    verifyRootSignedStatement({
      prefix: 'handle_transfer',
      root: pn,
      rootPublicKey: statement.rootPublicKey,
      bytes: canonicalHandleTransferBytes(statement),
      signature,
      issuedAt: statement.issuedAt,
      now
    });
    const name = normalizePublicName(statement.name);
    const to = normalizePnIdentifier(statement.toPnIdentifier);
    if (!to || to === pn) fail('INVALID_INPUT', { reason: 'transfer_to_self' });
    const db = getDatabasePool();
    const row = await db.query(
      `SELECT 1 FROM public_names WHERE pn_identifier = $1 AND public_name = $2 AND status = 'listed' LIMIT 1`,
      [pn, name]
    );
    if (!row.rows[0]) fail('NOT_FOUND');
    try {
      const inserted = await db.query(
        `INSERT INTO public_name_transfers (public_name, from_pn_identifier, to_pn_identifier, statement, signature)
         VALUES ($1, $2, $3, $4::jsonb, $5) RETURNING id`,
        [name, pn, to, JSON.stringify(statement), signature]
      );
      await appendAuditEvent({
        eventType: 'public_name.transfer_offered',
        actorHint: 'dashboard',
        subjectPnIdentifier: pn,
        metadata: { handle: name, transferId: inserted.rows[0].id }
      });
      return { id: String(inserted.rows[0].id), publicName: name };
    } catch (e) {
      return mapUniqueViolation(e);
    }
  }

  static async listTransfers(pnIdentifier: string): Promise<PendingTransfer[]> {
    const pn = normalizePnIdentifier(pnIdentifier);
    const r = await getDatabasePool().query(
      `SELECT id, public_name, from_pn_identifier, to_pn_identifier, created_at FROM public_name_transfers
       WHERE status = 'pending' AND (from_pn_identifier = $1 OR to_pn_identifier = $1)
       ORDER BY created_at ASC`,
      [pn]
    );
    return r.rows.map((t) => ({
      id: String(t.id),
      publicName: String(t.public_name),
      direction: t.to_pn_identifier === pn ? 'incoming' : 'outgoing',
      createdAt: isoOrNull(t.created_at) ?? new Date(0).toISOString()
    }));
  }

  static async cancelTransfer(pnIdentifier: string, transferId: string): Promise<void> {
    const pn = normalizePnIdentifier(pnIdentifier);
    const r = await getDatabasePool().query(
      `UPDATE public_name_transfers SET status = 'cancelled', completed_at = NOW()
       WHERE id::text = $1 AND status = 'pending' AND (from_pn_identifier = $2 OR to_pn_identifier = $2)`,
      [transferId, pn]
    );
    if (!r.rowCount) fail('NOT_FOUND');
  }

  /**
   * The recipient takes the handle onto one of its feeds. The priority date travels. A claim
   * counts toward the recipient's one-claim limit; a proven handle moves only after re-proof.
   */
  static async acceptTransfer(
    pnIdentifier: string,
    transferId: string,
    opts: { feedId?: string | null; googleAccessToken?: string | null } = {}
  ): Promise<
    | { status: 'completed'; name: PublicNameRow; receipt: SignedHandleReceipt | null }
    | { status: 'reproof_required'; challenge: ReproofChallenge }
  > {
    const pn = normalizePnIdentifier(pnIdentifier);
    try {
      return await withTx(async (q) => {
        const tr = await q.query(
          `SELECT * FROM public_name_transfers WHERE id::text = $1 AND status = 'pending' FOR UPDATE`,
          [transferId]
        );
        const t = tr.rows[0];
        if (!t || t.to_pn_identifier !== pn) fail('NOT_FOUND');
        const cur = await q.query(
          `SELECT * FROM public_names WHERE pn_identifier = $1 AND public_name = $2 AND status = 'listed' LIMIT 1 FOR UPDATE`,
          [t.from_pn_identifier, t.public_name]
        );
        const row = cur.rows[0];
        if (!row) fail('TRANSFER_STALE');
        const feedId = await resolveFeed(q, pn, opts.feedId);

        if (row.proof_type === 'claim') {
          if (await activeClaimOf(q, pn)) fail('CLAIM_LIMIT');
        } else if (row.proof_type === 'youtube') {
          const token = String(opts.googleAccessToken || '').trim();
          const channel = token ? await this.fetchOwnYoutubeChannel(token) : null;
          if (!channel || channel.id !== row.proof_subject) {
            return { status: 'reproof_required' as const, challenge: { proofType: 'youtube' as const } };
          }
        } else {
          const domain = String(row.proof_subject);
          const pendingHash = String(row.proof_meta?.transferTokenHash || '');
          const pendingFor = String(row.proof_meta?.transferTokenFor || '');
          const pendingExpires = Date.parse(String(row.proof_meta?.transferTokenExpiresAt || ''));
          const proven =
            pendingHash &&
            pendingFor === t.id &&
            pendingExpires > Date.now() &&
            (await this.verifyDnsProof(domain, pendingHash));
          if (!proven) {
            const token = `pn-verify-${randomBytes(16).toString('hex')}`;
            await q.query(
              `UPDATE public_names SET proof_meta = proof_meta || $3::jsonb WHERE proof_type = $1 AND proof_subject = $2`,
              [
                row.proof_type,
                row.proof_subject,
                JSON.stringify({
                  transferTokenHash: createHash('sha256').update(token).digest('hex'),
                  transferTokenFor: t.id,
                  transferTokenExpiresAt: new Date(Date.now() + DAY_MS).toISOString()
                })
              ]
            );
            return {
              status: 'reproof_required' as const,
              challenge: {
                proofType: 'dns' as const,
                token,
                dnsName: `_parnoir.${domain}`,
                wellKnownUrl: `https://${domain}/.well-known/parnoir-verify.txt`
              }
            };
          }
        }

        const vanity = !(await feedHasVanity(q, feedId));
        const moved = (
          await q.query(
            `UPDATE public_names SET pn_identifier = $3, feed_id = $4, is_vanity = $5, updated_at = NOW(),
               expiry_notified_at = NULL,
               proof_meta = proof_meta - 'transferTokenHash' - 'transferTokenFor' - 'transferTokenExpiresAt'
             WHERE proof_type = $1 AND proof_subject = $2 RETURNING *`,
            [row.proof_type, row.proof_subject, pn, feedId, vanity]
          )
        ).rows[0];
        await q.query(
          `UPDATE public_name_transfers SET status = 'completed', completed_at = NOW() WHERE id = $1`,
          [t.id]
        );
        const receipt = await HandleReceiptService.issue(q, moved, 'transfer', row.receipt_hash ?? null);
        await appendAuditEvent({
          eventType: 'public_name.transferred',
          actorHint: 'dashboard',
          subjectPnIdentifier: t.from_pn_identifier,
          metadata: { handle: row.public_name, transferId: t.id, proofType: row.proof_type }
        });
        return { status: 'completed' as const, name: mapRow(moved), receipt };
      });
    } catch (e) {
      return mapUniqueViolation(e);
    }
  }

  // ---------------------------------------------------------------------------
  // Expiry
  // ---------------------------------------------------------------------------

  /**
   * Expire a first-come claim when the owner is not verified, the handle has no domain or
   * YouTube proof, and its feed has had no public post for 90 days. Notice 14 days before.
   */
  static async runExpirySweep(now: number = Date.now()): Promise<{ expired: number; noticed: number }> {
    const db = getDatabasePool();
    const r = await db.query(
      `SELECT pn.*, COALESCE(f.last_activity_at, pn.priority_at, pn.created_at) AS activity_at
       FROM public_names pn LEFT JOIN feeds f ON f.feed_id = pn.feed_id
       WHERE pn.proof_type = 'claim' AND pn.status = 'listed'
         AND NOT EXISTS (
           SELECT 1 FROM verified_identities v WHERE v.identity_id = pn.pn_identifier AND v.is_active = TRUE
         )`
    );
    let expired = 0;
    let noticed = 0;
    for (const row of r.rows as Record<string, any>[]) {
      const activity = Date.parse(isoOrNull(row.activity_at) ?? '');
      if (Number.isNaN(activity)) continue;
      const idle = now - activity;
      if (idle > EXPIRY_INACTIVE_MS) {
        await withTx(async (q) => {
          const done = await q.query(
            `UPDATE public_names SET status = 'expired', is_vanity = false, updated_at = NOW()
             WHERE proof_type = 'claim' AND proof_subject = $1 AND status = 'listed' RETURNING *`,
            [row.proof_subject]
          );
          if (done.rows[0]) {
            await HandleReceiptService.issue(q, done.rows[0], 'expire', row.receipt_hash ?? null);
            expired++;
          }
        });
      } else if (idle > EXPIRY_INACTIVE_MS - EXPIRY_NOTICE_MS) {
        const notified = Date.parse(isoOrNull(row.expiry_notified_at) ?? '');
        if (Number.isNaN(notified) || notified < activity) {
          await db.query(
            `UPDATE public_names SET expiry_notified_at = NOW() WHERE proof_type = 'claim' AND proof_subject = $1`,
            [row.proof_subject]
          );
          noticed++;
        }
      }
    }
    return { expired, noticed };
  }

  private static expiryTimer: ReturnType<typeof setInterval> | null = null;

  static startExpirySweep(): void {
    if (this.expiryTimer) return;
    const run = () =>
      void this.runExpirySweep().catch((e) =>
        console.warn('[public-names] expiry sweep failed:', e instanceof Error ? e.message : e)
      );
    this.expiryTimer = setInterval(run, DAY_MS);
    this.expiryTimer.unref?.();
  }

  static stopExpirySweep(): void {
    if (this.expiryTimer) clearInterval(this.expiryTimer);
    this.expiryTimer = null;
  }

  // ---------------------------------------------------------------------------
  // Proof drift
  // ---------------------------------------------------------------------------

  /** Re-check DNS proofs for listed rows; demote if the proof is gone. */
  static async recheckDnsRow(row: {
    public_name: string;
    pn_identifier: string;
    proof_subject: string;
    status: string;
  }): Promise<void> {
    if (row.status !== 'listed' && row.status !== 'proven') return;
    const domain = String(row.proof_subject);
    let ok = false;
    try {
      const txts = await dns.resolveTxt(`_parnoir.${domain}`);
      const flat = txts.map((parts) => parts.join(''));
      ok = flat.some((r) => r.trim().startsWith('pn-verify-'));
    } catch {
      /* */
    }
    if (!ok) {
      try {
        const res = await fetch(`https://${domain}/.well-known/parnoir-verify.txt`, {
          redirect: 'follow',
          headers: { Accept: 'text/plain' }
        });
        if (res.ok) {
          const body = (await res.text()).trim();
          ok = body.startsWith('pn-verify-') || body.includes(String(row.public_name));
        }
      } catch {
        /* */
      }
    }
    if (!ok && row.status === 'listed') {
      await getDatabasePool().query(
        `UPDATE public_names SET status = 'proven', is_vanity = false, listed_at = NULL, updated_at = NOW()
         WHERE proof_type = 'dns' AND proof_subject = $1 AND pn_identifier = $2 AND status = 'listed'`,
        [domain, row.pn_identifier]
      );
    }
  }

  /** YouTube handle drift: if the channel handle changed, unlist the mismatched name. */
  static async recheckYoutubeHandle(
    googleAccessToken: string,
    channelId: string,
    expectedPublicName: string,
    pnIdentifier: string
  ): Promise<'ok' | 'drift'> {
    const url = `https://www.googleapis.com/youtube/v3/channels?part=snippet&id=${encodeURIComponent(channelId)}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${googleAccessToken}` }
    });
    if (!res.ok) return 'ok';
    const data = (await res.json()) as {
      items?: Array<{ snippet?: { customUrl?: string } }>;
    };
    const handle = normalizePublicName(data.items?.[0]?.snippet?.customUrl || '');
    if (!handle || handle === normalizePublicName(expectedPublicName)) return 'ok';
    const db = getDatabasePool();
    await db.query(
      `UPDATE public_names SET status = 'proven', is_vanity = false, listed_at = NULL, updated_at = NOW()
       WHERE proof_type = 'youtube' AND proof_subject = $1 AND pn_identifier = $2 AND status = 'listed'`,
      [channelId, normalizePnIdentifier(pnIdentifier)]
    );
    const taken = await heldBySkeleton(db, confusableSkeleton(handle));
    if (!taken) {
      await db.query(
        `UPDATE public_names SET public_name = $1, skeleton = $4, updated_at = NOW()
         WHERE proof_type = 'youtube' AND proof_subject = $2 AND pn_identifier = $3`,
        [handle, channelId, normalizePnIdentifier(pnIdentifier), confusableSkeleton(handle)]
      );
    }
    return 'drift';
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
