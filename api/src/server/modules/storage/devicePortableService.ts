import {
  defaultDevicePolicy,
  normalizeDevicePolicy,
  type DevicePolicy,
  type DeviceRow
} from '@par-noir/device-auth';
import { JSON_BLOB_PATHS } from '@par-noir/user-owned-storage';
import {
  portableTableAppend,
  portableTableGetByKey,
  portableTableScan
} from './portableTableService';
import { readPortableJsonBlob, writePortableJsonBlob } from './portableJsonBlob';
import { DEVICES_SCHEMA } from './tableSchemas';

export async function listDevicesPortable(
  userPnIdentifier: string,
  accountId?: string,
  includeRevoked = false
): Promise<DeviceRow[]> {
  const rows = await portableTableScan<DeviceRow>(userPnIdentifier, DEVICES_SCHEMA, accountId);
  return rows.filter((d) => d.deviceId && (includeRevoked || d.status === 'active'));
}

export async function getDeviceByIdPortable(
  userPnIdentifier: string,
  deviceId: string,
  accountId?: string
): Promise<DeviceRow | null> {
  return portableTableGetByKey<DeviceRow>(userPnIdentifier, DEVICES_SCHEMA, deviceId, accountId);
}

export async function upsertDevicePortable(
  userPnIdentifier: string,
  row: DeviceRow,
  accountId?: string
): Promise<void> {
  await portableTableAppend(
    userPnIdentifier,
    DEVICES_SCHEMA,
    row as unknown as Record<string, unknown>,
    accountId
  );
}

export async function updatePrivateDisplayPortable(
  userPnIdentifier: string,
  deviceId: string,
  privateDisplay: string,
  accountId?: string
): Promise<void> {
  const row = await getDeviceByIdPortable(userPnIdentifier, deviceId, accountId);
  if (!row || row.status !== 'active') return;
  await upsertDevicePortable(
    userPnIdentifier,
    {
      ...row,
      privateDisplay,
      label: '',
      deviceType: 'other',
      lastSeenAt: '',
    },
    accountId
  );
}

export async function readPolicyPortable(
  userPnIdentifier: string,
  accountId?: string
): Promise<DevicePolicy> {
  const raw = await readPortableJsonBlob<unknown>(
    userPnIdentifier,
    JSON_BLOB_PATHS.devicePolicy,
    accountId
  );
  if (!raw) return defaultDevicePolicy();
  return normalizeDevicePolicy(raw);
}

export async function writePolicyPortable(
  userPnIdentifier: string,
  policy: DevicePolicy,
  accountId?: string
): Promise<void> {
  await writePortableJsonBlob(userPnIdentifier, JSON_BLOB_PATHS.devicePolicy, policy, accountId);
}
