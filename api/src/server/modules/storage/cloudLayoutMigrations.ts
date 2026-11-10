/**
 * Owner cloud layout versioning — additive migrations under indexed resources.
 * Distinct from pnDriveIndex.schemaVersion (index object shape). The device runs
 * each migration against its own cloud; the API only records which ones are applied.
 */

import { normalizePnIdentifier } from '../integratorStoragePaths';
import { storageCredentialsService } from '../storageCredentialsService';

export const CURRENT_CLOUD_LAYOUT_VERSION = 2 as const;

export const MIGRATION_INBOX_CHANNEL_CLIENT_ID_V1 = 'inbox_channel_client_id_v1' as const;
export const MIGRATION_ROOT_BLOBS_OUT_OF_PN_ROOT_V2 = 'root_blobs_out_of_pn_root_v2' as const;

export type CloudLayoutMigrationId =
  | typeof MIGRATION_INBOX_CHANNEL_CLIENT_ID_V1
  | typeof MIGRATION_ROOT_BLOBS_OUT_OF_PN_ROOT_V2;

export type CloudLayoutPending = { id: string; description: string };

export type CloudLayoutStatus = {
  current: number;
  required: number;
  pending: CloudLayoutPending[];
  complete: boolean;
  appliedMigrations: string[];
};

export type CloudLayoutMigration = {
  id: CloudLayoutMigrationId;
  /** Layout version after this migration is applied. */
  version: number;
  description: string;
};

export const CLOUD_LAYOUT_MIGRATIONS: CloudLayoutMigration[] = [
  {
    id: MIGRATION_INBOX_CHANNEL_CLIENT_ID_V1,
    version: 1,
    description: 'Inbox channel threads: channelClientId column / portable inboxRowKey',
  },
  {
    id: MIGRATION_ROOT_BLOBS_OUT_OF_PN_ROOT_V2,
    version: 2,
    description: 'Move loose files out of the pN root into files/, content/, and par-noir-pen/',
  },
];

export function allMigrationIds(): string[] {
  return CLOUD_LAYOUT_MIGRATIONS.map((m) => m.id);
}

export function readAppliedMigrations(credentials: Record<string, unknown> | null | undefined): string[] {
  const raw = credentials?.appliedMigrations;
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === 'string' && !!x.trim());
}

export function readCloudLayoutVersion(credentials: Record<string, unknown> | null | undefined): number {
  const v = credentials?.cloudLayoutVersion;
  if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return Math.floor(v);
  return 0;
}

/** Stamp credentials as current after full init (no Drive I/O). */
export function stampCloudLayoutCurrent(credentials: Record<string, unknown>): void {
  credentials.cloudLayoutVersion = CURRENT_CLOUD_LAYOUT_VERSION;
  credentials.appliedMigrations = [...allMigrationIds()];
}

export function getLayoutStatus(
  credentials: Record<string, unknown> | null | undefined
): CloudLayoutStatus {
  const applied = readAppliedMigrations(credentials);
  const appliedSet = new Set(applied);
  const pending = CLOUD_LAYOUT_MIGRATIONS.filter((m) => !appliedSet.has(m.id)).map((m) => ({
    id: m.id,
    description: m.description,
  }));
  const current = readCloudLayoutVersion(credentials);
  return {
    current,
    required: CURRENT_CLOUD_LAYOUT_VERSION,
    pending,
    complete: pending.length === 0,
    appliedMigrations: applied,
  };
}

/** Falsifiable: returns true only when every catalog migration id is applied. */
export function isCloudLayoutCurrent(credentials: Record<string, unknown> | null | undefined): boolean {
  return getLayoutStatus(credentials).complete;
}

export function getPendingMigrations(
  credentials: Record<string, unknown> | null | undefined
): CloudLayoutMigration[] {
  const applied = new Set(readAppliedMigrations(credentials));
  return CLOUD_LAYOUT_MIGRATIONS.filter((m) => !applied.has(m.id));
}

export async function persistAppliedMigration(
  pnIdentifier: string,
  migrationId: string,
  version: number
): Promise<Record<string, unknown>> {
  const normalized = normalizePnIdentifier(pnIdentifier);
  const record = await storageCredentialsService.getCredentials(normalized);
  if (!record?.credentials) {
    throw new Error('No storage credentials');
  }
  const credentials = { ...(record.credentials as Record<string, unknown>) };
  const applied = readAppliedMigrations(credentials);
  if (!applied.includes(migrationId)) {
    applied.push(migrationId);
  }
  credentials.appliedMigrations = applied;
  const prev = readCloudLayoutVersion(credentials);
  credentials.cloudLayoutVersion = Math.max(prev, version);
  await storageCredentialsService.upsertCredentials(normalized, credentials, record.cid ?? undefined);
  return credentials;
}

/** Resolve layout status from DB (no Drive writes). */
export async function loadCloudLayoutStatus(pnIdentifier: string): Promise<CloudLayoutStatus | null> {
  const normalized = normalizePnIdentifier(pnIdentifier);
  const record = await storageCredentialsService.getCredentials(normalized);
  if (!record?.credentials) return null;
  return getLayoutStatus(record.credentials as Record<string, unknown>);
}

/**
 * Record one migration after the device executed it locally (no Drive on server).
 */
export async function commitCloudLayoutMigration(
  pnIdentifier: string,
  migrationId: string
): Promise<CloudLayoutStatus> {
  const normalized = normalizePnIdentifier(pnIdentifier);
  const record = await storageCredentialsService.getCredentials(normalized);
  if (!record?.credentials) {
    throw Object.assign(new Error('No storage credentials'), { code: 'DRIVE_NOT_INITIALIZED' });
  }
  const credentials = record.credentials as Record<string, unknown>;
  const pending = getPendingMigrations(credentials);
  if (pending.length === 0) {
    return getLayoutStatus(credentials);
  }
  const next = pending[0];
  if (next.id !== migrationId) {
    throw Object.assign(
      new Error(`Expected next migration ${next.id}, got ${migrationId}`),
      { code: 'MIGRATION_ORDER' }
    );
  }
  const known = CLOUD_LAYOUT_MIGRATIONS.find((m) => m.id === migrationId);
  if (!known) {
    throw Object.assign(new Error(`Unknown migration ${migrationId}`), { code: 'MIGRATION_UNKNOWN' });
  }
  const updated = await persistAppliedMigration(normalized, migrationId, known.version);
  return getLayoutStatus(updated);
}
