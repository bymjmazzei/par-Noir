/**
 * Owner cloud layout version status + upgrade (dashboard).
 */

import {
  MIGRATION_INBOX_CHANNEL_CLIENT_ID_V1,
  getCloudAccessTokenFromSession,
  normalizeInboxKeysOnTables,
  resolveTablesSocialContext,
  runDeviceCloudLayoutMigration,
  type DeviceDriveLayout,
} from '@par-noir/device-cloud-credentials';
import { API_ENDPOINT } from '../config/api';
import { deviceProofHeaders } from './deviceProofContext';
import { ownerFetch } from './ownerApiService';
import { sessionDriveFor } from './sessionDrive';

export type CloudLayoutPending = { id: string; description: string };

export type CloudLayoutStatus = {
  identityId?: string;
  current: number;
  required: number;
  pending: CloudLayoutPending[];
  complete: boolean;
  appliedMigrations: string[];
};

/**
 * Status is credentials-only — do not require X-PN-Cloud-Access-Token.
 * Null when there is nothing to update: no storage connected (404) or the read failed.
 */
export async function fetchCloudLayoutStatus(
  authToken: string,
  pnIdentifier: string
): Promise<CloudLayoutStatus | null> {
  const path = `/api/storage/${encodeURIComponent(pnIdentifier)}/layout/status`;
  const proof = await deviceProofHeaders('GET', path);
  const res = await fetch(`${API_ENDPOINT}${path}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`,
      ...proof,
    },
  });
  if (!res.ok) return null;
  return (await res.json()) as CloudLayoutStatus;
}

function parseLayoutStatusBody(
  body: CloudLayoutStatus & { error?: string; message?: string; error_description?: string }
): CloudLayoutStatus {
  return {
    current: body.current ?? 0,
    required: body.required ?? 1,
    pending: body.pending ?? [],
    complete: body.complete === true,
    appliedMigrations: body.appliedMigrations ?? [],
    identityId: body.identityId,
  };
}

/** Commit migration metadata — dedicated route, with initialize fallback for older API hosts. */
async function commitCloudLayoutMigration(
  authToken: string,
  pnIdentifier: string,
  migrationId: string
): Promise<CloudLayoutStatus> {
  const commitPath = `/api/storage/${encodeURIComponent(pnIdentifier)}/layout/commit-migration`;
  let res = await ownerFetch(authToken, 'POST', commitPath, { migrationId }, { pnIdentifier });

  if (res.status === 404) {
    res = await ownerFetch(
      authToken,
      'POST',
      `/api/storage/initialize/${encodeURIComponent(pnIdentifier)}`,
      { layoutMigrationCommit: migrationId },
      { pnIdentifier }
    );
  }

  const body = (await res.json().catch(() => ({}))) as CloudLayoutStatus & {
    error?: string;
    message?: string;
    error_description?: string;
  };
  if (!res.ok) {
    throw new Error(
      body.message || body.error_description || body.error || `Layout commit failed (${res.status})`
    );
  }
  return parseLayoutStatusBody(body);
}

async function resubmitIndexForLayoutStamp(
  authToken: string,
  pnIdentifier: string,
  index: DeviceDriveLayout
): Promise<void> {
  const initRes = await ownerFetch(
    authToken,
    'POST',
    `/api/storage/initialize/${encodeURIComponent(pnIdentifier)}`,
    { pnDriveIndex: index },
    { pnIdentifier }
  );
  if (!initRes.ok) {
    const errText = await initRes.text().catch(() => '');
    throw new Error(errText || `Failed to persist Drive index (${initRes.status})`);
  }
}

export async function upgradeCloudLayout(
  authToken: string,
  pnIdentifier: string
): Promise<CloudLayoutStatus> {
  const status = await fetchCloudLayoutStatus(authToken, pnIdentifier);
  if (!status || status.complete) {
    return (
      status ?? {
        current: 0,
        required: 1,
        pending: [],
        complete: true,
        appliedMigrations: [],
      }
    );
  }

  const tables = await resolveTablesSocialContext(pnIdentifier);
  if (tables) {
    let latest = status;
    for (const pending of status.pending) {
      if (pending.id === MIGRATION_INBOX_CHANNEL_CLIENT_ID_V1) {
        await normalizeInboxKeysOnTables(tables);
      }
      latest = await commitCloudLayoutMigration(authToken, pnIdentifier, pending.id);
    }
    return latest;
  }

  if (!getCloudAccessTokenFromSession(pnIdentifier)) {
    throw new Error('Reconnect Google Drive on this device to complete the cloud layout update.');
  }

  const drive = await sessionDriveFor(pnIdentifier, authToken);
  let index: DeviceDriveLayout = drive.index;

  const persistIndex = async (next: DeviceDriveLayout) => {
    index = next;
    await resubmitIndexForLayoutStamp(authToken, pnIdentifier, next);
  };

  let latest = status;
  for (const pending of status.pending) {
    await runDeviceCloudLayoutMigration({
      migrationId: pending.id,
      accessToken: drive.accessToken,
      index,
      persistIndex,
    });
    const afterDevice = await fetchCloudLayoutStatus(authToken, pnIdentifier);
    if (afterDevice?.complete) {
      latest = afterDevice;
      continue;
    }
    try {
      latest = await commitCloudLayoutMigration(authToken, pnIdentifier, pending.id);
    } catch (commitErr) {
      await resubmitIndexForLayoutStamp(authToken, pnIdentifier, index);
      const afterStamp = await fetchCloudLayoutStatus(authToken, pnIdentifier);
      if (afterStamp?.complete) {
        latest = afterStamp;
        continue;
      }
      throw commitErr;
    }
  }

  const finalStatus = await fetchCloudLayoutStatus(authToken, pnIdentifier);
  return finalStatus?.complete ? finalStatus : latest;
}
