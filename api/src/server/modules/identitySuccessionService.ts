/**
 * Network succession: predecessor pN identifiers are revoked for OAuth, storage binding, etc.
 * In-memory cache mirrors DB for synchronous checks (e.g. PNOAuthService.validateAccessToken).
 */

import { getDatabasePool } from '../utils/database';

const revokedPnCache = new Set<string>();
const revokedDidCache = new Set<string>();
const successorByPredecessorPn = new Map<string, string>();
const effectiveAtByPredecessorPn = new Map<string, string>();

function normalizePn(pn: string): string {
  const t = pn.trim();
  return t.startsWith('pn-') ? t : `pn-${t}`;
}

export function syncRevocationFromRow(
  predecessorPn: string,
  successorPn: string,
  predecessorDid?: string | null,
  effectiveAtIso?: string
): void {
  const p = normalizePn(predecessorPn);
  const s = normalizePn(successorPn);
  revokedPnCache.add(p);
  successorByPredecessorPn.set(p, s);
  if (effectiveAtIso) effectiveAtByPredecessorPn.set(p, effectiveAtIso);
  if (predecessorDid) revokedDidCache.add(predecessorDid);
}

export async function warmIdentitySuccessionCache(): Promise<void> {
  const db = getDatabasePool();
  const r = await db.query(
    `SELECT predecessor_pn_identifier, successor_pn_identifier, predecessor_did, effective_at
     FROM pn_identity_succession`
  );
  revokedPnCache.clear();
  revokedDidCache.clear();
  successorByPredecessorPn.clear();
  effectiveAtByPredecessorPn.clear();
  for (const row of r.rows) {
    const eff = row.effective_at ? new Date(row.effective_at).toISOString() : undefined;
    syncRevocationFromRow(
      row.predecessor_pn_identifier,
      row.successor_pn_identifier,
      row.predecessor_did,
      eff
    );
  }
}

export function isPnRevokedForNetwork(pn?: string | null): boolean {
  if (!pn || typeof pn !== 'string') return false;
  return revokedPnCache.has(normalizePn(pn));
}

export function isDidRevokedForNetwork(did?: string | null): boolean {
  if (!did) return false;
  return revokedDidCache.has(did);
}

export async function getSuccessorPublicInfo(pnIdentifier: string): Promise<{
  revoked: boolean;
  successorPnIdentifier?: string;
  effectiveAt?: string;
}> {
  const n = normalizePn(pnIdentifier);
  if (!isPnRevokedForNetwork(n)) {
    return { revoked: false };
  }
  let successor = successorByPredecessorPn.get(n);
  let effectiveAt = effectiveAtByPredecessorPn.get(n);
  if (!successor || !effectiveAt) {
    const db = getDatabasePool();
    const r = await db.query(
      `SELECT successor_pn_identifier, effective_at FROM pn_identity_succession WHERE predecessor_pn_identifier = $1`,
      [n]
    );
    if (r.rows.length === 0) {
      return { revoked: false };
    }
    const rowSucc = String(r.rows[0].successor_pn_identifier ?? '');
    const rowEff = r.rows[0].effective_at ? new Date(r.rows[0].effective_at as Date).toISOString() : new Date().toISOString();
    successor = rowSucc;
    effectiveAt = rowEff;
    syncRevocationFromRow(n, rowSucc, null, rowEff);
  }
  if (!successor || !effectiveAt) {
    return { revoked: false };
  }
  return {
    revoked: true,
    successorPnIdentifier: successor,
    effectiveAt
  };
}

export async function registerSuccession(params: {
  predecessorPnIdentifier: string;
  successorPnIdentifier: string;
  predecessorDid?: string;
  successorDid?: string;
  migrationId?: string;
  reason?: string;
  migrateBindings?: boolean;
}): Promise<void> {
  const pred = normalizePn(params.predecessorPnIdentifier);
  const succ = normalizePn(params.successorPnIdentifier);
  if (pred === succ) {
    throw Object.assign(new Error('predecessor and successor must differ'), { code: 'INVALID_SUCCESSION' });
  }

  const db = getDatabasePool();
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO pn_identity_succession (
        predecessor_pn_identifier, successor_pn_identifier, predecessor_did, successor_did, migration_id, reason
      ) VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        pred,
        succ,
        params.predecessorDid ?? null,
        params.successorDid ?? null,
        params.migrationId ?? null,
        (params.reason || 'recovery').slice(0, 64)
      ]
    );

    await client.query(`DELETE FROM oauth_refresh_tokens WHERE pn_identifier = $1`, [pred]);

    if (params.migrateBindings !== false) {
      await client.query(`UPDATE api_keys SET pn_id = $2 WHERE pn_id = $1`, [pred, succ]);
      await client.query(`UPDATE storage_credentials SET identity_id = $2 WHERE identity_id = $1`, [pred, succ]);
      await client.query(
        `UPDATE user_profiles SET pn_identifier = $2 WHERE pn_identifier = $1
         AND NOT EXISTS (SELECT 1 FROM user_profiles up2 WHERE up2.pn_identifier = $2)`,
        [pred, succ]
      );
      await client.query(`DELETE FROM user_profiles WHERE pn_identifier = $1`, [pred]);
      if (params.predecessorDid && params.successorDid) {
        await client.query(`UPDATE feeds SET creator_did = $2 WHERE creator_did = $1`, [
          params.predecessorDid,
          params.successorDid
        ]);
      }
      await client.query(`UPDATE aggregator_media SET pn_identifier = $2 WHERE pn_identifier = $1`, [pred, succ]);
      await client.query(`UPDATE aggregator_thoughts SET pn_identifier = $2 WHERE pn_identifier = $1`, [pred, succ]);
      await client.query(`UPDATE aggregator_collections SET pn_identifier = $2 WHERE pn_identifier = $1`, [pred, succ]);
      await client.query(`UPDATE device_tokens SET pn_identifier = $2 WHERE pn_identifier = $1`, [pred, succ]);
      await client.query(
        `UPDATE pn_owned_assets SET root_pn_identifier = $2, updated_at = NOW() WHERE root_pn_identifier = $1`,
        [pred, succ]
      );
      await client.query(`UPDATE api_keys SET root_pn_id = $2 WHERE root_pn_id = $1`, [pred, succ]);
      await client.query(
        `UPDATE feeds SET owner_pn_identifier = $2 WHERE owner_pn_identifier = $1`,
        [pred, succ]
      );
      try {
        await client.query(
          `UPDATE pn_ipfs_manifest_pointers SET root_pn_identifier = $2, updated_at = NOW() WHERE root_pn_identifier = $1`,
          [pred, succ]
        );
      } catch {
        /* table may be missing on older DBs */
      }
    }

    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  const eff = new Date().toISOString();
  syncRevocationFromRow(pred, succ, params.predecessorDid ?? null, eff);
}
