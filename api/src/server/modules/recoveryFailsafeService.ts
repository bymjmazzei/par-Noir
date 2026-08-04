/**
 * Off-device recovery failsafe: key hash + recovery envelope for key-initiated Shamir start.
 * Stored in Postgres so unlock can resolve without the owner's browser session or .pn file.
 */

import { getDatabasePool } from '../utils/database';
import type { RecoveryEnvelope } from '@par-noir/recovery-crypto';

export interface RecoveryFailsafeRecord {
  pnIdentifier: string;
  keyHash: string;
  publicKey: string;
  envelope: RecoveryEnvelope;
  createdAt: string;
}

function normalizePn(pn: string): string {
  const t = pn.trim();
  return t.startsWith('pn-') ? t : `pn-${t}`;
}

let ensured = false;

async function ensureTable(): Promise<void> {
  if (ensured) return;
  const db = getDatabasePool();
  await db.query(`
    CREATE TABLE IF NOT EXISTS pn_recovery_failsafe (
      pn_identifier TEXT PRIMARY KEY,
      key_hash TEXT NOT NULL,
      public_key TEXT NOT NULL,
      envelope_json TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS pn_recovery_failsafe_key_hash_idx
      ON pn_recovery_failsafe (key_hash)
  `);
  ensured = true;
}

export async function upsertRecoveryFailsafe(params: {
  pnIdentifier: string;
  keyHash: string;
  publicKey: string;
  envelope: RecoveryEnvelope;
}): Promise<void> {
  await ensureTable();
  const db = getDatabasePool();
  const pn = normalizePn(params.pnIdentifier);
  await db.query(
    `INSERT INTO pn_recovery_failsafe (pn_identifier, key_hash, public_key, envelope_json, created_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (pn_identifier) DO UPDATE SET
       key_hash = EXCLUDED.key_hash,
       public_key = EXCLUDED.public_key,
       envelope_json = EXCLUDED.envelope_json,
       created_at = NOW()`,
    [pn, params.keyHash, params.publicKey, JSON.stringify(params.envelope)]
  );
}

/** Persist/replace envelope only (keep existing key hash if present). */
export async function upsertRecoveryEnvelopeOnly(params: {
  pnIdentifier: string;
  publicKey: string;
  envelope: RecoveryEnvelope;
}): Promise<void> {
  await ensureTable();
  const db = getDatabasePool();
  const pn = normalizePn(params.pnIdentifier);
  const existing = await db.query(
    `SELECT key_hash FROM pn_recovery_failsafe WHERE pn_identifier = $1`,
    [pn]
  );
  const keyHash = existing.rows[0]?.key_hash || '';
  await db.query(
    `INSERT INTO pn_recovery_failsafe (pn_identifier, key_hash, public_key, envelope_json, created_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (pn_identifier) DO UPDATE SET
       public_key = EXCLUDED.public_key,
       envelope_json = EXCLUDED.envelope_json,
       created_at = NOW()`,
    [pn, keyHash, params.publicKey, JSON.stringify(params.envelope)]
  );
}

export async function getFailsafeStatus(pnIdentifier: string): Promise<{
  hasKey: boolean;
  hasEnvelope: boolean;
  createdAt?: string;
}> {
  await ensureTable();
  const db = getDatabasePool();
  const pn = normalizePn(pnIdentifier);
  const r = await db.query(
    `SELECT key_hash, envelope_json, created_at FROM pn_recovery_failsafe WHERE pn_identifier = $1`,
    [pn]
  );
  if (!r.rows[0]) return { hasKey: false, hasEnvelope: false };
  const row = r.rows[0];
  return {
    hasKey: Boolean(row.key_hash),
    hasEnvelope: Boolean(row.envelope_json),
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : undefined,
  };
}

export async function resolveRecoveryFailsafe(params: {
  keyHash: string;
  pnIdentifier?: string;
}): Promise<RecoveryFailsafeRecord | null> {
  await ensureTable();
  const db = getDatabasePool();
  const hash = params.keyHash.trim();
  let r;
  if (params.pnIdentifier) {
    r = await db.query(
      `SELECT pn_identifier, key_hash, public_key, envelope_json, created_at
       FROM pn_recovery_failsafe
       WHERE pn_identifier = $1 AND key_hash = $2`,
      [normalizePn(params.pnIdentifier), hash]
    );
  } else {
    r = await db.query(
      `SELECT pn_identifier, key_hash, public_key, envelope_json, created_at
       FROM pn_recovery_failsafe
       WHERE key_hash = $1`,
      [hash]
    );
  }
  const row = r.rows[0];
  if (!row || !row.key_hash || !row.envelope_json) return null;
  let envelope: RecoveryEnvelope;
  try {
    envelope = JSON.parse(row.envelope_json) as RecoveryEnvelope;
  } catch {
    return null;
  }
  return {
    pnIdentifier: row.pn_identifier,
    keyHash: row.key_hash,
    publicKey: row.public_key,
    envelope,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
  };
}
