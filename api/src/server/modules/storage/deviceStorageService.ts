/**
 * Device registry: keyed device public keys and the unkeyed-access policy.
 *
 * The API verifies device proofs against these rows, so it owns them in Postgres.
 * Labels and device type ride in `privateDisplay`, sealed by the client.
 */

import {
  defaultDevicePolicy,
  normalizeDevicePolicy,
  type DevicePolicy,
  type DeviceRow
} from '@par-noir/device-auth';
import { getDatabasePool } from '../../utils/database';

export interface DeviceStorageBundle {
  pnIdentifier: string;
}

function normalizePn(pn: string): string {
  return pn.startsWith('pn-') ? pn : `pn-${pn}`;
}

let tablesReady: Promise<void> | null = null;

export function ensureDeviceRegistryTables(): Promise<void> {
  if (!tablesReady) {
    const db = getDatabasePool();
    tablesReady = (async () => {
      await db.query(`
        CREATE TABLE IF NOT EXISTS device_registry (
          pn_identifier VARCHAR(255) NOT NULL,
          device_id VARCHAR(255) NOT NULL,
          row JSONB NOT NULL,
          status VARCHAR(16) NOT NULL,
          updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          PRIMARY KEY (pn_identifier, device_id)
        )
      `);
      await db.query(`
        CREATE TABLE IF NOT EXISTS device_policy (
          pn_identifier VARCHAR(255) PRIMARY KEY,
          policy JSONB NOT NULL,
          updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        )
      `);
    })().catch((error) => {
      tablesReady = null;
      throw error;
    });
  }
  return tablesReady;
}

export async function loadDeviceBundle(pn: string): Promise<DeviceStorageBundle> {
  return { pnIdentifier: normalizePn(pn) };
}

export async function listDevices(
  bundle: DeviceStorageBundle,
  includeRevoked = false
): Promise<DeviceRow[]> {
  await ensureDeviceRegistryTables();
  const result = await getDatabasePool().query(
    `SELECT row FROM device_registry
       WHERE pn_identifier = $1 AND ($2::boolean OR status = 'active')
       ORDER BY row->>'createdAt'`,
    [bundle.pnIdentifier, includeRevoked]
  );
  return result.rows.map((r) => r.row as DeviceRow);
}

export async function getDeviceById(
  bundle: DeviceStorageBundle,
  deviceId: string
): Promise<DeviceRow | null> {
  await ensureDeviceRegistryTables();
  const result = await getDatabasePool().query(
    'SELECT row FROM device_registry WHERE pn_identifier = $1 AND device_id = $2',
    [bundle.pnIdentifier, deviceId]
  );
  return (result.rows[0]?.row as DeviceRow | undefined) ?? null;
}

export async function upsertDevice(bundle: DeviceStorageBundle, row: DeviceRow): Promise<void> {
  await ensureDeviceRegistryTables();
  await getDatabasePool().query(
    `INSERT INTO device_registry (pn_identifier, device_id, row, status, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (pn_identifier, device_id)
       DO UPDATE SET row = EXCLUDED.row, status = EXCLUDED.status, updated_at = NOW()`,
    [bundle.pnIdentifier, row.deviceId, JSON.stringify(row), row.status]
  );
}

export async function updateDevicePrivateDisplay(
  bundle: DeviceStorageBundle,
  deviceId: string,
  privateDisplay: string
): Promise<void> {
  const row = await getDeviceById(bundle, deviceId);
  if (!row) return;
  await upsertDevice(bundle, { ...row, privateDisplay });
}

export async function readPolicy(bundle: DeviceStorageBundle): Promise<DevicePolicy> {
  await ensureDeviceRegistryTables();
  const result = await getDatabasePool().query(
    'SELECT policy FROM device_policy WHERE pn_identifier = $1',
    [bundle.pnIdentifier]
  );
  const raw = result.rows[0]?.policy;
  return raw ? normalizeDevicePolicy(raw) : defaultDevicePolicy();
}

export async function writePolicy(bundle: DeviceStorageBundle, policy: DevicePolicy): Promise<void> {
  await ensureDeviceRegistryTables();
  await getDatabasePool().query(
    `INSERT INTO device_policy (pn_identifier, policy, updated_at) VALUES ($1, $2, NOW())
     ON CONFLICT (pn_identifier) DO UPDATE SET policy = EXCLUDED.policy, updated_at = NOW()`,
    [bundle.pnIdentifier, JSON.stringify(policy)]
  );
}

/**
 * One-time import of the registry a device kept in its own cloud before the API owned it.
 * Only allowed while the API has no rows for this pN, which is the same trust level as
 * keying a first device.
 */
export async function importDeviceRegistry(
  bundle: DeviceStorageBundle,
  devices: DeviceRow[],
  policy: DevicePolicy | null
): Promise<{ imported: number } | { refused: 'registry_not_empty' }> {
  const existing = await listDevices(bundle, true);
  if (existing.length > 0) return { refused: 'registry_not_empty' };
  for (const row of devices) {
    await upsertDevice(bundle, row);
  }
  if (policy) await writePolicy(bundle, normalizeDevicePolicy(policy));
  return { imported: devices.length };
}

/** Revoke every active device and clear firstDeviceKeyedAt (registry reset). */
export async function resetDeviceRegistry(bundle: DeviceStorageBundle): Promise<{ revoked: number }> {
  const active = await listDevices(bundle, false);
  for (const row of active) {
    await upsertDevice(bundle, { ...row, status: 'revoked' });
  }
  const policy = await readPolicy(bundle);
  const next = {
    ...defaultDevicePolicy(),
    unkeyedAllows: policy.unkeyedAllows?.length
      ? policy.unkeyedAllows
      : defaultDevicePolicy().unkeyedAllows,
  };
  delete (next as { firstDeviceKeyedAt?: string }).firstDeviceKeyedAt;
  await writePolicy(bundle, next);
  return { revoked: active.length };
}
