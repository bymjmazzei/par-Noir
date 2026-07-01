import type { DevicePolicy, DeviceRow } from '@par-noir/device-auth';
import { DeviceSheetsService } from '../deviceSheetsService';
import { getOwnerStorageContext } from './ownerStorageContext';
import {
  getDeviceByIdPortable,
  listDevicesPortable,
  readPolicyPortable,
  updateLastSeenPortable,
  upsertDevicePortable,
  writePolicyPortable
} from './devicePortableService';

export interface DeviceStorageBundle {
  pnIdentifier: string;
  accountId?: string;
  isPortable: boolean;
  spreadsheetId?: string;
  metadataFolderId?: string;
  token?: { access_token: string };
}

export async function loadDeviceBundle(pn: string): Promise<DeviceStorageBundle | null> {
  const ctx = await getOwnerStorageContext(pn);
  if (!ctx) return null;

  if (ctx.kind === 'portable') {
    return {
      pnIdentifier: ctx.pnIdentifier,
      accountId: ctx.accountId,
      isPortable: true
    };
  }

  const { loadPnDriveIndex, getSheetIdFromIndex, PN_DRIVE_SHEET_KEYS } = await import('../pnDriveIndex');
  const index = await loadPnDriveIndex(ctx.pnIdentifier);
  if (!index) return null;
  const spreadsheetId = getSheetIdFromIndex(index, PN_DRIVE_SHEET_KEYS.DEVICES);

  return {
    pnIdentifier: ctx.pnIdentifier,
    accountId: ctx.accountId,
    isPortable: false,
    spreadsheetId,
    metadataFolderId: ctx.metadataFolderId,
    token: ctx.token
  };
}

export async function listDevices(
  bundle: DeviceStorageBundle,
  includeRevoked = false
): Promise<DeviceRow[]> {
  if (bundle.isPortable) {
    return listDevicesPortable(bundle.pnIdentifier, bundle.accountId, includeRevoked);
  }
  return DeviceSheetsService.listDevices(
    bundle.token!,
    bundle.spreadsheetId!,
    bundle.pnIdentifier,
    bundle.accountId,
    includeRevoked
  );
}

export async function getDeviceById(
  bundle: DeviceStorageBundle,
  deviceId: string
): Promise<DeviceRow | null> {
  if (bundle.isPortable) {
    return getDeviceByIdPortable(bundle.pnIdentifier, deviceId, bundle.accountId);
  }
  return DeviceSheetsService.getDeviceById(
    bundle.token!,
    bundle.spreadsheetId!,
    deviceId,
    bundle.pnIdentifier,
    bundle.accountId
  );
}

export async function upsertDevice(bundle: DeviceStorageBundle, row: DeviceRow): Promise<void> {
  if (bundle.isPortable) {
    await upsertDevicePortable(bundle.pnIdentifier, row, bundle.accountId);
    return;
  }
  await DeviceSheetsService.upsertDevice(
    bundle.token!,
    bundle.spreadsheetId!,
    row,
    bundle.pnIdentifier,
    bundle.accountId
  );
}

export async function updateLastSeen(bundle: DeviceStorageBundle, deviceId: string): Promise<void> {
  if (bundle.isPortable) {
    await updateLastSeenPortable(bundle.pnIdentifier, deviceId, bundle.accountId);
    return;
  }
  await DeviceSheetsService.updateLastSeen(
    bundle.token!,
    bundle.spreadsheetId!,
    deviceId,
    bundle.pnIdentifier,
    bundle.accountId
  );
}

export async function readPolicy(bundle: DeviceStorageBundle): Promise<DevicePolicy> {
  if (bundle.isPortable) {
    return readPolicyPortable(bundle.pnIdentifier, bundle.accountId);
  }
  return DeviceSheetsService.readPolicy(
    bundle.token!,
    bundle.metadataFolderId!,
    bundle.pnIdentifier,
    bundle.accountId
  );
}

export async function writePolicy(bundle: DeviceStorageBundle, policy: DevicePolicy): Promise<void> {
  if (bundle.isPortable) {
    await writePolicyPortable(bundle.pnIdentifier, policy, bundle.accountId);
    return;
  }
  await DeviceSheetsService.writePolicy(
    bundle.token!,
    bundle.metadataFolderId!,
    policy,
    bundle.pnIdentifier,
    bundle.accountId
  );
}
