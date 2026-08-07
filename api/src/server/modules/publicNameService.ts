/**
 * Public name directory: DNS / YouTube proofs, exact-match search listing, vanity slug.
 */

import { createHash, randomBytes } from 'crypto';
import { promises as dns } from 'dns';
import { parse as parseDomain } from 'tldts';
import { getDatabasePool } from '../utils/database';

export type PublicNameProofType = 'dns' | 'youtube';
export type PublicNameStatus = 'pending' | 'proven' | 'listed' | 'revoked';

export interface PublicNameRow {
  publicName: string;
  pnIdentifier: string;
  proofType: PublicNameProofType;
  proofSubject: string;
  status: PublicNameStatus;
  isVanity: boolean;
  listedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

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

export function normalizePublicName(raw: string): string {
  return String(raw || '')
    .trim()
    .replace(/^@+/, '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '');
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

function mapRow(row: Record<string, unknown>): PublicNameRow {
  return {
    publicName: String(row.public_name),
    pnIdentifier: String(row.pn_identifier),
    proofType: row.proof_type as PublicNameProofType,
    proofSubject: String(row.proof_subject),
    status: row.status as PublicNameStatus,
    isVanity: Boolean(row.is_vanity),
    listedAt: row.listed_at ? new Date(String(row.listed_at)).toISOString() : null,
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

export class PublicNameService {
  static async listMine(pnIdentifier: string): Promise<PublicNameRow[]> {
    const pn = normalizePnIdentifier(pnIdentifier);
    const db = getDatabasePool();
    const result = await db.query(
      `SELECT * FROM public_names
       WHERE pn_identifier = $1 AND status IN ('pending', 'proven', 'listed')
       ORDER BY created_at ASC`,
      [pn]
    );
    // Soft DNS re-check for listed domain proofs (demote if token/file gone)
    for (const row of result.rows) {
      if (row.proof_type === 'dns' && row.status === 'listed') {
        try {
          await this.recheckDnsRow(row);
        } catch {
          /* ignore recheck failures */
        }
      }
    }
    const refreshed = await db.query(
      `SELECT * FROM public_names
       WHERE pn_identifier = $1 AND status IN ('pending', 'proven', 'listed')
       ORDER BY created_at ASC`,
      [pn]
    );
    return refreshed.rows.map(mapRow);
  }

  static async getByPnListed(pnIdentifier: string): Promise<PublicNameRow[]> {
    const pn = normalizePnIdentifier(pnIdentifier);
    const db = getDatabasePool();
    const result = await db.query(
      `SELECT * FROM public_names
       WHERE pn_identifier = $1 AND status = 'listed'
       ORDER BY is_vanity DESC, listed_at ASC NULLS LAST`,
      [pn]
    );
    return result.rows.map(mapRow);
  }

  static async searchListedExact(query: string): Promise<PublicNameRow | null> {
    const name = normalizePublicName(query);
    if (!name) return null;
    const db = getDatabasePool();
    const result = await db.query(
      `SELECT * FROM public_names WHERE status = 'listed' AND public_name = $1 LIMIT 1`,
      [name]
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  static async resolveVanity(slug: string): Promise<PublicNameRow | null> {
    const name = normalizePublicName(slug);
    if (!name) return null;
    const db = getDatabasePool();
    const result = await db.query(
      `SELECT * FROM public_names
       WHERE status = 'listed' AND is_vanity = true AND public_name = $1
       LIMIT 1`,
      [name]
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

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
    if (!checkPublicNameRateLimit(pn, 'dns_start')) {
      const err = new Error('RATE_LIMIT');
      (err as { code?: string }).code = 'RATE_LIMIT';
      throw err;
    }
    const domain = normalizeDomainInput(domainRaw);
    const candidateName = domainToCandidateName(domain);
    if (!candidateName) {
      const err = new Error('INVALID_DOMAIN');
      (err as { code?: string }).code = 'INVALID_DOMAIN';
      throw err;
    }
    const parsed = parseDomain(domain, { allowPrivateDomains: true });
    if (parsed.isIp || !parsed.hostname) {
      const err = new Error('INVALID_DOMAIN');
      (err as { code?: string }).code = 'INVALID_DOMAIN';
      throw err;
    }

    const token = `pn-verify-${randomBytes(16).toString('hex')}`;
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const db = getDatabasePool();

    const existing = await db.query(
      `SELECT pn_identifier, status FROM public_names
       WHERE proof_type = 'dns' AND proof_subject = $1`,
      [domain]
    );
    if (existing.rows[0]) {
      const owner = normalizePnIdentifier(String(existing.rows[0].pn_identifier));
      const st = String(existing.rows[0].status);
      if (owner !== pn && ['pending', 'proven', 'listed'].includes(st)) {
        const err = new Error('PROOF_SUBJECT_TAKEN');
        (err as { code?: string }).code = 'PROOF_SUBJECT_TAKEN';
        throw err;
      }
      await db.query(
        `UPDATE public_names SET
           public_name = $1,
           pn_identifier = $2,
           status = 'pending',
           verify_token_hash = $3,
           verify_token_expires_at = $4,
           is_vanity = false,
           listed_at = NULL,
           updated_at = NOW()
         WHERE proof_type = 'dns' AND proof_subject = $5`,
        [candidateName, pn, tokenHash, expiresAt.toISOString(), domain]
      );
    } else {
      await db.query(
        `INSERT INTO public_names (
           public_name, pn_identifier, proof_type, proof_subject, status,
           verify_token_hash, verify_token_expires_at, is_vanity, updated_at
         ) VALUES ($1, $2, 'dns', $3, 'pending', $4, $5, false, NOW())`,
        [candidateName, pn, domain, tokenHash, expiresAt.toISOString()]
      );
    }

    return {
      token,
      domain,
      dnsName: `_parnoir.${domain}`,
      wellKnownUrl: `https://${domain}/.well-known/parnoir-verify.txt`,
      candidateName,
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
        headers: { Accept: 'text/plain' },
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

  static async completeDnsVerify(pnIdentifier: string, domainRaw: string): Promise<PublicNameRow> {
    const pn = normalizePnIdentifier(pnIdentifier);
    if (!checkPublicNameRateLimit(pn, 'dns_verify')) {
      const err = new Error('RATE_LIMIT');
      (err as { code?: string }).code = 'RATE_LIMIT';
      throw err;
    }
    const domain = normalizeDomainInput(domainRaw);
    const db = getDatabasePool();
    const result = await db.query(
      `SELECT * FROM public_names
       WHERE proof_type = 'dns' AND proof_subject = $1 AND pn_identifier = $2`,
      [domain, pn]
    );
    const row = result.rows[0];
    if (!row) {
      const err = new Error('NOT_FOUND');
      (err as { code?: string }).code = 'NOT_FOUND';
      throw err;
    }
    if (row.verify_token_expires_at && new Date(row.verify_token_expires_at).getTime() < Date.now()) {
      const err = new Error('TOKEN_EXPIRED');
      (err as { code?: string }).code = 'TOKEN_EXPIRED';
      throw err;
    }
    const tokenHash = String(row.verify_token_hash || '');
    const ok = await this.verifyDnsProof(domain, tokenHash);
    if (!ok) {
      const err = new Error('DNS_VERIFY_FAILED');
      (err as { code?: string }).code = 'DNS_VERIFY_FAILED';
      throw err;
    }
    const updated = await db.query(
      `UPDATE public_names SET
         status = 'proven',
         verify_token_hash = NULL,
         verify_token_expires_at = NULL,
         updated_at = NOW()
       WHERE proof_type = 'dns' AND proof_subject = $1 AND pn_identifier = $2
       RETURNING *`,
      [domain, pn]
    );
    return mapRow(updated.rows[0]);
  }

  static async completeYoutube(
    pnIdentifier: string,
    googleAccessToken: string
  ): Promise<PublicNameRow> {
    const pn = normalizePnIdentifier(pnIdentifier);
    if (!checkPublicNameRateLimit(pn, 'youtube_complete')) {
      const err = new Error('RATE_LIMIT');
      (err as { code?: string }).code = 'RATE_LIMIT';
      throw err;
    }

    const url =
      'https://www.googleapis.com/youtube/v3/channels?part=snippet,status&mine=true';
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${googleAccessToken}` },
    });
    if (!res.ok) {
      const err = new Error('YOUTUBE_API_ERROR');
      (err as { code?: string }).code = 'YOUTUBE_API_ERROR';
      throw err;
    }
    const data = (await res.json()) as {
      items?: Array<{
        id?: string;
        snippet?: { customUrl?: string; title?: string; publishedAt?: string };
        status?: { isLinked?: boolean; longUploadsStatus?: string };
      }>;
    };
    const channel = data.items?.[0];
    if (!channel?.id) {
      const err = new Error('NO_YOUTUBE_CHANNEL');
      (err as { code?: string }).code = 'NO_YOUTUBE_CHANNEL';
      throw err;
    }
    const customUrl = String(channel.snippet?.customUrl || '').trim();
    const handle = normalizePublicName(customUrl);
    if (!handle || handle.length < 2) {
      const err = new Error('NO_YOUTUBE_HANDLE');
      (err as { code?: string }).code = 'NO_YOUTUBE_HANDLE';
      throw err;
    }
    // Verification bar: require custom URL/handle (YouTube checkmark is not reliably exposed).
    // Channel must be linked (Google account linked to channel).
    if (channel.status && channel.status.isLinked === false) {
      const err = new Error('YOUTUBE_NOT_VERIFIED');
      (err as { code?: string }).code = 'YOUTUBE_NOT_VERIFIED';
      throw err;
    }

    const channelId = channel.id;
    const db = getDatabasePool();

    const takenSubject = await db.query(
      `SELECT pn_identifier, status FROM public_names
       WHERE proof_type = 'youtube' AND proof_subject = $1`,
      [channelId]
    );
    if (
      takenSubject.rows[0] &&
      normalizePnIdentifier(takenSubject.rows[0].pn_identifier) !== pn &&
      ['proven', 'listed', 'pending'].includes(String(takenSubject.rows[0].status))
    ) {
      const err = new Error('PROOF_SUBJECT_TAKEN');
      (err as { code?: string }).code = 'PROOF_SUBJECT_TAKEN';
      throw err;
    }

    const upsert = await db.query(
      `INSERT INTO public_names (
         public_name, pn_identifier, proof_type, proof_subject, status, is_vanity, updated_at
       ) VALUES ($1, $2, 'youtube', $3, 'proven', false, NOW())
       ON CONFLICT (proof_type, proof_subject) DO UPDATE SET
         public_name = EXCLUDED.public_name,
         pn_identifier = EXCLUDED.pn_identifier,
         status = CASE
           WHEN public_names.status = 'listed' AND public_names.pn_identifier = EXCLUDED.pn_identifier
             THEN 'listed'
           ELSE 'proven'
         END,
         is_vanity = CASE
           WHEN public_names.status = 'listed' AND public_names.pn_identifier = EXCLUDED.pn_identifier
             THEN public_names.is_vanity
           ELSE false
         END,
         updated_at = NOW()
       RETURNING *`,
      [handle, pn, channelId]
    );
    return mapRow(upsert.rows[0]);
  }

  static async listName(pnIdentifier: string, publicNameRaw: string): Promise<PublicNameRow> {
    const pn = normalizePnIdentifier(pnIdentifier);
    const name = normalizePublicName(publicNameRaw);
    const db = getDatabasePool();

    const conflict = await db.query(
      `SELECT pn_identifier FROM public_names
       WHERE public_name = $1 AND status = 'listed' AND pn_identifier <> $2
       LIMIT 1`,
      [name, pn]
    );
    if (conflict.rows[0]) {
      const err = new Error('NAME_TAKEN');
      (err as { code?: string }).code = 'NAME_TAKEN';
      throw err;
    }

    const mine = await db.query(
      `SELECT * FROM public_names
       WHERE pn_identifier = $1 AND public_name = $2 AND status IN ('proven', 'listed')
       LIMIT 1`,
      [pn, name]
    );
    if (!mine.rows[0]) {
      const err = new Error('NOT_PROVEN');
      (err as { code?: string }).code = 'NOT_PROVEN';
      throw err;
    }

    const updated = await db.query(
      `UPDATE public_names SET status = 'listed', listed_at = COALESCE(listed_at, NOW()), updated_at = NOW()
       WHERE pn_identifier = $1 AND public_name = $2 AND status IN ('proven', 'listed')
       RETURNING *`,
      [pn, name]
    );
    return mapRow(updated.rows[0]);
  }

  static async unlistName(pnIdentifier: string, publicNameRaw: string): Promise<PublicNameRow> {
    const pn = normalizePnIdentifier(pnIdentifier);
    const name = normalizePublicName(publicNameRaw);
    const db = getDatabasePool();
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
    if (!updated.rows[0]) {
      const err = new Error('NOT_FOUND');
      (err as { code?: string }).code = 'NOT_FOUND';
      throw err;
    }
    return mapRow(updated.rows[0]);
  }

  static async setVanity(pnIdentifier: string, publicNameRaw: string): Promise<PublicNameRow> {
    const pn = normalizePnIdentifier(pnIdentifier);
    const name = normalizePublicName(publicNameRaw);
    const db = getDatabasePool();
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const mine = await client.query(
        `SELECT * FROM public_names WHERE pn_identifier = $1 AND public_name = $2 AND status = 'listed'`,
        [pn, name]
      );
      if (!mine.rows[0]) {
        const err = new Error('NOT_LISTED');
        (err as { code?: string }).code = 'NOT_LISTED';
        throw err;
      }
      await client.query(
        `UPDATE public_names SET is_vanity = false, updated_at = NOW()
         WHERE pn_identifier = $1 AND is_vanity = true`,
        [pn]
      );
      const updated = await client.query(
        `UPDATE public_names SET is_vanity = true, updated_at = NOW()
         WHERE pn_identifier = $1 AND public_name = $2
         RETURNING *`,
        [pn, name]
      );
      await client.query('COMMIT');
      return mapRow(updated.rows[0]);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  static async clearVanity(pnIdentifier: string): Promise<void> {
    const pn = normalizePnIdentifier(pnIdentifier);
    const db = getDatabasePool();
    await db.query(
      `UPDATE public_names SET is_vanity = false, updated_at = NOW()
       WHERE pn_identifier = $1 AND is_vanity = true`,
      [pn]
    );
  }

  /** Re-check DNS proofs for listed/proven rows; demote if proof missing. */
  static async recheckDnsRow(row: {
    public_name: string;
    pn_identifier: string;
    proof_subject: string;
    status: string;
  }): Promise<void> {
    if (row.status !== 'listed' && row.status !== 'proven') return;
    const domain = String(row.proof_subject);
    // For re-check after proven, we need a fresh challenge OR store last-good marker.
    // v1: attempt well-known file containing public_name + pn binding line is not required;
    // instead re-issue is user-driven. Soft re-check: fetch TXT any pn-verify-* or well-known presence.
    // Practical approach: if listed, require well-known or TXT still containing something starting with pn-verify-
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
          headers: { Accept: 'text/plain' },
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
      const db = getDatabasePool();
      await db.query(
        `UPDATE public_names SET status = 'proven', is_vanity = false, listed_at = NULL, updated_at = NOW()
         WHERE proof_type = 'dns' AND proof_subject = $1 AND pn_identifier = $2 AND status = 'listed'`,
        [domain, row.pn_identifier]
      );
    }
  }

  /** YouTube handle drift: if channel handle changed, unlist mismatched name. */
  static async recheckYoutubeHandle(
    googleAccessToken: string,
    channelId: string,
    expectedPublicName: string,
    pnIdentifier: string
  ): Promise<'ok' | 'drift'> {
    const url = `https://www.googleapis.com/youtube/v3/channels?part=snippet&id=${encodeURIComponent(channelId)}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${googleAccessToken}` },
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
    // Update proven row to new handle if free
    const taken = await db.query(
      `SELECT 1 FROM public_names WHERE public_name = $1 AND status = 'listed' LIMIT 1`,
      [handle]
    );
    if (!taken.rows[0]) {
      await db.query(
        `UPDATE public_names SET public_name = $1, updated_at = NOW()
         WHERE proof_type = 'youtube' AND proof_subject = $2 AND pn_identifier = $3`,
        [handle, channelId, normalizePnIdentifier(pnIdentifier)]
      );
    }
    return 'drift';
  }
}
