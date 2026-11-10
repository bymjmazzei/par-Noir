/**
 * Owned-asset authz cache in Postgres. The owner's device keeps the user's copy in its
 * owned-assets sheet; the API never opens the user's cloud.
 */

import type { PoolClient } from 'pg';
import { randomUUID } from 'crypto';
import {
  assertMlDsa65PublicKeyB64,
  deriveCanonicalPnIdentifier
} from '@par-noir/pqc-crypto/oauth-unlock-proof';
import { base64ToBytes } from '@par-noir/pqc-crypto/encoding';
import { mlDsa65Verify } from '@par-noir/pqc-crypto/ml-dsa';
import {
  AGENT_CONNECTOR_CLIENT_ID_PREFIX,
  AGENT_MCP_CLIENT_ID,
  canonicalDelegationBytes,
  filterKnownAiScopes,
  parseAgentDelegationStatement,
  type AgentAttestation,
  type AgentDelegationStatement
} from '@par-noir/standard-data-points';
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

  static async getById(id: string): Promise<OwnedAssetRow | null> {
    const pool = getDatabasePool();
    const r = await pool.query(`SELECT * FROM pn_owned_assets WHERE id = $1`, [id]);
    if (r.rows.length === 0) return null;
    return mapAssetRow(r.rows[0] as Record<string, unknown>);
  }

  /** Feed activation registers the feed sub-pN; the device mirrors the row to its sheet. */
  static async createAsset(params: {
    rootPnIdentifier: string;
    subjectPnIdentifier: string | null;
    kind: OwnedAssetKind;
    metadata?: Record<string, unknown>;
  }): Promise<OwnedAssetRow> {
    const root = normalizePn(params.rootPnIdentifier);
    const now = new Date().toISOString();
    const row: OwnedAssetRow = {
      id: randomUUID(),
      rootPnIdentifier: root,
      subjectPnIdentifier: normalizeSubjectForKind(params.kind, params.subjectPnIdentifier),
      kind: params.kind,
      status: 'active',
      metadata: params.metadata ?? {},
      apiKeyId: null,
      createdAt: now,
      updatedAt: now,
      revokedAt: null
    };
    await upsertPostgresCache(row);
    await appendAuditEvent({
      eventType: 'owned_asset.created',
      actorHint: 'dashboard',
      subjectPnIdentifier: root,
      metadata: { assetId: row.id, kind: row.kind }
    });
    return row;
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

  /**
   * Postgres authz cache for an AI agent sub-pN. The dashboard writes the Drive sheet rows
   * on-device with the ids returned here; the API never opens Drive for agents.
   * The delegation must be signed by the root pN's ML-DSA key and match the request.
   */
  static async registerAgent(params: {
    rootPn: string;
    assetId?: string;
    subjectPnIdentifier: string;
    subjectPublicKey: string;
    label: string;
    scopes: string[];
    expiresAt?: string | null;
    statement: unknown;
    signature: string;
    now?: number;
  }): Promise<AiAgentRegistration> {
    const root = normalizePn(params.rootPn);
    const subject = normalizePn(params.subjectPnIdentifier);
    const publicKey = String(params.subjectPublicKey || '').trim();
    if (!assertMlDsa65PublicKeyB64(publicKey) || deriveCanonicalPnIdentifier(publicKey) !== subject) {
      throw Object.assign(new Error('agent_key_mismatch'), { code: 'INVALID_INPUT' });
    }
    if (subject === root) {
      throw Object.assign(new Error('agent_is_root'), { code: 'INVALID_INPUT' });
    }
    const scopes = filterKnownAiScopes(params.scopes);
    if (scopes.length === 0) {
      throw Object.assign(new Error('agent_scopes_required'), { code: 'INVALID_INPUT' });
    }
    const label = String(params.label || '').trim().slice(0, 64);
    if (!label) {
      throw Object.assign(new Error('agent_label_required'), { code: 'INVALID_INPUT' });
    }
    const expiresAt = params.expiresAt ? new Date(params.expiresAt).toISOString() : null;
    const statement = verifyAgentStatement({
      raw: params.statement,
      signature: params.signature,
      root,
      subject,
      publicKey,
      scopes,
      expiresAt,
      now: params.now ?? Date.now()
    });
    const assetId =
      params.assetId && UUID_RE.test(params.assetId) ? params.assetId : randomUUID();

    const pool = getDatabasePool();
    const existing = await pool.query(
      `SELECT id, root_pn_identifier, kind FROM pn_owned_assets
       WHERE id = $1 OR subject_pn_identifier = $2`,
      [assetId, subject]
    );
    for (const row of existing.rows as Record<string, unknown>[]) {
      if (String(row.root_pn_identifier) !== root || String(row.kind) !== 'ai_agent') {
        throw Object.assign(new Error('agent_conflict'), { code: 'FORBIDDEN' });
      }
    }
    const id = existing.rows.length > 0 ? String(existing.rows[0].id) : assetId;

    await pool.query(
      `INSERT INTO pn_owned_assets (
        id, root_pn_identifier, subject_pn_identifier, kind, status, metadata, subject_public_key,
        delegation_statement, delegation_signature
      ) VALUES ($1, $2, $3, 'ai_agent', 'active', $4::jsonb, $5, $6::jsonb, $7)
      ON CONFLICT (id) DO UPDATE SET
        status = 'active',
        metadata = EXCLUDED.metadata,
        subject_public_key = EXCLUDED.subject_public_key,
        delegation_statement = EXCLUDED.delegation_statement,
        delegation_signature = EXCLUDED.delegation_signature,
        updated_at = NOW(),
        revoked_at = NULL`,
      [id, root, subject, JSON.stringify({ label }), publicKey, JSON.stringify(statement), params.signature]
    );
    await pool.query(
      `UPDATE pn_asset_delegations SET status = 'revoked', updated_at = NOW()
       WHERE owned_asset_id = $1 AND status = 'active'`,
      [id]
    );
    const delegations: Array<{ id: string; scope: string }> = [];
    for (const scope of scopes) {
      const delegationId = randomUUID();
      await pool.query(
        `INSERT INTO pn_asset_delegations (
          id, owned_asset_id, delegatee_client_id, scope, expires_at, status
        ) VALUES ($1, $2, $3, $4, $5::timestamptz, 'active')`,
        [delegationId, id, AGENT_MCP_CLIENT_ID, scope, expiresAt]
      );
      delegations.push({ id: delegationId, scope });
    }
    await appendAuditEvent({
      eventType: 'owned_asset.ai_agent_registered',
      actorHint: 'dashboard',
      subjectPnIdentifier: root,
      metadata: { assetId: id, scopes }
    });
    return { assetId: id, subjectPnIdentifier: subject, delegations, expiresAt };
  }

  /** Active AI agents for the dashboard; never returns the agent public key. */
  static async listAgents(rootPn: string): Promise<AiAgentSummary[]> {
    const root = normalizePn(rootPn);
    const pool = getDatabasePool();
    const r = await pool.query(
      `SELECT oa.id, oa.subject_pn_identifier, oa.metadata, oa.created_at,
              COALESCE(array_agg(d.scope) FILTER (WHERE d.status = 'active'), '{}') AS scopes
       FROM pn_owned_assets oa
       LEFT JOIN pn_asset_delegations d ON d.owned_asset_id = oa.id
       WHERE oa.root_pn_identifier = $1 AND oa.kind = 'ai_agent' AND oa.status = 'active'
       GROUP BY oa.id
       ORDER BY oa.created_at DESC`,
      [root]
    );
    return (r.rows as Record<string, unknown>[]).map((row) => {
      const meta = (row.metadata && typeof row.metadata === 'object' ? row.metadata : {}) as Record<
        string,
        unknown
      >;
      return {
        id: String(row.id),
        subjectPnIdentifier: String(row.subject_pn_identifier),
        label: typeof meta.label === 'string' ? meta.label : '',
        scopes: filterKnownAiScopes(Array.isArray(row.scopes) ? (row.scopes as string[]) : []),
        createdAt: row.created_at ? new Date(String(row.created_at)).toISOString() : ''
      };
    });
  }

  /**
   * Apps signed in as one of this root's active agents: the local pn-mcp and any hosted
   * connector with a live refresh token. Null when the agent is not this root's.
   * Last used is the newest refresh-token row, since every refresh rotates a new one in.
   */
  static async listAgentConnectors(rootPn: string, assetId: string): Promise<AiAgentConnector[] | null> {
    if (!UUID_RE.test(assetId)) return null;
    const root = normalizePn(rootPn);
    const pool = getDatabasePool();
    const owned = await pool.query(
      `SELECT subject_public_key FROM pn_owned_assets
       WHERE id = $1 AND root_pn_identifier = $2 AND kind = 'ai_agent' AND status = 'active'`,
      [assetId, root]
    );
    if (owned.rows.length === 0) return null;
    const publicKey = String((owned.rows[0] as Record<string, unknown>).subject_public_key || '');
    if (!publicKey) return [];
    const r = await pool.query(
      `SELECT t.client_id, c.name AS client_name, MAX(t.created_at) AS last_used_at
       FROM oauth_refresh_tokens t
       LEFT JOIN oauth_clients c ON c.client_id = t.client_id
       WHERE t.public_key = $1 AND (t.client_id = $2 OR t.client_id LIKE $3)
       GROUP BY t.client_id, c.name
       HAVING bool_or(t.revoked_at IS NULL AND t.used_at IS NULL AND t.expires_at > NOW())
       ORDER BY last_used_at DESC`,
      [publicKey, AGENT_MCP_CLIENT_ID, `${AGENT_CONNECTOR_CLIENT_ID_PREFIX}%`]
    );
    return (r.rows as Record<string, unknown>[]).map((row) => {
      const local = String(row.client_id) === AGENT_MCP_CLIENT_ID;
      const name = typeof row.client_name === 'string' ? row.client_name.trim() : '';
      return {
        kind: local ? 'local' : 'connector',
        name: local ? 'pn-mcp on your Mac' : name || 'AI connector',
        lastUsedAt: row.last_used_at ? new Date(String(row.last_used_at)).toISOString() : null
      };
    });
  }

  /** Revoke one agent: cache rows go revoked and its refresh tokens are deleted. */
  static async revokeAgent(rootPn: string, assetId: string): Promise<boolean> {
    const root = normalizePn(rootPn);
    const pool = getDatabasePool();
    const r = await pool.query(
      `UPDATE pn_owned_assets SET status = 'revoked', revoked_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND root_pn_identifier = $2 AND kind = 'ai_agent' AND status = 'active'
       RETURNING id, subject_public_key`,
      [assetId, root]
    );
    if (r.rows.length === 0) return false;
    await cutAgentAccess(r.rows as Record<string, unknown>[]);
    await appendAuditEvent({
      eventType: 'owned_asset.ai_agent_revoked',
      actorHint: 'dashboard',
      subjectPnIdentifier: root,
      metadata: { assetId }
    });
    return true;
  }

  /** Revoke every active AI agent under this root. */
  static async revokeAllAgents(rootPn: string): Promise<number> {
    const root = normalizePn(rootPn);
    const pool = getDatabasePool();
    const r = await pool.query(
      `UPDATE pn_owned_assets SET status = 'revoked', revoked_at = NOW(), updated_at = NOW()
       WHERE root_pn_identifier = $1 AND kind = 'ai_agent' AND status = 'active'
       RETURNING id, subject_public_key`,
      [root]
    );
    if (r.rows.length === 0) return 0;
    await cutAgentAccess(r.rows as Record<string, unknown>[]);
    await appendAuditEvent({
      eventType: 'owned_asset.ai_agents_revoked_all',
      actorHint: 'dashboard',
      subjectPnIdentifier: root,
      metadata: { count: r.rows.length }
    });
    return r.rows.length;
  }

  /**
   * Live delegation for an agent bearer. Null when the agent is unknown, revoked, has no
   * owner-signed statement, the statement expired, or no unexpired `ai:` scope remains.
   */
  static async resolveAgentDelegation(
    agentPn: string,
    now: number = Date.now()
  ): Promise<AiAgentDelegation | null> {
    const subject = normalizePn(agentPn);
    const pool = getDatabasePool();
    const r = await pool.query(
      `SELECT oa.id, oa.root_pn_identifier, oa.delegation_statement, d.scope
       FROM pn_owned_assets oa
       JOIN pn_asset_delegations d ON d.owned_asset_id = oa.id
       WHERE oa.subject_pn_identifier = $1 AND oa.kind = 'ai_agent' AND oa.status = 'active'
         AND d.status = 'active' AND d.delegatee_client_id = $2
         AND (d.expires_at IS NULL OR d.expires_at > NOW())`,
      [subject, AGENT_MCP_CLIENT_ID]
    );
    if (r.rows.length === 0) return null;
    const first = r.rows[0] as Record<string, unknown>;
    const statement = parseAgentDelegationStatement(first.delegation_statement);
    if (!statement || statement.agentPnIdentifier !== subject) return null;
    if (statement.expiresAt && Date.parse(statement.expiresAt) <= now) return null;
    const signed = new Set<string>(statement.scopes);
    const scopes = filterKnownAiScopes(
      (r.rows as Record<string, unknown>[]).map((row) => String(row.scope))
    ).filter((scope) => signed.has(scope));
    if (scopes.length === 0) return null;
    return {
      assetId: String(first.id),
      rootPnIdentifier: String(first.root_pn_identifier),
      scopes,
      attestations: statement.attestations,
      statement
    };
  }
}

/** Accept a statement fresh within this window around the server clock. */
const STATEMENT_MAX_AGE_MS = 15 * 60 * 1000;
const STATEMENT_MAX_SKEW_MS = 5 * 60 * 1000;

function invalid(message: string): Error {
  return Object.assign(new Error(message), { code: 'INVALID_INPUT' });
}

function sameScopeSet(a: readonly string[], b: readonly string[]): boolean {
  const sa = new Set(a);
  const sb = new Set(b);
  return sa.size === sb.size && [...sa].every((s) => sb.has(s));
}

/** Root pN signed exactly this delegation for exactly this agent, recently. */
function verifyAgentStatement(args: {
  raw: unknown;
  signature: string;
  root: string;
  subject: string;
  publicKey: string;
  scopes: string[];
  expiresAt: string | null;
  now: number;
}): AgentDelegationStatement {
  const raw = typeof args.raw === 'string' ? safeJson(args.raw) : args.raw;
  const statement = parseAgentDelegationStatement(raw);
  if (!statement || typeof args.signature !== 'string' || !args.signature) {
    throw invalid('agent_statement_required');
  }
  verifyRootSignedStatement({
    prefix: 'agent',
    root: args.root,
    rootPublicKey: statement.rootPublicKey,
    bytes: canonicalDelegationBytes(statement),
    signature: args.signature,
    issuedAt: statement.issuedAt,
    now: args.now,
    beforeFreshness: () => {
      if (
        statement.agentPnIdentifier !== args.subject ||
        statement.agentPublicKey !== args.publicKey ||
        !sameScopeSet(statement.scopes, args.scopes) ||
        statement.expiresAt !== args.expiresAt
      ) {
        throw invalid('agent_statement_mismatch');
      }
    }
  });
  if (statement.expiresAt && Date.parse(statement.expiresAt) <= args.now) {
    throw invalid('agent_statement_expired');
  }
  return statement;
}

/**
 * The root pN's ML-DSA key signed `bytes`, the key derives `root`, and the statement
 * was issued within the freshness window. Errors are `${prefix}_*` INVALID_INPUT.
 */
export function verifyRootSignedStatement(args: {
  prefix: string;
  root: string;
  rootPublicKey: string;
  bytes: Uint8Array;
  signature: string;
  issuedAt: string;
  now: number;
  beforeFreshness?: () => void;
}): void {
  if (typeof args.signature !== 'string' || !args.signature) {
    throw invalid(`${args.prefix}_statement_required`);
  }
  if (
    !assertMlDsa65PublicKeyB64(args.rootPublicKey) ||
    deriveCanonicalPnIdentifier(args.rootPublicKey) !== normalizePn(args.root)
  ) {
    throw invalid(`${args.prefix}_statement_root_mismatch`);
  }
  let ok = false;
  try {
    ok = mlDsa65Verify(base64ToBytes(args.signature), args.bytes, base64ToBytes(args.rootPublicKey));
  } catch {
    ok = false;
  }
  if (!ok) throw invalid(`${args.prefix}_signature_invalid`);
  args.beforeFreshness?.();
  const issued = Date.parse(args.issuedAt);
  if (issued > args.now + STATEMENT_MAX_SKEW_MS || issued < args.now - STATEMENT_MAX_AGE_MS) {
    throw invalid(`${args.prefix}_statement_stale`);
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface AiAgentRegistration {
  assetId: string;
  subjectPnIdentifier: string;
  delegations: Array<{ id: string; scope: string }>;
  expiresAt: string | null;
}

export interface AiAgentSummary {
  id: string;
  subjectPnIdentifier: string;
  label: string;
  scopes: string[];
  createdAt: string;
}

export interface AiAgentConnector {
  kind: 'local' | 'connector';
  name: string;
  lastUsedAt: string | null;
}

export interface AiAgentDelegation {
  assetId: string;
  rootPnIdentifier: string;
  scopes: string[];
  attestations: AgentAttestation[];
  statement: AgentDelegationStatement;
}

async function cutAgentAccess(rows: Record<string, unknown>[]): Promise<void> {
  const pool = getDatabasePool();
  const ids = rows.map((row) => String(row.id));
  await pool.query(
    `UPDATE pn_asset_delegations SET status = 'revoked', updated_at = NOW()
     WHERE owned_asset_id = ANY($1::uuid[]) AND status = 'active'`,
    [ids]
  );
  const keys = rows
    .map((row) => (row.subject_public_key ? String(row.subject_public_key) : ''))
    .filter(Boolean);
  if (keys.length > 0) {
    // Every agent-class client holding the key: the local CLI and any hosted connector.
    await pool.query(
      `DELETE FROM oauth_refresh_tokens
       WHERE public_key = ANY($1::text[]) AND (client_id = $2 OR client_id LIKE $3)`,
      [keys, AGENT_MCP_CLIENT_ID, `${AGENT_CONNECTOR_CLIENT_ID_PREFIX}%`]
    );
  }
}
