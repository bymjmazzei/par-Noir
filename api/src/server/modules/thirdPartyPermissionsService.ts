/**
 * Third-party grants and the ZK proofs released under them.
 *
 * A grant is an authorization decision the API enforces (consent skip, data-point
 * reads), so the API owns it in Postgres. Proofs are released by the owner's
 * device: the server never reads them out of the user's cloud. Only proofs for
 * data points granted to at least one active client are kept.
 */

import type { DataPointLevels } from '@par-noir/standard-data-points';
import { getDatabasePool } from '../utils/database';

export interface ThirdPartyPermission {
  toolId: string;
  toolName: string;
  toolDescription: string;
  permissions: string[];
  dataPoints: string[];
  requiredDataPoints: string[];
  optionalDataPoints: string[];
  /** Min verification level per data point id. Omitted id ⇒ attested. */
  dataPointLevels?: DataPointLevels;
  /** Consent manifest shown at unlock (labels + rationales). */
  permissionManifest?: import('@par-noir/standard-data-points').IntegratorPermissionManifest;
  grantedAt: string;
  expiresAt?: string;
  status: 'active' | 'pending' | 'revoked';
}

export interface ReleasedProof {
  dataPointId: string;
  proofType: string;
  zkpProof: string;
  verifiedAt: string;
  expiresAt?: string;
  verificationLevel: 'basic' | 'enhanced' | 'verified';
  provider?: string;
}

function normalizePn(pn: string): string {
  return pn.startsWith('pn-') ? pn : `pn-${pn}`;
}

let tablesReady: Promise<void> | null = null;

function ensureTables(): Promise<void> {
  if (!tablesReady) {
    const db = getDatabasePool();
    tablesReady = (async () => {
      await db.query(`
        CREATE TABLE IF NOT EXISTS third_party_grants (
          pn_identifier VARCHAR(255) NOT NULL,
          client_id VARCHAR(255) NOT NULL,
          permission JSONB NOT NULL,
          status VARCHAR(16) NOT NULL,
          updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          PRIMARY KEY (pn_identifier, client_id)
        )
      `);
      await db.query(`
        CREATE TABLE IF NOT EXISTS released_proofs (
          pn_identifier VARCHAR(255) NOT NULL,
          data_point_id VARCHAR(255) NOT NULL,
          proof JSONB NOT NULL,
          released_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          PRIMARY KEY (pn_identifier, data_point_id)
        )
      `);
    })().catch((error) => {
      tablesReady = null;
      throw error;
    });
  }
  return tablesReady;
}

function isReleasedProof(value: unknown): value is ReleasedProof {
  const p = value as ReleasedProof;
  return (
    !!p &&
    typeof p === 'object' &&
    typeof p.dataPointId === 'string' &&
    p.dataPointId.length > 0 &&
    typeof p.zkpProof === 'string' &&
    p.zkpProof.length > 0 &&
    typeof p.verifiedAt === 'string' &&
    (p.verificationLevel === 'basic' ||
      p.verificationLevel === 'enhanced' ||
      p.verificationLevel === 'verified')
  );
}

/** Data points the user has shared with at least one active client. */
function grantedDataPointIds(permissions: Record<string, ThirdPartyPermission>): Set<string> {
  const out = new Set<string>();
  for (const permission of Object.values(permissions)) {
    if (permission.status !== 'active') continue;
    for (const id of [...(permission.dataPoints || []), ...(permission.requiredDataPoints || [])]) {
      out.add(id);
    }
  }
  return out;
}

export class ThirdPartyPermissionsService {
  static async getPermissions(pnIdentifier: string): Promise<Record<string, ThirdPartyPermission>> {
    await ensureTables();
    const result = await getDatabasePool().query(
      'SELECT client_id, permission FROM third_party_grants WHERE pn_identifier = $1',
      [normalizePn(pnIdentifier)]
    );
    const out: Record<string, ThirdPartyPermission> = {};
    for (const row of result.rows) {
      out[row.client_id] = row.permission as ThirdPartyPermission;
    }
    return out;
  }

  static async getPermission(
    pnIdentifier: string,
    clientId: string
  ): Promise<ThirdPartyPermission | null> {
    await ensureTables();
    const result = await getDatabasePool().query(
      'SELECT permission FROM third_party_grants WHERE pn_identifier = $1 AND client_id = $2',
      [normalizePn(pnIdentifier), clientId]
    );
    return (result.rows[0]?.permission as ThirdPartyPermission | undefined) || null;
  }

  static async storePermission(
    pnIdentifier: string,
    permission: ThirdPartyPermission
  ): Promise<void> {
    await ensureTables();
    const pn = normalizePn(pnIdentifier);
    await getDatabasePool().query(
      `INSERT INTO third_party_grants (pn_identifier, client_id, permission, status, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (pn_identifier, client_id)
       DO UPDATE SET permission = EXCLUDED.permission, status = EXCLUDED.status, updated_at = NOW()`,
      [pn, permission.toolId, JSON.stringify(permission), permission.status]
    );
    await this.pruneReleasedProofs(pn);
  }

  static async revokePermission(pnIdentifier: string, clientId: string): Promise<void> {
    const existing = await this.getPermission(pnIdentifier, clientId);
    if (!existing) return;
    await this.storePermission(pnIdentifier, { ...existing, status: 'revoked' });
  }

  /**
   * Store proofs the owner's device released. `replace` swaps the whole set for
   * what the device holds now; otherwise the given proofs are upserted. Proofs
   * for data points nobody was granted are dropped rather than stored.
   */
  static async releaseProofs(
    pnIdentifier: string,
    proofs: unknown[],
    opts: { replace: boolean } = { replace: true }
  ): Promise<number> {
    await ensureTables();
    const pn = normalizePn(pnIdentifier);
    const granted = grantedDataPointIds(await this.getPermissions(pn));
    const now = Date.now();
    const byId = new Map<string, ReleasedProof>();
    for (const candidate of proofs) {
      if (!isReleasedProof(candidate) || !granted.has(candidate.dataPointId)) continue;
      if (candidate.expiresAt && new Date(candidate.expiresAt).getTime() < now) continue;
      if (byId.has(candidate.dataPointId)) continue;
      byId.set(candidate.dataPointId, {
        dataPointId: candidate.dataPointId,
        proofType: String(candidate.proofType || ''),
        zkpProof: candidate.zkpProof,
        verifiedAt: candidate.verifiedAt,
        expiresAt: candidate.expiresAt,
        verificationLevel: candidate.verificationLevel,
        provider: candidate.provider ? String(candidate.provider) : undefined,
      });
    }

    const db = getDatabasePool();
    if (opts.replace) {
      await db.query('DELETE FROM released_proofs WHERE pn_identifier = $1', [pn]);
    }
    for (const proof of byId.values()) {
      await db.query(
        `INSERT INTO released_proofs (pn_identifier, data_point_id, proof, released_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (pn_identifier, data_point_id)
         DO UPDATE SET proof = EXCLUDED.proof, released_at = NOW()`,
        [pn, proof.dataPointId, JSON.stringify(proof)]
      );
    }
    return byId.size;
  }

  static async getReleasedProofs(pnIdentifier: string): Promise<ReleasedProof[]> {
    await ensureTables();
    const result = await getDatabasePool().query(
      'SELECT proof FROM released_proofs WHERE pn_identifier = $1',
      [normalizePn(pnIdentifier)]
    );
    const now = Date.now();
    return result.rows
      .map((row) => row.proof as ReleasedProof)
      .filter((p) => !p.expiresAt || new Date(p.expiresAt).getTime() >= now);
  }

  /** Drop proofs whose data point no active grant covers any more. */
  private static async pruneReleasedProofs(pn: string): Promise<void> {
    const granted = [...grantedDataPointIds(await this.getPermissions(pn))];
    await getDatabasePool().query(
      'DELETE FROM released_proofs WHERE pn_identifier = $1 AND NOT (data_point_id = ANY($2::text[]))',
      [pn, granted]
    );
  }
}
