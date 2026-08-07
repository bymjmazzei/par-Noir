/**
 * Owned-asset registry: Drive SoT (when cloud token present) + Postgres authz cache.
 */

import type { PoolClient } from 'pg';
import { randomUUID } from 'crypto';
import { getDatabasePool } from '../utils/database';
import { appendAuditEvent } from './auditService';
import { isPnRevokedForNetwork } from './identitySuccessionService';
import { loadOwnedAssetDriveBundle } from './ownedAssetStorageService';
import {
  OwnedAssetsSheetsService,
  type AssetDelegationSheetRow,
  type OwnedAssetSheetRow
} from './ownedAssetsSheetsService';

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

export interface OwnedAssetCloudOpts {
  accessToken?: string;
}

function mapAssetRow(row: Record<string, unknown>): OwnedAssetRow {
  return {
    id: String(row.id),
    rootPnIdentifier: String(row.root_pn_identifier),
    subjectPnIdentifier: row.subject_pn_identifier ? String(row.subject_pn_identifier) : null,
    kind: String(row.kind) as OwnedAssetKind,
    status: String(row.status) as OwnedAssetStatus,
    metadata: (row.metadata && typeof row.metadata === 'object' ? row.metadata : {}) as Record<
      string,
      unknown
    >,
    apiKeyId: row.api_key_id ? String(row.api_key_id) : null,
    createdAt: row.created_at ? new Date(String(row.created_at)).toISOString() : new Date().toISOString(),
    updatedAt: row.updated_at ? new Date(String(row.updated_at)).toISOString() : new Date().toISOString(),
    revokedAt: row.revoked_at ? new Date(String(row.revoked_at)).toISOString() : null
  };
}

function sheetToRow(s: OwnedAssetSheetRow): OwnedAssetRow {
  return {
    id: s.id,
    rootPnIdentifier: s.rootPnIdentifier,
    subjectPnIdentifier: s.subjectPnIdentifier,
    kind: s.kind as OwnedAssetKind,
    status: s.status as OwnedAssetStatus,
    metadata: s.metadata,
    apiKeyId: s.apiKeyId,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    revokedAt: s.revokedAt
  };
}

function rowToSheet(row: OwnedAssetRow): OwnedAssetSheetRow {
  return {
    id: row.id,
    rootPnIdentifier: row.rootPnIdentifier,
    subjectPnIdentifier: row.subjectPnIdentifier,
    kind: row.kind,
    status: row.status,
    metadata: row.metadata,
    apiKeyId: row.apiKeyId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    revokedAt: row.revokedAt
  };
}

function normalizePn(pn: string): string {
  const t = pn.trim();
  return t.startsWith('pn-') ? t : `pn-${t}`;
}

/** Feed subjects use `feed-*` ids; do not rewrite them to `pn-*`. */
function normalizeSubjectForKind(kind: OwnedAssetKind, subject: string | null): string | null {
  if (!subject) return null;
  const t = subject.trim();
  if (!t) return null;
  if (kind === 'feed' && (t.startsWith('feed-') || t.startsWith('feed_'))) {
    return t;
  }
  return normalizePn(t);
}

const FEED_CAPABILITY_SCOPES = new Set(['read', 'write', 'manage', '*']);

function feedPermissionsFromScope(scope: string): ('read' | 'write' | 'manage')[] {
  if (scope === '*' || scope === 'manage') return ['read', 'write', 'manage'];
  if (scope === 'write') return ['read', 'write'];
  return ['read'];
}

async function mirrorFeedDelegationCreate(
  asset: OwnedAssetRow,
  delegateePn: string,
  scope: string
): Promise<void> {
  if (asset.kind !== 'feed' || !FEED_CAPABILITY_SCOPES.has(scope)) return;
  const feedId = asset.metadata?.feedId;
  if (typeof feedId !== 'string' || !feedId.trim()) return;
  const permissions = feedPermissionsFromScope(scope);
  const pool = getDatabasePool();
  const delegationId = `delegation_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  const now = new Date().toISOString();
  await pool.query(
    `INSERT INTO feed_delegations (
      delegation_id, feed_id, owner_did, delegate_did, permissions, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (feed_id, delegate_did) DO UPDATE SET
      permissions = EXCLUDED.permissions,
      updated_at = EXCLUDED.updated_at`,
    [
      delegationId,
      feedId.trim(),
      asset.rootPnIdentifier,
      normalizePn(delegateePn),
      JSON.stringify(permissions),
      now,
      now
    ]
  );
}

async function mirrorFeedDelegationRevoke(
  asset: OwnedAssetRow,
  delegateePn: string | null
): Promise<void> {
  if (asset.kind !== 'feed' || !delegateePn) return;
  const feedId = asset.metadata?.feedId;
  if (typeof feedId !== 'string' || !feedId.trim()) return;
  const pool = getDatabasePool();
  await pool.query(`DELETE FROM feed_delegations WHERE feed_id = $1 AND delegate_did = $2`, [
    feedId.trim(),
    normalizePn(delegateePn)
  ]);
}

async function upsertPostgresCache(row: OwnedAssetRow): Promise<void> {
  const pool = getDatabasePool();
  await pool.query(
    `INSERT INTO pn_owned_assets (
      id, root_pn_identifier, subject_pn_identifier, kind, status, metadata, api_key_id,
      created_at, updated_at, revoked_at
    ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8::timestamptz, $9::timestamptz, $10::timestamptz)
    ON CONFLICT (id) DO UPDATE SET
      subject_pn_identifier = EXCLUDED.subject_pn_identifier,
      kind = EXCLUDED.kind,
      status = EXCLUDED.status,
      metadata = EXCLUDED.metadata,
      api_key_id = EXCLUDED.api_key_id,
      updated_at = EXCLUDED.updated_at,
      revoked_at = EXCLUDED.revoked_at`,
    [
      row.id,
      row.rootPnIdentifier,
      row.subjectPnIdentifier,
      row.kind,
      row.status,
      JSON.stringify(row.metadata ?? {}),
      row.apiKeyId,
      row.createdAt,
      row.updatedAt,
      row.revokedAt
    ]
  );
}

export class OwnedAssetService {
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

  static async listByRoot(rootPn: string, opts?: OwnedAssetCloudOpts): Promise<OwnedAssetRow[]> {
    const root = normalizePn(rootPn);
    const token = opts?.accessToken?.trim();
    if (!token) {
      throw Object.assign(new Error('cloud_token_required'), { code: 'CLOUD_TOKEN_REQUIRED' });
    }

    const bundle = await loadOwnedAssetDriveBundle(root, { accessToken: token });
    let assets = await OwnedAssetsSheetsService.listAssets(
      bundle.token,
      bundle.spreadsheetId,
      bundle.pnIdentifier,
      bundle.accountId,
      true
    );

    if (assets.length === 0) {
      try {
        const pool = getDatabasePool();
        const r = await pool.query(
          `SELECT * FROM pn_owned_assets WHERE root_pn_identifier = $1 ORDER BY created_at DESC`,
          [root]
        );
        const pgRows = r.rows.map((row: Record<string, unknown>) => mapAssetRow(row));
        for (const row of pgRows) {
          await OwnedAssetsSheetsService.upsertAsset(
            bundle.token,
            bundle.spreadsheetId,
            bundle.pnIdentifier,
            bundle.accountId,
            rowToSheet(row)
          );
        }
        if (pgRows.length > 0) {
          const dels = await pool.query(
            `SELECT d.* FROM pn_asset_delegations d
             JOIN pn_owned_assets oa ON oa.id = d.owned_asset_id
             WHERE oa.root_pn_identifier = $1`,
            [root]
          );
          for (const d of dels.rows as Record<string, unknown>[]) {
            const delRow: AssetDelegationSheetRow = {
              id: String(d.id),
              ownedAssetId: String(d.owned_asset_id),
              delegateePnIdentifier: d.delegatee_pn_identifier
                ? String(d.delegatee_pn_identifier)
                : null,
              delegateeClientId: d.delegatee_client_id ? String(d.delegatee_client_id) : null,
              scope: String(d.scope || '*'),
              expiresAt: d.expires_at ? new Date(String(d.expires_at)).toISOString() : null,
              status: String(d.status || 'active'),
              createdAt: d.created_at
                ? new Date(String(d.created_at)).toISOString()
                : new Date().toISOString(),
              updatedAt: d.updated_at
                ? new Date(String(d.updated_at)).toISOString()
                : new Date().toISOString()
            };
            await OwnedAssetsSheetsService.upsertDelegation(
              bundle.token,
              bundle.spreadsheetId,
              bundle.pnIdentifier,
              bundle.accountId,
              delRow
            );
          }
          assets = await OwnedAssetsSheetsService.listAssets(
            bundle.token,
            bundle.spreadsheetId,
            bundle.pnIdentifier,
            bundle.accountId,
            true
          );
        }
      } catch (backfillErr) {
        // Drive sheet is SoT; Postgres cache backfill must not fail the list.
        console.warn(
          '[owned-assets] postgres backfill skipped:',
          backfillErr instanceof Error ? backfillErr.message : backfillErr
        );
      }
    }

    return assets
      .filter((a) => a.rootPnIdentifier === root)
      .map(sheetToRow)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  static async getById(id: string): Promise<OwnedAssetRow | null> {
    const pool = getDatabasePool();
    const r = await pool.query(`SELECT * FROM pn_owned_assets WHERE id = $1`, [id]);
    if (r.rows.length === 0) return null;
    return mapAssetRow(r.rows[0] as Record<string, unknown>);
  }

  static async createAsset(
    params: {
      rootPnIdentifier: string;
      subjectPnIdentifier: string | null;
      kind: OwnedAssetKind;
      metadata?: Record<string, unknown>;
    },
    opts?: OwnedAssetCloudOpts
  ): Promise<OwnedAssetRow> {
    const token = opts?.accessToken?.trim();
    if (!token) {
      throw Object.assign(new Error('cloud_token_required'), { code: 'CLOUD_TOKEN_REQUIRED' });
    }
    const root = normalizePn(params.rootPnIdentifier);
    const subject = normalizeSubjectForKind(params.kind, params.subjectPnIdentifier);
    const now = new Date().toISOString();
    const row: OwnedAssetRow = {
      id: randomUUID(),
      rootPnIdentifier: root,
      subjectPnIdentifier: subject,
      kind: params.kind,
      status: 'active',
      metadata: params.metadata ?? {},
      apiKeyId: null,
      createdAt: now,
      updatedAt: now,
      revokedAt: null
    };

    const bundle = await loadOwnedAssetDriveBundle(root, { accessToken: token });
    await OwnedAssetsSheetsService.upsertAsset(
      bundle.token,
      bundle.spreadsheetId,
      bundle.pnIdentifier,
      bundle.accountId,
      rowToSheet(row)
    );
    await upsertPostgresCache(row);
    await appendAuditEvent({
      eventType: 'owned_asset.created',
      actorHint: 'dashboard',
      subjectPnIdentifier: root,
      metadata: { assetId: row.id, kind: row.kind }
    });
    return row;
  }

  static async revokeAsset(id: string, rootPn: string, opts?: OwnedAssetCloudOpts): Promise<boolean> {
    const token = opts?.accessToken?.trim();
    if (!token) {
      throw Object.assign(new Error('cloud_token_required'), { code: 'CLOUD_TOKEN_REQUIRED' });
    }
    const root = normalizePn(rootPn);
    const bundle = await loadOwnedAssetDriveBundle(root, { accessToken: token });
    const assets = await OwnedAssetsSheetsService.listAssets(
      bundle.token,
      bundle.spreadsheetId,
      bundle.pnIdentifier,
      bundle.accountId,
      true
    );
    const found = assets.find(
      (a) => a.id === id && a.rootPnIdentifier === root && a.status === 'active'
    );
    if (!found) return false;
    const now = new Date().toISOString();
    const updated: OwnedAssetSheetRow = {
      ...found,
      status: 'revoked',
      revokedAt: now,
      updatedAt: now
    };
    await OwnedAssetsSheetsService.upsertAsset(
      bundle.token,
      bundle.spreadsheetId,
      bundle.pnIdentifier,
      bundle.accountId,
      updated
    );
    await upsertPostgresCache(sheetToRow(updated));
    await appendAuditEvent({
      eventType: 'owned_asset.revoked',
      actorHint: 'dashboard',
      subjectPnIdentifier: root,
      metadata: { assetId: id }
    });
    return true;
  }

  static async assertApiKeyRegistryAllows(
    keyId: string
  ): Promise<{ ok: true } | { ok: false; error: string }> {
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

  static async listDelegations(
    ownedAssetId: string,
    rootPn: string,
    opts?: OwnedAssetCloudOpts
  ): Promise<
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
    const token = opts?.accessToken?.trim();
    if (!token) {
      throw Object.assign(new Error('cloud_token_required'), { code: 'CLOUD_TOKEN_REQUIRED' });
    }
    await this.assertRootOwnsAsset(ownedAssetId, rootPn, opts);
    const root = normalizePn(rootPn);
    const bundle = await loadOwnedAssetDriveBundle(root, { accessToken: token });
    const list = await OwnedAssetsSheetsService.listDelegations(
      bundle.token,
      bundle.spreadsheetId,
      bundle.pnIdentifier,
      bundle.accountId,
      ownedAssetId
    );
    return list.map((d) => ({
      id: d.id,
      delegateePnIdentifier: d.delegateePnIdentifier,
      delegateeClientId: d.delegateeClientId,
      scope: d.scope,
      expiresAt: d.expiresAt,
      status: d.status,
      createdAt: d.createdAt
    }));
  }

  static async assertRootOwnsAsset(
    assetId: string,
    rootPn: string,
    opts?: OwnedAssetCloudOpts
  ): Promise<void> {
    const root = normalizePn(rootPn);
    const token = opts?.accessToken?.trim();
    if (token) {
      const bundle = await loadOwnedAssetDriveBundle(root, { accessToken: token });
      const assets = await OwnedAssetsSheetsService.listAssets(
        bundle.token,
        bundle.spreadsheetId,
        bundle.pnIdentifier,
        bundle.accountId,
        true
      );
      if (assets.some((a) => a.id === assetId && a.rootPnIdentifier === root)) return;
      throw Object.assign(new Error('not_found_or_forbidden'), { code: 'FORBIDDEN' });
    }
    const asset = await this.getById(assetId);
    if (!asset || asset.rootPnIdentifier !== root) {
      throw Object.assign(new Error('not_found_or_forbidden'), { code: 'FORBIDDEN' });
    }
  }

  static async addDelegation(
    params: {
      ownedAssetId: string;
      rootPn: string;
      delegateePnIdentifier?: string;
      delegateeClientId?: string;
      scope: string;
      expiresAt?: string | null;
    },
    opts?: OwnedAssetCloudOpts
  ): Promise<string> {
    const token = opts?.accessToken?.trim();
    if (!token) {
      throw Object.assign(new Error('cloud_token_required'), { code: 'CLOUD_TOKEN_REQUIRED' });
    }
    await this.assertRootOwnsAsset(params.ownedAssetId, params.rootPn, opts);
    const pn = params.delegateePnIdentifier?.trim();
    const cid = params.delegateeClientId?.trim();
    if ((!pn && !cid) || (pn && cid)) {
      throw Object.assign(new Error('exactly_one_delegatee'), { code: 'INVALID_INPUT' });
    }
    const now = new Date().toISOString();
    const id = randomUUID();
    const root = normalizePn(params.rootPn);
    const delRow: AssetDelegationSheetRow = {
      id,
      ownedAssetId: params.ownedAssetId,
      delegateePnIdentifier: pn ? normalizePn(pn) : null,
      delegateeClientId: cid || null,
      scope: params.scope || '*',
      expiresAt: params.expiresAt ?? null,
      status: 'active',
      createdAt: now,
      updatedAt: now
    };
    const bundle = await loadOwnedAssetDriveBundle(root, { accessToken: token });
    await OwnedAssetsSheetsService.upsertDelegation(
      bundle.token,
      bundle.spreadsheetId,
      bundle.pnIdentifier,
      bundle.accountId,
      delRow
    );
    const pool = getDatabasePool();
    await pool.query(
      `INSERT INTO pn_asset_delegations (
        id, owned_asset_id, delegatee_pn_identifier, delegatee_client_id, scope, expires_at, status, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, 'active', $7::timestamptz, $7::timestamptz)
      ON CONFLICT (id) DO UPDATE SET
        status = EXCLUDED.status,
        scope = EXCLUDED.scope,
        updated_at = EXCLUDED.updated_at`,
      [
        id,
        params.ownedAssetId,
        delRow.delegateePnIdentifier,
        delRow.delegateeClientId,
        delRow.scope,
        delRow.expiresAt,
        now
      ]
    );
    await appendAuditEvent({
      eventType: 'owned_asset.delegation_created',
      actorHint: 'dashboard',
      subjectPnIdentifier: root,
      metadata: { assetId: params.ownedAssetId, delegationId: id }
    });

    const asset = await this.getById(params.ownedAssetId);
    if (asset && delRow.delegateePnIdentifier) {
      try {
        await mirrorFeedDelegationCreate(asset, delRow.delegateePnIdentifier, delRow.scope);
      } catch (e) {
        console.error('[owned-assets] mirror feed delegation create failed:', e);
      }
    }

    return id;
  }

  static async revokeDelegation(
    delegationId: string,
    rootPn: string,
    opts?: OwnedAssetCloudOpts
  ): Promise<boolean> {
    const token = opts?.accessToken?.trim();
    if (!token) {
      throw Object.assign(new Error('cloud_token_required'), { code: 'CLOUD_TOKEN_REQUIRED' });
    }
    const root = normalizePn(rootPn);
    const bundle = await loadOwnedAssetDriveBundle(root, { accessToken: token });
    const list = await OwnedAssetsSheetsService.listDelegations(
      bundle.token,
      bundle.spreadsheetId,
      bundle.pnIdentifier,
      bundle.accountId
    );
    const found = list.find((d) => d.id === delegationId);
    if (!found) return false;
    await this.assertRootOwnsAsset(found.ownedAssetId, root, opts);
    const now = new Date().toISOString();
    await OwnedAssetsSheetsService.upsertDelegation(
      bundle.token,
      bundle.spreadsheetId,
      bundle.pnIdentifier,
      bundle.accountId,
      { ...found, status: 'revoked', updatedAt: now }
    );
    const pool = getDatabasePool();
    await pool.query(
      `UPDATE pn_asset_delegations SET status = 'revoked', updated_at = NOW() WHERE id = $1`,
      [delegationId]
    );

    const asset = await this.getById(found.ownedAssetId);
    if (asset) {
      try {
        await mirrorFeedDelegationRevoke(asset, found.delegateePnIdentifier);
      } catch (e) {
        console.error('[owned-assets] mirror feed delegation revoke failed:', e);
      }
    }

    return true;
  }

  /** Postgres-only list for browser context switcher (no Drive cloud token). */
  static async listFeedAssetsFromCache(rootPn: string): Promise<OwnedAssetRow[]> {
    const root = normalizePn(rootPn);
    const pool = getDatabasePool();
    const r = await pool.query(
      `SELECT * FROM pn_owned_assets
       WHERE root_pn_identifier = $1 AND kind = 'feed' AND status = 'active'
       ORDER BY created_at DESC`,
      [root]
    );
    return r.rows.map((row: Record<string, unknown>) => mapAssetRow(row));
  }

  /** Feeds delegated to this pN via owned-asset scopes (postgres cache). */
  static async listDelegatedFeedIdsFromCache(delegateePn: string): Promise<
    Array<{ feedId: string; scope: string; assetId: string }>
  > {
    const delegatee = normalizePn(delegateePn);
    const pool = getDatabasePool();
    const r = await pool.query(
      `SELECT oa.id AS asset_id, oa.metadata, d.scope
       FROM pn_asset_delegations d
       JOIN pn_owned_assets oa ON oa.id = d.owned_asset_id
       WHERE oa.kind = 'feed' AND oa.status = 'active'
         AND d.status = 'active'
         AND d.delegatee_pn_identifier = $1`,
      [delegatee]
    );
    const out: Array<{ feedId: string; scope: string; assetId: string }> = [];
    for (const row of r.rows as Record<string, unknown>[]) {
      const meta =
        typeof row.metadata === 'string'
          ? (JSON.parse(row.metadata) as Record<string, unknown>)
          : ((row.metadata as Record<string, unknown>) ?? {});
      const feedId = meta.feedId;
      if (typeof feedId === 'string' && feedId.trim()) {
        out.push({
          feedId: feedId.trim(),
          scope: String(row.scope || 'read'),
          assetId: String(row.asset_id)
        });
      }
    }
    return out;
  }

  static async rekeyAsset(
    params: {
      assetId: string;
      rootPn: string;
      newSubjectPnIdentifier: string;
      newSubjectPublicKey?: string;
      reason?: string;
      migrateDelegations?: boolean;
    },
    opts?: OwnedAssetCloudOpts
  ): Promise<OwnedAssetRow> {
    const token = opts?.accessToken?.trim();
    if (!token) {
      throw Object.assign(new Error('cloud_token_required'), { code: 'CLOUD_TOKEN_REQUIRED' });
    }
    const root = normalizePn(params.rootPn);
    const bundle = await loadOwnedAssetDriveBundle(root, { accessToken: token });
    const assets = await OwnedAssetsSheetsService.listAssets(
      bundle.token,
      bundle.spreadsheetId,
      bundle.pnIdentifier,
      bundle.accountId,
      true
    );
    const oldSheet = assets.find((a) => a.id === params.assetId && a.rootPnIdentifier === root);
    if (!oldSheet || oldSheet.status !== 'active') {
      throw Object.assign(new Error('not_found_or_forbidden'), { code: 'FORBIDDEN' });
    }
    if (oldSheet.kind === 'human' || oldSheet.kind === 'api_key') {
      throw Object.assign(new Error('kind_not_rekeyable'), { code: 'INVALID_INPUT' });
    }
    const newSubject = normalizePn(params.newSubjectPnIdentifier);
    if (oldSheet.subjectPnIdentifier && normalizePn(oldSheet.subjectPnIdentifier) === newSubject) {
      throw Object.assign(new Error('subject_unchanged'), { code: 'INVALID_INPUT' });
    }

    const now = new Date().toISOString();
    const revoked: OwnedAssetSheetRow = {
      ...oldSheet,
      status: 'revoked',
      revokedAt: now,
      updatedAt: now
    };
    const label =
      typeof oldSheet.metadata?.label === 'string' ? oldSheet.metadata.label : undefined;
    const created: OwnedAssetSheetRow = {
      id: randomUUID(),
      rootPnIdentifier: root,
      subjectPnIdentifier: newSubject,
      kind: oldSheet.kind,
      status: 'active',
      metadata: {
        ...(label ? { label } : {}),
        supersedesAssetId: oldSheet.id,
        ...(params.newSubjectPublicKey ? { subjectPublicKey: params.newSubjectPublicKey } : {})
      },
      apiKeyId: null,
      createdAt: now,
      updatedAt: now,
      revokedAt: null
    };

    await OwnedAssetsSheetsService.upsertAsset(
      bundle.token,
      bundle.spreadsheetId,
      bundle.pnIdentifier,
      bundle.accountId,
      revoked
    );
    await OwnedAssetsSheetsService.upsertAsset(
      bundle.token,
      bundle.spreadsheetId,
      bundle.pnIdentifier,
      bundle.accountId,
      created
    );
    await upsertPostgresCache(sheetToRow(revoked));
    await upsertPostgresCache(sheetToRow(created));

    if (params.migrateDelegations !== false) {
      const dels = await OwnedAssetsSheetsService.listDelegations(
        bundle.token,
        bundle.spreadsheetId,
        bundle.pnIdentifier,
        bundle.accountId,
        oldSheet.id
      );
      for (const d of dels.filter((x) => x.status === 'active')) {
        const moved = { ...d, ownedAssetId: created.id, updatedAt: now };
        await OwnedAssetsSheetsService.upsertDelegation(
          bundle.token,
          bundle.spreadsheetId,
          bundle.pnIdentifier,
          bundle.accountId,
          moved
        );
        const pool = getDatabasePool();
        await pool.query(
          `UPDATE pn_asset_delegations SET owned_asset_id = $2, updated_at = NOW()
           WHERE id = $1 AND status = 'active'`,
          [d.id, created.id]
        );
      }
    }

    if (oldSheet.subjectPnIdentifier) {
      const pool = getDatabasePool();
      const predSubject = normalizePn(oldSheet.subjectPnIdentifier);
      await pool.query(
        `INSERT INTO pn_subject_succession (
          predecessor_subject_pn_identifier, successor_subject_pn_identifier,
          predecessor_asset_id, successor_asset_id, root_pn_identifier, reason
        ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          predSubject,
          newSubject,
          oldSheet.id,
          created.id,
          root,
          (params.reason || 'rotation').slice(0, 64)
        ]
      );
      const { syncSubjectSuccessionFromRow } = await import('./identitySuccessionService');
      syncSubjectSuccessionFromRow(predSubject, newSubject);
    }

    await appendAuditEvent({
      eventType: 'owned_asset.rekeyed',
      actorHint: 'dashboard',
      subjectPnIdentifier: root,
      metadata: {
        predecessorAssetId: oldSheet.id,
        successorAssetId: created.id,
        predecessorSubject: oldSheet.subjectPnIdentifier,
        successorSubject: newSubject
      }
    });

    return sheetToRow(created);
  }
}
