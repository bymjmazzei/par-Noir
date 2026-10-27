/**
 * Off-device recovery failsafe: key hash + recovery envelope for key-initiated Shamir start.
 * Stored in Postgres so unlock can resolve without the owner's browser session or .pn file.
 */

import { getDatabasePool } from '../utils/database';
import type { KeyRecoveryEnvelope, RecoveryEnvelope } from '@par-noir/recovery-crypto';

export type RecoveryFailsafeMode = 'key_only' | 'custodians';

export interface RecoveryFailsafeRecord {
  pnIdentifier: string;
  keyHash: string;
  publicKey: string;
  /** Custodian (Shamir master) envelope; null when registered key-only from a .pn without one. */
  envelope: RecoveryEnvelope | null;
  /** Sealed to the recovery key itself; present only in key-only mode. */
  keyEnvelope: KeyRecoveryEnvelope | null;
  /** Peppered digest of the owner-Drive release proof; release requires reading it back from Drive. */
  driveProofDigest: string | null;
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
  await db.query(`ALTER TABLE pn_recovery_failsafe ADD COLUMN IF NOT EXISTS drive_proof_digest TEXT`);
  await db.query(`ALTER TABLE pn_recovery_failsafe ADD COLUMN IF NOT EXISTS key_envelope_json TEXT`);
  // A used recovery key is cleared to NULL; the unique index allows many NULLs but not many ''.
  await db.query(`ALTER TABLE pn_recovery_failsafe ALTER COLUMN key_hash DROP NOT NULL`);
  ensured = true;
}

/** Register a new recovery key. A key without keyEnvelope starts custodian recovery only. */
export async function upsertRecoveryFailsafe(params: {
  pnIdentifier: string;
  keyHash: string;
  publicKey: string;
  envelope: RecoveryEnvelope | null;
  keyEnvelope?: KeyRecoveryEnvelope | null;
  driveProofDigest?: string;
}): Promise<void> {
  await ensureTable();
  const db = getDatabasePool();
  const pn = normalizePn(params.pnIdentifier);
  await db.query(
    `INSERT INTO pn_recovery_failsafe (pn_identifier, key_hash, public_key, envelope_json, key_envelope_json, drive_proof_digest, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     ON CONFLICT (pn_identifier) DO UPDATE SET
       key_hash = EXCLUDED.key_hash,
       public_key = EXCLUDED.public_key,
       envelope_json = EXCLUDED.envelope_json,
       key_envelope_json = EXCLUDED.key_envelope_json,
       drive_proof_digest = COALESCE(EXCLUDED.drive_proof_digest, pn_recovery_failsafe.drive_proof_digest),
       created_at = NOW()`,
    [
      pn,
      params.keyHash,
      params.publicKey,
      JSON.stringify(params.envelope ?? null),
      params.keyEnvelope ? JSON.stringify(params.keyEnvelope) : null,
      params.driveProofDigest ?? null,
    ]
  );
}

/** Custodian setup moves the pN to custodian-only recovery: the key no longer opens anything. */
export async function clearKeyEnvelope(pnIdentifier: string): Promise<void> {
  await ensureTable();
  await getDatabasePool().query(
    `UPDATE pn_recovery_failsafe SET key_envelope_json = NULL WHERE pn_identifier = $1`,
    [normalizePn(pnIdentifier)]
  );
}

/** A key-only recovery key works once: drop it and its envelope after release. */
export async function consumeKeyEnvelope(pnIdentifier: string): Promise<void> {
  await ensureTable();
  await getDatabasePool().query(
    `UPDATE pn_recovery_failsafe SET key_envelope_json = NULL, key_hash = NULL WHERE pn_identifier = $1`,
    [normalizePn(pnIdentifier)]
  );
}

/** Persist/replace envelope only (keep existing key hash if present). */
export async function upsertRecoveryEnvelopeOnly(params: {
  pnIdentifier: string;
  publicKey: string;
  envelope: RecoveryEnvelope;
  driveProofDigest?: string;
}): Promise<void> {
  await ensureTable();
  const db = getDatabasePool();
  const pn = normalizePn(params.pnIdentifier);
  const existing = await db.query(
    `SELECT key_hash FROM pn_recovery_failsafe WHERE pn_identifier = $1`,
    [pn]
  );
  const keyHash = existing.rows[0]?.key_hash || null;
  await db.query(
    `INSERT INTO pn_recovery_failsafe (pn_identifier, key_hash, public_key, envelope_json, drive_proof_digest, created_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (pn_identifier) DO UPDATE SET
       public_key = EXCLUDED.public_key,
       envelope_json = EXCLUDED.envelope_json,
       drive_proof_digest = COALESCE(EXCLUDED.drive_proof_digest, pn_recovery_failsafe.drive_proof_digest),
       created_at = NOW()`,
    [pn, keyHash, params.publicKey, JSON.stringify(params.envelope), params.driveProofDigest ?? null]
  );
}

export async function getFailsafeStatus(pnIdentifier: string): Promise<{
  hasKey: boolean;
  hasEnvelope: boolean;
  hasDriveProof: boolean;
  mode: RecoveryFailsafeMode | null;
  createdAt?: string;
}> {
  await ensureTable();
  const db = getDatabasePool();
  const pn = normalizePn(pnIdentifier);
  const r = await db.query(
    `SELECT key_hash, envelope_json, key_envelope_json, drive_proof_digest, created_at FROM pn_recovery_failsafe WHERE pn_identifier = $1`,
    [pn]
  );
  if (!r.rows[0]) return { hasKey: false, hasEnvelope: false, hasDriveProof: false, mode: null };
  const row = r.rows[0];
  const hasKey = Boolean(row.key_hash);
  return {
    hasKey,
    hasEnvelope: Boolean(row.envelope_json) && row.envelope_json !== 'null',
    hasDriveProof: Boolean(row.drive_proof_digest),
    mode: !hasKey ? null : row.key_envelope_json ? 'key_only' : 'custodians',
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
  if (!hash) return null;
  if (params.pnIdentifier) {
    r = await db.query(
      `SELECT pn_identifier, key_hash, public_key, envelope_json, key_envelope_json, drive_proof_digest, created_at
       FROM pn_recovery_failsafe
       WHERE pn_identifier = $1 AND key_hash = $2`,
      [normalizePn(params.pnIdentifier), hash]
    );
  } else {
    r = await db.query(
      `SELECT pn_identifier, key_hash, public_key, envelope_json, key_envelope_json, drive_proof_digest, created_at
       FROM pn_recovery_failsafe
       WHERE key_hash = $1`,
      [hash]
    );
  }
  const row = r.rows[0];
  if (!row || !row.key_hash) return null;
  let envelope: RecoveryEnvelope | null;
  let keyEnvelope: KeyRecoveryEnvelope | null;
  try {
    envelope = row.envelope_json ? (JSON.parse(row.envelope_json) as RecoveryEnvelope | null) : null;
    keyEnvelope = row.key_envelope_json ? (JSON.parse(row.key_envelope_json) as KeyRecoveryEnvelope) : null;
  } catch {
    return null;
  }
  if (!envelope && !keyEnvelope) return null;
  return {
    pnIdentifier: row.pn_identifier,
    keyHash: row.key_hash,
    publicKey: row.public_key,
    envelope,
    keyEnvelope,
    driveProofDigest: row.drive_proof_digest || null,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
  };
}
