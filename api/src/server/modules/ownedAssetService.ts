/**
 * Owned-asset registry: root human pN + subject + kind (sub-pN, feeds, keys, etc.)
 */

import type { PoolClient } from 'pg';
import { getDatabasePool } from '../utils/database';
import { appendAuditEvent } from './auditService';
import { isPnRevokedForNetwork } from './identitySuccessionService';

export type OwnedAssetKind =
  | 'human'
  | 'api_key'
  | 'feed'
  | 'device'
  | 'ai_agent'
  | 'smart_device';

export type OwnedAssetStatus = 'active' | 'revoked' | 'suspended';

export interface OwnedAssetRow {
  id: string;
  rootPnIdentifier: string;
  subjectPnIdentifier: string | null;
  kind: OwnedAssetKind;
  status: OwnedAssetStatus;
  metadata: Record<string, unknown>;
  apiKeyId: string | null;
  createdAt: string;
  updatedAt: string;
  revokedAt: string | null;
}

function mapAssetRow(row: Record<string, unknown>): OwnedAssetRow {
  return {
    id: String(row.id),
    rootPnIdentifier: String(row.root_pn_identifier),
    subjectPnIdentifier: row.subject_pn_identifier ? String(row.subject_pn_identifier) : null,
    kind: String(row.kind) as OwnedAssetKind,
    status: String(row.status) as OwnedAssetStatus,
    metadata: (row.metadata && typeof row.metadata === 'object' ? row.metadata : {}) as Record<string, unknown>,
    apiKeyId: row.api_key_id ? String(row.api_key_id) : null,
    createdAt: row.created_at ? new Date(String(row.created_at)).toISOString() : new Date().toISOString(),
    updatedAt: row.updated_at ? new Date(String(row.updated_at)).toISOString() : new Date().toISOString(),
    revokedAt: row.revoked_at ? new Date(String(row.revoked_at)).toISOString() : null
  };
}

function normalizePn(pn: string): string {
  const t = pn.trim();
  return t.startsWith('pn-') ? t : `pn-${t}`;
}

export class OwnedAssetService {
  /** One-time backfill: link legacy api_keys rows to registry rows */
  static async backfillLegacyApiKeys(): Promise<number> {
    const pool = getDatabasePool();
    let count = 0;
    const r = await pool.query(
      `SELECT id, pn_id, is_active FROM api_keys WHERE owned_asset_id IS NULL`
    );
    for (const row of r.rows as Record<string, unknown>[]) {
      const id = String(row.id);
      const pnId = normalizePn(String(row.pn_id));
      const isActive = Boolean(row.is_active);
      const ins = await pool.query(
        `INSERT INTO pn_owned_assets (
          root_pn_identifier, subject_pn_identifier, kind, status, metadata, api_key_id
        ) VALUES ($1, $2, 'api_key', $3, '{}'::jsonb, $4)
        RETURNING id`,
        [pnId, pnId, isActive ? 'active' : 'revoked', id]
      );
      const assetId = String(ins.rows[0].id);
      await pool.query(
        `UPDATE api_keys SET owned_asset_id = $1, root_pn_id = $2 WHERE id = $3`,
        [assetId, pnId, id]
      );
      count += 1;
    }
    if (count > 0) {
      console.log(`[OwnedAssetService] Backfilled ${count} api_keys with owned_asset rows`);
    }
    return count;
  }

  /** After creating a new API key row, register and link (same connection for transactions) */
  static async registerApiKeyAssetWithClient(
    client: PoolClient,
    params: {
      apiKeyId: string;
      pnId: string;
      ownerType?: string;
    }
  ): Promise<string> {
    const root = normalizePn(params.pnId);
    const subject = root;
    const ins = await client.query(
      `INSERT INTO pn_owned_assets (
        root_pn_identifier, subject_pn_identifier, kind, status, metadata, api_key_id
      ) VALUES ($1, $2, 'api_key', 'active', $3::jsonb, $4)
      RETURNING id`,
      [root, subject, JSON.stringify({ ownerType: params.ownerType ?? 'pn_user' }), params.apiKeyId]
    );
    const assetId = String(ins.rows[0].id);
    await client.query(`UPDATE api_keys SET owned_asset_id = $1, root_pn_id = $2 WHERE id = $3`, [
      assetId,
      root,
      params.apiKeyId
    ]);
    return assetId;
  }

  static async listByRoot(rootPn: string): Promise<OwnedAssetRow[]> {
    const pool = getDatabasePool();
    const r = await pool.query(
      `SELECT * FROM pn_owned_assets WHERE root_pn_identifier = $1 ORDER BY created_at DESC`,
      [normalizePn(rootPn)]
    );
    return r.rows.map((row: Record<string, unknown>) => mapAssetRow(row));
  }

  static async getById(id: string): Promise<OwnedAssetRow | null> {
    const pool = getDatabasePool();
    const r = await pool.query(`SELECT * FROM pn_owned_assets WHERE id = $1`, [id]);
    if (r.rows.length === 0) return null;
    return mapAssetRow(r.rows[0] as Record<string, unknown>);
  }

  static async createAsset(params: {
    rootPnIdentifier: string;
    subjectPnIdentifier: string | null;
    kind: OwnedAssetKind;
    metadata?: Record<string, unknown>;
  }): Promise<OwnedAssetRow> {
    const pool = getDatabasePool();
    const root = normalizePn(params.rootPnIdentifier);
    const subject = params.subjectPnIdentifier ? normalizePn(params.subjectPnIdentifier) : null;
    const r = await pool.query(
      `INSERT INTO pn_owned_assets (root_pn_identifier, subject_pn_identifier, kind, status, metadata)
       VALUES ($1, $2, $3, 'active', $4::jsonb)
       RETURNING *`,
      [root, subject, params.kind, JSON.stringify(params.metadata ?? {})]
    );
    const row = mapAssetRow(r.rows[0] as Record<string, unknown>);
    await appendAuditEvent({
      eventType: 'owned_asset.created',
      actorHint: 'dashboard',
      subjectPnIdentifier: root,
      metadata: { assetId: row.id, kind: row.kind }
    });
    return row;
  }

  static async revokeAsset(id: string, rootPn: string): Promise<boolean> {
    const pool = getDatabasePool();
    const root = normalizePn(rootPn);
    const r = await pool.query(
      `UPDATE pn_owned_assets
       SET status = 'revoked', revoked_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND root_pn_identifier = $2 AND status = 'active'
       RETURNING id`,
      [id, root]
    );
    if (r.rowCount === 0) return false;
    await appendAuditEvent({
      eventType: 'owned_asset.revoked',
      actorHint: 'dashboard',
      subjectPnIdentifier: root,
      metadata: { assetId: id }
    });
    return true;
  }

  /** Validate API key row against registry when linked */
  static async assertApiKeyRegistryAllows(keyId: string): Promise<{ ok: true } | { ok: false; error: string }> {
    const pool = getDatabasePool();
    const r = await pool.query(
      `SELECT ak.id, ak.pn_id, ak.owned_asset_id, oa.status as asset_status, oa.root_pn_identifier
       FROM api_keys ak
       LEFT JOIN pn_owned_assets oa ON oa.id = ak.owned_asset_id
       WHERE ak.id = $1`,
      [keyId]
    );
    if (r.rows.length === 0) return { ok: false, error: 'API key not found' };
    const row = r.rows[0] as Record<string, unknown>;
    const ownedId = row.owned_asset_id;
    if (!ownedId) {
      return { ok: true };
    }
    const status = String(row.asset_status || '');
    if (status !== 'active') {
      return { ok: false, error: 'API key owned asset is revoked or suspended' };
    }
    const rootPn = String(row.root_pn_identifier || '');
    if (rootPn && isPnRevokedForNetwork(rootPn)) {
      return { ok: false, error: 'API key root identity is superseded on the par Noir network' };
    }
    const subjectPn = String(row.pn_id || '');
    if (subjectPn && isPnRevokedForNetwork(subjectPn)) {
      return { ok: false, error: 'API key identity is superseded on the par Noir network' };
    }
    return { ok: true };
  }

  static async recordExportAudit(rootPn: string, assetId: string): Promise<void> {
    await appendAuditEvent({
      eventType: 'owned_asset.exported',
      actorHint: 'dashboard',
      subjectPnIdentifier: normalizePn(rootPn),
      metadata: { assetId }
    });
  }

  // --- Delegations ---

  static async listDelegations(ownedAssetId: string, rootPn: string): Promise<
    Array<{
      id: string;
      delegateePnIdentifier: string | null;
      delegateeClientId: string | null;
      scope: string;
      expiresAt: string | null;
      status: string;
      createdAt: string;
    }>
  > {
    await this.assertRootOwnsAsset(ownedAssetId, rootPn);
    const pool = getDatabasePool();
    const r = await pool.query(
      `SELECT id, delegatee_pn_identifier, delegatee_client_id, scope, expires_at, status, created_at
       FROM pn_asset_delegations WHERE owned_asset_id = $1 ORDER BY created_at DESC`,
      [ownedAssetId]
    );
    return r.rows.map((row: Record<string, unknown>) => ({
      id: String(row.id),
      delegateePnIdentifier: row.delegatee_pn_identifier ? String(row.delegatee_pn_identifier) : null,
      delegateeClientId: row.delegatee_client_id ? String(row.delegatee_client_id) : null,
      scope: String(row.scope),
      expiresAt: row.expires_at ? new Date(String(row.expires_at)).toISOString() : null,
      status: String(row.status),
      createdAt: row.created_at ? new Date(String(row.created_at)).toISOString() : new Date().toISOString()
    }));
  }

  static async assertRootOwnsAsset(assetId: string, rootPn: string): Promise<void> {
    const asset = await this.getById(assetId);
    if (!asset || asset.rootPnIdentifier !== normalizePn(rootPn)) {
      throw Object.assign(new Error('not_found_or_forbidden'), { code: 'FORBIDDEN' });
    }
  }

  static async addDelegation(params: {
    ownedAssetId: string;
    rootPn: string;
    delegateePnIdentifier?: string;
    delegateeClientId?: string;
    scope: string;
    expiresAt?: string | null;
  }): Promise<string> {
    await this.assertRootOwnsAsset(params.ownedAssetId, params.rootPn);
    const pn = params.delegateePnIdentifier?.trim();
    const cid = params.delegateeClientId?.trim();
    if ((!pn && !cid) || (pn && cid)) {
      throw Object.assign(new Error('exactly_one_delegatee'), { code: 'INVALID_INPUT' });
    }
    const pool = getDatabasePool();
    const r = await pool.query(
      `INSERT INTO pn_asset_delegations (
        owned_asset_id, delegatee_pn_identifier, delegatee_client_id, scope, expires_at, status
      ) VALUES ($1, $2, $3, $4, $5, 'active')
      RETURNING id`,
      [
        params.ownedAssetId,
        pn ? normalizePn(pn) : null,
        cid || null,
        params.scope || '*',
        params.expiresAt ?? null
      ]
    );
    const id = String(r.rows[0].id);
    await appendAuditEvent({
      eventType: 'owned_asset.delegation_created',
      actorHint: 'dashboard',
      subjectPnIdentifier: normalizePn(params.rootPn),
      metadata: { assetId: params.ownedAssetId, delegationId: id }
    });
    return id;
  }

  static async revokeDelegation(delegationId: string, rootPn: string): Promise<boolean> {
    const pool = getDatabasePool();
    const root = normalizePn(rootPn);
    const r = await pool.query(
      `UPDATE pn_asset_delegations d
       SET status = 'revoked', updated_at = NOW()
       FROM pn_owned_assets oa
       WHERE d.id = $1 AND d.owned_asset_id = oa.id AND oa.root_pn_identifier = $2
       RETURNING d.id`,
      [delegationId, root]
    );
    return (r.rowCount ?? 0) > 0;
  }

  /** Rotate a sub owned asset to a new subject (compromise recovery). */
  static async rekeyAsset(params: {
    assetId: string;
    rootPn: string;
    newSubjectPnIdentifier: string;
    newSubjectPublicKey?: string;
    reason?: string;
    migrateDelegations?: boolean;
  }): Promise<OwnedAssetRow> {
    const root = normalizePn(params.rootPn);
    const old = await this.getById(params.assetId);
    if (!old || old.rootPnIdentifier !== root || old.status !== 'active') {
      throw Object.assign(new Error('not_found_or_forbidden'), { code: 'FORBIDDEN' });
    }
    if (old.kind === 'human' || old.kind === 'api_key') {
      throw Object.assign(new Error('kind_not_rekeyable'), { code: 'INVALID_INPUT' });
    }
    const newSubject = normalizePn(params.newSubjectPnIdentifier);
    if (old.subjectPnIdentifier && normalizePn(old.subjectPnIdentifier) === newSubject) {
      throw Object.assign(new Error('subject_unchanged'), { code: 'INVALID_INPUT' });
    }

    const pool = getDatabasePool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        `UPDATE pn_owned_assets
         SET status = 'revoked', revoked_at = NOW(), updated_at = NOW()
         WHERE id = $1 AND root_pn_identifier = $2`,
        [params.assetId, root]
      );

      const label =
        typeof old.metadata?.label === 'string' ? old.metadata.label : undefined;
      const ins = await client.query(
        `INSERT INTO pn_owned_assets (root_pn_identifier, subject_pn_identifier, kind, status, metadata)
         VALUES ($1, $2, $3, 'active', $4::jsonb)
         RETURNING *`,
        [
          root,
          newSubject,
          old.kind,
          JSON.stringify({
            ...(label ? { label } : {}),
            supersedesAssetId: old.id,
            ...(params.newSubjectPublicKey ? { subjectPublicKey: params.newSubjectPublicKey } : {}),
          }),
        ]
      );
      const created = mapAssetRow(ins.rows[0] as Record<string, unknown>);

      if (params.migrateDelegations !== false) {
        await client.query(
          `UPDATE pn_asset_delegations
           SET owned_asset_id = $2, updated_at = NOW()
           WHERE owned_asset_id = $1 AND status = 'active'`,
          [old.id, created.id]
        );
      }

      if (old.subjectPnIdentifier) {
        const predSubject = normalizePn(old.subjectPnIdentifier);
        await client.query(
          `INSERT INTO pn_subject_succession (
            predecessor_subject_pn_identifier, successor_subject_pn_identifier,
            predecessor_asset_id, successor_asset_id, root_pn_identifier, reason
          ) VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            predSubject,
            newSubject,
            old.id,
            created.id,
            root,
            (params.reason || 'rotation').slice(0, 64),
          ]
        );
        const { syncSubjectSuccessionFromRow } = await import('./identitySuccessionService');
        syncSubjectSuccessionFromRow(predSubject, newSubject);
      }

      await client.query('COMMIT');

      await appendAuditEvent({
        eventType: 'owned_asset.rekeyed',
        actorHint: 'dashboard',
        subjectPnIdentifier: root,
        metadata: {
          predecessorAssetId: old.id,
          successorAssetId: created.id,
          predecessorSubject: old.subjectPnIdentifier,
          successorSubject: newSubject,
        },
      });

      return created;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

}
