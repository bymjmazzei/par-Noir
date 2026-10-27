/**
 * Custodian-held recovery relay. The server keeps a routing record (custodian roster,
 * epochs, requests) and relays shares that are already sealed to an ML-KEM key.
 * It never holds a cloud token or a plaintext share. pN identifiers are stored only
 * as peppered hashes so a DB dump is not a clear custodian graph.
 */

import { createHash, timingSafeEqual } from 'crypto';
import {
  normalizeCustodianStatus,
  recoveryMeetsQuorumRule,
  type RecoveryQuorumResult,
} from '@par-noir/recovery-crypto';
import { getDatabasePool } from '../utils/database';

/** key_recovery: recovery key + Drive proof + wait; no custodians (pN with no custodian epoch). */
export type RecoveryRequestType = 'identity_recovery' | 'device_registry_reset' | 'key_recovery';
export type RecoveryRequestStatus =
  | 'pending'
  | 'ready'
  | 'released'
  | 'completed'
  | 'cancelled'
  | 'expired';
export type RecoveryCustodianStatus = 'invited' | 'accepted' | 'revoked';

export const ACTIVE_REQUEST_STATUSES: readonly RecoveryRequestStatus[] = ['pending', 'ready', 'released'];

export interface RecoveryOwnerRow {
  ownerHash: string;
  ownerPublicKey: string;
  epoch: number;
  threshold: number;
  totalShares: number;
  updatedAt: string;
}

export interface RecoveryCustodianRow {
  ownerHash: string;
  custodianId: string;
  ownerPublicKey: string;
  custodianPnHash: string | null;
  name: string;
  custodianType: string;
  shareIndex: number;
  custodianshipCredential: string;
  unrevokable: boolean;
  status: RecoveryCustodianStatus;
  mlKemPublicKey: string | null;
  /** Epoch of the share the custodian has stored on their own Drive (acked custody). */
  custodyEpoch: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface RecoveryApprovalRecord {
  custodianId: string;
  shareIndex: number;
  approvedAt: string;
}

export interface RecoveryRequestRow {
  requestId: string;
  requestType: RecoveryRequestType;
  ownerHash: string;
  ownerPublicKey: string;
  temporaryPublicKey: string | null;
  threshold: number;
  epoch: number;
  claimantContact: string;
  status: RecoveryRequestStatus;
  approvals: RecoveryApprovalRecord[];
  releaseAfter: string;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface RecoveryDeliveryRow {
  id: string;
  kind: 'custody' | 'release';
  ownerHash: string;
  custodianId: string;
  requestId: string | null;
  epoch: number;
  sealedShare: string;
  createdAt: string;
}

export interface RecoveryRelayStore {
  getOwner(ownerHash: string): Promise<RecoveryOwnerRow | null>;
  upsertOwner(row: RecoveryOwnerRow): Promise<void>;
  listCustodians(ownerHash: string): Promise<RecoveryCustodianRow[]>;
  getCustodian(ownerHash: string, custodianId: string): Promise<RecoveryCustodianRow | null>;
  listCustodiansByCustodianPn(custodianPnHash: string): Promise<RecoveryCustodianRow[]>;
  upsertCustodian(row: RecoveryCustodianRow): Promise<void>;
  getRequest(requestId: string): Promise<RecoveryRequestRow | null>;
  insertRequest(row: RecoveryRequestRow): Promise<void>;
  updateRequest(
    requestId: string,
    patch: Partial<Pick<RecoveryRequestRow, 'status' | 'approvals' | 'releaseAfter'>>
  ): Promise<void>;
  listRequestsForOwner(ownerHash: string): Promise<RecoveryRequestRow[]>;
  /** Replaces any unacked custody delivery for the same owner + custodian. */
  putCustodyDelivery(row: RecoveryDeliveryRow): Promise<void>;
  listCustodyDeliveries(ownerHash: string, custodianId: string): Promise<RecoveryDeliveryRow[]>;
  getDelivery(id: string): Promise<RecoveryDeliveryRow | null>;
  deleteDelivery(id: string): Promise<void>;
  deleteCustodyDeliveriesForOwner(ownerHash: string): Promise<void>;
  putReleaseDelivery(row: RecoveryDeliveryRow): Promise<void>;
  listReleaseDeliveries(requestId: string): Promise<RecoveryDeliveryRow[]>;
}

// ---------------------------------------------------------------------------
// Hashing (fail closed: no soft default pepper)
// ---------------------------------------------------------------------------

function recoveryPepper(): string {
  const pepper = process.env.RECOVERY_PEPPER?.trim();
  if (!pepper) {
    throw new Error('RECOVERY_PEPPER must be set');
  }
  return pepper;
}

function pepperedHash(domain: string, value: string): string {
  return createHash('sha256')
    .update(`parnoir-recovery-${domain}-v1:${recoveryPepper()}:${value}`, 'utf8')
    .digest('hex');
}

export function normalizeRecoveryPn(pn: string): string {
  const t = String(pn || '').trim();
  return t.startsWith('pn-') ? t : `pn-${t}`;
}

export function recoveryOwnerHash(pnIdentifier: string): string {
  return pepperedHash('owner', normalizeRecoveryPn(pnIdentifier));
}

export function recoveryCustodianPnHash(pnIdentifier: string): string {
  return pepperedHash('custodian', normalizeRecoveryPn(pnIdentifier));
}

/** Stored at register from the client's sha256(driveProof); never the proof itself. */
export function recoveryDriveProofDigest(driveProofHashHex: string): string {
  return pepperedHash('drive-proof', driveProofHashHex.trim().toLowerCase());
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/** Identity-recovery request ids are sha256(temporaryPublicKey) so approvals bind the key. */
export function recoveryRequestIdForKey(temporaryPublicKey: string): string {
  return sha256Hex(temporaryPublicKey.trim());
}

export function driveProofMatches(driveProof: string, storedDigest: string | null): boolean {
  if (!storedDigest || !driveProof) return false;
  const candidate = Buffer.from(recoveryDriveProofDigest(sha256Hex(driveProof.trim())), 'hex');
  const stored = Buffer.from(storedDigest, 'hex');
  return candidate.length === stored.length && timingSafeEqual(candidate, stored);
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export function recoveryReleaseDelayMs(): number {
  const hours = Number(process.env.RECOVERY_RELEASE_DELAY_HOURS ?? '24');
  return (Number.isFinite(hours) && hours >= 0 ? hours : 24) * 60 * 60 * 1000;
}

export function recoveryRequestTtlMs(): number {
  return 14 * 24 * 60 * 60 * 1000;
}

// ---------------------------------------------------------------------------
// Validation + rules
// ---------------------------------------------------------------------------

const ML_KEM_768_PUBLIC_KEY_BYTES = 1184;
const MAX_SEALED_SHARE_CHARS = 8192;

export function isMlKem768PublicKey(value: unknown): value is string {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    return Buffer.from(value.trim(), 'base64').length === ML_KEM_768_PUBLIC_KEY_BYTES;
  } catch {
    return false;
  }
}

/** Shape check only — the server cannot and must not open a sealed share. */
export function parseSealedSharePayload(raw: unknown, expectedIndex: number): string | null {
  let obj: unknown = raw;
  if (typeof raw === 'string') {
    if (raw.length > MAX_SEALED_SHARE_CHARS) return null;
    try {
      obj = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
  const s = obj as Record<string, unknown>;
  if (
    s.v !== 1
    || typeof s.alg !== 'string'
    || s.index !== expectedIndex
    || typeof s.kem !== 'string'
    || typeof s.iv !== 'string'
    || typeof s.ct !== 'string'
  ) {
    return null;
  }
  const serialized = JSON.stringify({ v: 1, alg: s.alg, index: s.index, kem: s.kem, iv: s.iv, ct: s.ct });
  return serialized.length <= MAX_SEALED_SHARE_CHARS ? serialized : null;
}

/** Custodians that count for a request: accepted, and holding the request's epoch share. */
export function eligibleCustodians(
  custodians: RecoveryCustodianRow[],
  epoch: number
): RecoveryCustodianRow[] {
  return custodians.filter(
    (c) => normalizeCustodianStatus(c.status) === 'accepted' && c.custodyEpoch === epoch
  );
}

export function evaluateRequestQuorum(
  request: Pick<RecoveryRequestRow, 'approvals' | 'threshold' | 'epoch'>,
  custodians: RecoveryCustodianRow[]
): RecoveryQuorumResult {
  const eligible = eligibleCustodians(custodians, request.epoch);
  const approvals = request.approvals.filter((a) =>
    eligible.some((c) => c.custodianId === a.custodianId && c.shareIndex === a.shareIndex)
  );
  return recoveryMeetsQuorumRule({
    approvals,
    custodians: eligible.map((c) => ({
      custodianId: c.custodianId,
      status: c.status,
      unrevokable: c.unrevokable,
    })),
    threshold: request.threshold,
  });
}

export function isRequestExpired(request: Pick<RecoveryRequestRow, 'expiresAt'>, now = Date.now()): boolean {
  return Date.parse(request.expiresAt) <= now;
}

/** Lazily mark an expired active request so every reader sees the same status. */
export async function refreshRequestExpiry(
  store: RecoveryRelayStore,
  request: RecoveryRequestRow,
  now = Date.now()
): Promise<RecoveryRequestRow> {
  if (ACTIVE_REQUEST_STATUSES.includes(request.status) && isRequestExpired(request, now)) {
    await store.updateRequest(request.requestId, { status: 'expired' });
    return { ...request, status: 'expired' };
  }
  return request;
}

export type ReleaseBlock =
  | 'request_not_found'
  | 'wrong_request_type'
  | 'request_not_ready'
  | 'release_delay_active'
  | 'request_expired'
  | 'request_cancelled';

export function releaseBlockReason(
  request: RecoveryRequestRow | null,
  quorum: RecoveryQuorumResult | null,
  now = Date.now()
): ReleaseBlock | null {
  if (!request) return 'request_not_found';
  if (request.requestType !== 'identity_recovery' && request.requestType !== 'key_recovery') {
    return 'wrong_request_type';
  }
  if (request.status === 'cancelled') return 'request_cancelled';
  if (request.status === 'expired' || isRequestExpired(request, now)) return 'request_expired';
  if (request.requestType === 'key_recovery') {
    if (request.status !== 'pending' && request.status !== 'ready') return 'request_not_ready';
  } else if (!quorum?.ready || (request.status !== 'ready' && request.status !== 'released')) {
    return 'request_not_ready';
  }
  if (Date.parse(request.releaseAfter) > now) return 'release_delay_active';
  return null;
}

// ---------------------------------------------------------------------------
// Postgres store
// ---------------------------------------------------------------------------

let tablesEnsured = false;

async function ensureRecoveryRelayTables(): Promise<void> {
  if (tablesEnsured) return;
  const db = getDatabasePool();
  await db.query(`
    CREATE TABLE IF NOT EXISTS pn_recovery_owners (
      owner_hash TEXT PRIMARY KEY,
      owner_public_key TEXT NOT NULL,
      epoch INTEGER NOT NULL,
      threshold INTEGER NOT NULL,
      total_shares INTEGER NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS pn_recovery_custodians (
      owner_hash TEXT NOT NULL,
      custodian_id TEXT NOT NULL,
      owner_public_key TEXT NOT NULL,
      custodian_pn_hash TEXT,
      name TEXT NOT NULL DEFAULT '',
      custodian_type TEXT NOT NULL DEFAULT 'person',
      share_index INTEGER NOT NULL,
      custodianship_credential TEXT NOT NULL,
      unrevokable BOOLEAN NOT NULL DEFAULT FALSE,
      status TEXT NOT NULL,
      ml_kem_public_key TEXT,
      custody_epoch INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (owner_hash, custodian_id)
    )
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS pn_recovery_custodians_pn_idx
      ON pn_recovery_custodians (custodian_pn_hash)
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS pn_recovery_requests (
      request_id TEXT PRIMARY KEY,
      request_type TEXT NOT NULL,
      owner_hash TEXT NOT NULL,
      owner_public_key TEXT NOT NULL,
      temporary_public_key TEXT,
      threshold INTEGER NOT NULL,
      epoch INTEGER NOT NULL,
      claimant_contact TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL,
      approvals_json TEXT NOT NULL DEFAULT '[]',
      release_after TIMESTAMPTZ NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS pn_recovery_requests_owner_idx
      ON pn_recovery_requests (owner_hash)
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS pn_recovery_deliveries (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      owner_hash TEXT NOT NULL,
      custodian_id TEXT NOT NULL,
      request_id TEXT,
      epoch INTEGER NOT NULL,
      sealed_json TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS pn_recovery_deliveries_lookup_idx
      ON pn_recovery_deliveries (owner_hash, custodian_id, kind)
  `);
  tablesEnsured = true;
}

function iso(value: unknown): string {
  if (!value) return new Date(0).toISOString();
  return new Date(value as string).toISOString();
}

function mapOwner(r: Record<string, unknown>): RecoveryOwnerRow {
  return {
    ownerHash: String(r.owner_hash),
    ownerPublicKey: String(r.owner_public_key),
    epoch: Number(r.epoch),
    threshold: Number(r.threshold),
    totalShares: Number(r.total_shares),
    updatedAt: iso(r.updated_at),
  };
}

function mapCustodian(r: Record<string, unknown>): RecoveryCustodianRow {
  return {
    ownerHash: String(r.owner_hash),
    custodianId: String(r.custodian_id),
    ownerPublicKey: String(r.owner_public_key),
    custodianPnHash: r.custodian_pn_hash ? String(r.custodian_pn_hash) : null,
    name: String(r.name || ''),
    custodianType: String(r.custodian_type || 'person'),
    shareIndex: Number(r.share_index),
    custodianshipCredential: String(r.custodianship_credential),
    unrevokable: r.unrevokable === true,
    status: String(r.status) as RecoveryCustodianStatus,
    mlKemPublicKey: r.ml_kem_public_key ? String(r.ml_kem_public_key) : null,
    custodyEpoch: r.custody_epoch === null || r.custody_epoch === undefined ? null : Number(r.custody_epoch),
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  };
}

function mapRequest(r: Record<string, unknown>): RecoveryRequestRow {
  let approvals: RecoveryApprovalRecord[] = [];
  try {
    const parsed = JSON.parse(String(r.approvals_json || '[]'));
    if (Array.isArray(parsed)) approvals = parsed as RecoveryApprovalRecord[];
  } catch {
    approvals = [];
  }
  return {
    requestId: String(r.request_id),
    requestType: String(r.request_type) as RecoveryRequestType,
    ownerHash: String(r.owner_hash),
    ownerPublicKey: String(r.owner_public_key),
    temporaryPublicKey: r.temporary_public_key ? String(r.temporary_public_key) : null,
    threshold: Number(r.threshold),
    epoch: Number(r.epoch),
    claimantContact: String(r.claimant_contact || ''),
    status: String(r.status) as RecoveryRequestStatus,
    approvals,
    releaseAfter: iso(r.release_after),
    expiresAt: iso(r.expires_at),
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  };
}

function mapDelivery(r: Record<string, unknown>): RecoveryDeliveryRow {
  return {
    id: String(r.id),
    kind: String(r.kind) as 'custody' | 'release',
    ownerHash: String(r.owner_hash),
    custodianId: String(r.custodian_id),
    requestId: r.request_id ? String(r.request_id) : null,
    epoch: Number(r.epoch),
    sealedShare: String(r.sealed_json),
    createdAt: iso(r.created_at),
  };
}

export const pgRecoveryRelayStore: RecoveryRelayStore = {
  async getOwner(ownerHash) {
    await ensureRecoveryRelayTables();
    const r = await getDatabasePool().query(`SELECT * FROM pn_recovery_owners WHERE owner_hash = $1`, [ownerHash]);
    return r.rows[0] ? mapOwner(r.rows[0]) : null;
  },

  async upsertOwner(row) {
    await ensureRecoveryRelayTables();
    await getDatabasePool().query(
      `INSERT INTO pn_recovery_owners (owner_hash, owner_public_key, epoch, threshold, total_shares, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (owner_hash) DO UPDATE SET
         owner_public_key = EXCLUDED.owner_public_key,
         epoch = EXCLUDED.epoch,
         threshold = EXCLUDED.threshold,
         total_shares = EXCLUDED.total_shares,
         updated_at = NOW()`,
      [row.ownerHash, row.ownerPublicKey, row.epoch, row.threshold, row.totalShares]
    );
  },

  async listCustodians(ownerHash) {
    await ensureRecoveryRelayTables();
    const r = await getDatabasePool().query(
      `SELECT * FROM pn_recovery_custodians WHERE owner_hash = $1 ORDER BY share_index, created_at`,
      [ownerHash]
    );
    return r.rows.map(mapCustodian);
  },

  async getCustodian(ownerHash, custodianId) {
    await ensureRecoveryRelayTables();
    const r = await getDatabasePool().query(
      `SELECT * FROM pn_recovery_custodians WHERE owner_hash = $1 AND custodian_id = $2`,
      [ownerHash, custodianId]
    );
    return r.rows[0] ? mapCustodian(r.rows[0]) : null;
  },

  async listCustodiansByCustodianPn(custodianPnHash) {
    await ensureRecoveryRelayTables();
    const r = await getDatabasePool().query(
      `SELECT * FROM pn_recovery_custodians WHERE custodian_pn_hash = $1 AND status = 'accepted'`,
      [custodianPnHash]
    );
    return r.rows.map(mapCustodian);
  },

  async upsertCustodian(row) {
    await ensureRecoveryRelayTables();
    await getDatabasePool().query(
      `INSERT INTO pn_recovery_custodians (
         owner_hash, custodian_id, owner_public_key, custodian_pn_hash, name, custodian_type,
         share_index, custodianship_credential, unrevokable, status, ml_kem_public_key,
         custody_epoch, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
       ON CONFLICT (owner_hash, custodian_id) DO UPDATE SET
         owner_public_key = EXCLUDED.owner_public_key,
         custodian_pn_hash = EXCLUDED.custodian_pn_hash,
         name = EXCLUDED.name,
         custodian_type = EXCLUDED.custodian_type,
         share_index = EXCLUDED.share_index,
         custodianship_credential = EXCLUDED.custodianship_credential,
         unrevokable = EXCLUDED.unrevokable,
         status = EXCLUDED.status,
         ml_kem_public_key = EXCLUDED.ml_kem_public_key,
         custody_epoch = EXCLUDED.custody_epoch,
         updated_at = NOW()`,
      [
        row.ownerHash,
        row.custodianId,
        row.ownerPublicKey,
        row.custodianPnHash,
        row.name,
        row.custodianType,
        row.shareIndex,
        row.custodianshipCredential,
        row.unrevokable,
        row.status,
        row.mlKemPublicKey,
        row.custodyEpoch,
        row.createdAt,
      ]
    );
  },

  async getRequest(requestId) {
    await ensureRecoveryRelayTables();
    const r = await getDatabasePool().query(`SELECT * FROM pn_recovery_requests WHERE request_id = $1`, [requestId]);
    return r.rows[0] ? mapRequest(r.rows[0]) : null;
  },

  async insertRequest(row) {
    await ensureRecoveryRelayTables();
    await getDatabasePool().query(
      `INSERT INTO pn_recovery_requests (
         request_id, request_type, owner_hash, owner_public_key, temporary_public_key, threshold,
         epoch, claimant_contact, status, approvals_json, release_after, expires_at, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())`,
      [
        row.requestId,
        row.requestType,
        row.ownerHash,
        row.ownerPublicKey,
        row.temporaryPublicKey,
        row.threshold,
        row.epoch,
        row.claimantContact,
        row.status,
        JSON.stringify(row.approvals),
        row.releaseAfter,
        row.expiresAt,
        row.createdAt,
      ]
    );
  },

  async updateRequest(requestId, patch) {
    await ensureRecoveryRelayTables();
    const sets: string[] = [];
    const values: unknown[] = [requestId];
    if (patch.status !== undefined) {
      values.push(patch.status);
      sets.push(`status = $${values.length}`);
    }
    if (patch.approvals !== undefined) {
      values.push(JSON.stringify(patch.approvals));
      sets.push(`approvals_json = $${values.length}`);
    }
    if (patch.releaseAfter !== undefined) {
      values.push(patch.releaseAfter);
      sets.push(`release_after = $${values.length}`);
    }
    if (sets.length === 0) return;
    await getDatabasePool().query(
      `UPDATE pn_recovery_requests SET ${sets.join(', ')}, updated_at = NOW() WHERE request_id = $1`,
      values
    );
  },

  async listRequestsForOwner(ownerHash) {
    await ensureRecoveryRelayTables();
    const r = await getDatabasePool().query(
      `SELECT * FROM pn_recovery_requests WHERE owner_hash = $1 ORDER BY created_at DESC LIMIT 50`,
      [ownerHash]
    );
    return r.rows.map(mapRequest);
  },

  async putCustodyDelivery(row) {
    await ensureRecoveryRelayTables();
    const db = getDatabasePool();
    await db.query(
      `DELETE FROM pn_recovery_deliveries WHERE owner_hash = $1 AND custodian_id = $2 AND kind = 'custody'`,
      [row.ownerHash, row.custodianId]
    );
    await db.query(
      `INSERT INTO pn_recovery_deliveries (id, kind, owner_hash, custodian_id, request_id, epoch, sealed_json, created_at)
       VALUES ($1, 'custody', $2, $3, NULL, $4, $5, NOW())`,
      [row.id, row.ownerHash, row.custodianId, row.epoch, row.sealedShare]
    );
  },

  async listCustodyDeliveries(ownerHash, custodianId) {
    await ensureRecoveryRelayTables();
    const r = await getDatabasePool().query(
      `SELECT * FROM pn_recovery_deliveries WHERE owner_hash = $1 AND custodian_id = $2 AND kind = 'custody'`,
      [ownerHash, custodianId]
    );
    return r.rows.map(mapDelivery);
  },

  async getDelivery(id) {
    await ensureRecoveryRelayTables();
    const r = await getDatabasePool().query(`SELECT * FROM pn_recovery_deliveries WHERE id = $1`, [id]);
    return r.rows[0] ? mapDelivery(r.rows[0]) : null;
  },

  async deleteDelivery(id) {
    await ensureRecoveryRelayTables();
    await getDatabasePool().query(`DELETE FROM pn_recovery_deliveries WHERE id = $1`, [id]);
  },

  async deleteCustodyDeliveriesForOwner(ownerHash) {
    await ensureRecoveryRelayTables();
    await getDatabasePool().query(
      `DELETE FROM pn_recovery_deliveries WHERE owner_hash = $1 AND kind = 'custody'`,
      [ownerHash]
    );
  },

  async putReleaseDelivery(row) {
    await ensureRecoveryRelayTables();
    await getDatabasePool().query(
      `INSERT INTO pn_recovery_deliveries (id, kind, owner_hash, custodian_id, request_id, epoch, sealed_json, created_at)
       VALUES ($1, 'release', $2, $3, $4, $5, $6, NOW())`,
      [row.id, row.ownerHash, row.custodianId, row.requestId, row.epoch, row.sealedShare]
    );
  },

  async listReleaseDeliveries(requestId) {
    await ensureRecoveryRelayTables();
    const r = await getDatabasePool().query(
      `SELECT * FROM pn_recovery_deliveries WHERE request_id = $1 AND kind = 'release'`,
      [requestId]
    );
    return r.rows.map(mapDelivery);
  },
};

let activeStore: RecoveryRelayStore = pgRecoveryRelayStore;

export function getRecoveryRelayStore(): RecoveryRelayStore {
  return activeStore;
}

/** Tests only: swap the Postgres store for an in-memory one. */
export function setRecoveryRelayStoreForTests(store: RecoveryRelayStore | null): void {
  activeStore = store ?? pgRecoveryRelayStore;
}
