/**
 * Product sheets the API no longer opens: notifications, followers, preferences,
 * ZKP points, message requests, and the recovery workbook.
 */

import { deviceDriveCall } from './deviceDriveCall.js';
import { readSheetValues, writeSheetValues } from './deviceSheet.js';

export type DeviceNotification = {
  notification_id: string;
  user_pn_identifier: string;
  type: string;
  title: string;
  message: string;
  data: Record<string, unknown>;
  read: boolean;
  created_at: string;
};

export async function listDeviceNotifications(
  accessToken: string,
  spreadsheetId: string,
  fetchImpl?: typeof fetch
): Promise<DeviceNotification[]> {
  const rows = await readSheetValues(accessToken, spreadsheetId, 'Notifications!A2:H', fetchImpl);
  return rows
    .filter((row) => row[0])
    .map((row) => {
      let data: Record<string, unknown> = {};
      try {
        if (row[5]) data = JSON.parse(row[5]) as Record<string, unknown>;
      } catch {
        data = {};
      }
      return {
        notification_id: row[0],
        user_pn_identifier: row[1] || '',
        type: row[2] || 'new_message',
        title: row[3] || '',
        message: row[4] || '',
        data,
        read: row[6] === 'TRUE' || row[6] === 'true',
        created_at: row[7] || '',
      };
    });
}

export async function markDeviceNotificationsRead(
  accessToken: string,
  spreadsheetId: string,
  ids: string[] | 'all',
  fetchImpl?: typeof fetch
): Promise<number> {
  const rows = await readSheetValues(accessToken, spreadsheetId, 'Notifications!A2:H', fetchImpl);
  let marked = 0;
  const next = rows.map((row) => {
    const id = row[0] || '';
    const hit = ids === 'all' || ids.includes(id);
    if (!hit) return row;
    if (row[6] === 'TRUE' || row[6] === 'true') return row;
    marked += 1;
    const copy = [...row];
    while (copy.length < 8) copy.push('');
    copy[6] = 'TRUE';
    return copy;
  });
  if (marked > 0) {
    await writeSheetValues(accessToken, spreadsheetId, 'Notifications!A2:H', next, fetchImpl);
  }
  return marked;
}

export type DeviceFollower = {
  followerPnIdentifier: string;
  followedAt: string;
  feedId?: string;
};

export async function listDeviceFollowers(
  accessToken: string,
  spreadsheetId: string,
  fetchImpl?: typeof fetch
): Promise<DeviceFollower[]> {
  const rows = await readSheetValues(accessToken, spreadsheetId, 'Followers!A2:C', fetchImpl);
  return rows
    .filter((row) => row[0])
    .map((row) => ({
      followerPnIdentifier: row[0].startsWith('pn-') ? row[0] : `pn-${row[0]}`,
      followedAt: row[1] || '',
      feedId: row[2] || undefined,
    }));
}

export type DeviceFollowing = {
  targetType: 'user' | 'feed';
  targetPnIdentifier: string;
  followedAt: string;
};

export async function listDeviceFollowing(
  accessToken: string,
  spreadsheetId: string,
  fetchImpl?: typeof fetch
): Promise<DeviceFollowing[]> {
  const rows = await readSheetValues(accessToken, spreadsheetId, 'Following!A2:C', fetchImpl);
  return rows
    .filter((row) => row[1])
    .map((row) => ({
      targetType: row[0] === 'feed' ? 'feed' : 'user',
      targetPnIdentifier: row[1],
      followedAt: row[2] || '',
    }));
}

export async function removeDeviceFollowing(
  accessToken: string,
  spreadsheetId: string,
  targetPnIdentifier: string,
  fetchImpl?: typeof fetch
): Promise<void> {
  const rows = await readSheetValues(accessToken, spreadsheetId, 'Following!A2:C', fetchImpl);
  const next = rows.filter((row) => row[1] !== targetPnIdentifier);
  await writeSheetValues(
    accessToken,
    spreadsheetId,
    'Following!A2:C',
    next.length ? next : [['', '', '']],
    fetchImpl
  );
}

export async function upsertDeviceFollowing(
  accessToken: string,
  spreadsheetId: string,
  targetType: 'user' | 'feed',
  targetId: string,
  fetchImpl?: typeof fetch
): Promise<void> {
  const rows = await readSheetValues(accessToken, spreadsheetId, 'Following!A2:C', fetchImpl);
  const kept = rows.filter((row) => row[1] && row[1] !== targetId);
  kept.push([targetType, targetId, new Date().toISOString()]);
  await writeSheetValues(accessToken, spreadsheetId, 'Following!A2:C', kept, fetchImpl);
}

async function listDeviceEngagementFileIds(
  accessToken: string,
  spreadsheetId: string,
  tab: 'Likes' | 'Dislikes',
  fetchImpl?: typeof fetch
): Promise<string[]> {
  const rows = await readSheetValues(accessToken, spreadsheetId, `${tab}!A2:B`, fetchImpl);
  return rows.map((row) => row[0]).filter((id) => Boolean(id));
}

async function setDeviceEngagementFile(
  accessToken: string,
  spreadsheetId: string,
  tab: 'Likes' | 'Dislikes',
  fileId: string,
  present: boolean,
  fetchImpl?: typeof fetch
): Promise<void> {
  const rows = await readSheetValues(accessToken, spreadsheetId, `${tab}!A2:B`, fetchImpl);
  const kept = rows.filter((row) => row[0] && row[0] !== fileId);
  if (present) kept.push([fileId, new Date().toISOString()]);
  await writeSheetValues(
    accessToken,
    spreadsheetId,
    `${tab}!A2:B`,
    kept.length ? kept : [['', '']],
    fetchImpl
  );
}

export function listDeviceLikedFileIds(
  accessToken: string,
  spreadsheetId: string,
  fetchImpl?: typeof fetch
): Promise<string[]> {
  return listDeviceEngagementFileIds(accessToken, spreadsheetId, 'Likes', fetchImpl);
}

export function setDeviceFileLiked(
  accessToken: string,
  spreadsheetId: string,
  fileId: string,
  liked: boolean,
  fetchImpl?: typeof fetch
): Promise<void> {
  return setDeviceEngagementFile(accessToken, spreadsheetId, 'Likes', fileId, liked, fetchImpl);
}

export function listDeviceDislikedFileIds(
  accessToken: string,
  spreadsheetId: string,
  fetchImpl?: typeof fetch
): Promise<string[]> {
  return listDeviceEngagementFileIds(accessToken, spreadsheetId, 'Dislikes', fetchImpl);
}

export function setDeviceFileDisliked(
  accessToken: string,
  spreadsheetId: string,
  fileId: string,
  disliked: boolean,
  fetchImpl?: typeof fetch
): Promise<void> {
  return setDeviceEngagementFile(accessToken, spreadsheetId, 'Dislikes', fileId, disliked, fetchImpl);
}

export async function readDevicePreferences(
  accessToken: string,
  spreadsheetId: string,
  fetchImpl?: typeof fetch
): Promise<Record<string, unknown> | null> {
  const rows = await readSheetValues(accessToken, spreadsheetId, 'Current!A2:B', fetchImpl);
  const row = rows.find((r) => r[0] === 'preferences') || rows[0];
  if (!row?.[1]) return null;
  try {
    return JSON.parse(row[1]) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function writeDevicePreferences(
  accessToken: string,
  spreadsheetId: string,
  preferences: Record<string, unknown>,
  fetchImpl?: typeof fetch
): Promise<void> {
  await writeSheetValues(
    accessToken,
    spreadsheetId,
    'Current!A2:B2',
    [['preferences', JSON.stringify(preferences)]],
    fetchImpl
  );
}

export type DeviceZkpPoint = {
  dataPointId: string;
  proofType: string;
  zkpProof: string;
  signature: string;
  verifiedAt: string;
  expiresAt?: string;
  verificationLevel: string;
  metadata: { provider: string; fraudPreventionScore?: number };
  encryptedUserData?: string;
};

export async function listDeviceZkpPoints(
  accessToken: string,
  spreadsheetId: string,
  fetchImpl?: typeof fetch
): Promise<DeviceZkpPoint[]> {
  const rows = await readSheetValues(accessToken, spreadsheetId, 'Data Points!A2:L', fetchImpl);
  return rows
    .filter((row) => row[0])
    .map((row) => ({
      dataPointId: row[0],
      proofType: row[1] || '',
      zkpProof: row[2] || '',
      signature: row[3] || '',
      verifiedAt: row[4] || '',
      expiresAt: row[5] || undefined,
      verificationLevel: row[6] || 'basic',
      metadata: {
        provider: row[7] || '',
        fraudPreventionScore: row[8] ? Number(row[8]) : undefined,
      },
      encryptedUserData: row[9] || undefined,
    }));
}

export type DeviceMessageRequest = {
  requestId: string;
  fromPnIdentifier: string;
  toPnIdentifier: string;
  content: string;
  status: string;
  timestamp: string;
  kemCiphertext?: string;
  cryptoVersion?: number;
};

export async function markDeviceMessageRead(
  accessToken: string,
  spreadsheetId: string,
  messageId: string,
  fetchImpl?: typeof fetch
): Promise<void> {
  const rows = await readSheetValues(accessToken, spreadsheetId, 'Messages!A2:J', fetchImpl);
  const next = rows.map((row) => {
    if (row[3] !== messageId) return row;
    const copy = [...row];
    while (copy.length < 6) copy.push('');
    copy[4] = 'true';
    copy[5] = new Date().toISOString();
    return copy;
  });
  await writeSheetValues(accessToken, spreadsheetId, 'Messages!A2:J', next, fetchImpl);
}

export async function deleteDeviceMessageRow(
  accessToken: string,
  spreadsheetId: string,
  messageId: string,
  fetchImpl?: typeof fetch
): Promise<void> {
  const rows = await readSheetValues(accessToken, spreadsheetId, 'Messages!A2:J', fetchImpl);
  const next = rows.filter((row) => row[3] !== messageId);
  await writeSheetValues(
    accessToken,
    spreadsheetId,
    'Messages!A2:J',
    next.length ? next : [['', '', '', '', '', '', '', '', '', '']],
    fetchImpl
  );
}

export async function listDeviceMessageRequests(
  accessToken: string,
  spreadsheetId: string,
  fetchImpl?: typeof fetch
): Promise<DeviceMessageRequest[]> {
  const rows = await readSheetValues(accessToken, spreadsheetId, 'Requests!A2:H', fetchImpl);
  return rows
    .filter((row) => row[0])
    .map((row) => ({
      requestId: row[0],
      fromPnIdentifier: row[1] || '',
      toPnIdentifier: row[2] || '',
      content: row[3] || '',
      status: row[4] || 'pending',
      timestamp: row[5] || '',
      kemCiphertext: row[6] || undefined,
      cryptoVersion: row[7] ? Number(row[7]) : undefined,
    }));
}

export type DeviceRecoveryRequest = {
  requestId: string;
  publicKey: string;
  status: string;
  threshold: number;
  sharesJson: string;
  claimantName: string;
  createdAt: string;
  requestType?: string;
};

export async function listDeviceRecoveryRequests(
  accessToken: string,
  spreadsheetId: string,
  fetchImpl?: typeof fetch
): Promise<DeviceRecoveryRequest[]> {
  const rows = await readSheetValues(accessToken, spreadsheetId, 'RecoveryRequests!A2:H', fetchImpl);
  return rows
    .filter((row) => row[0])
    .map((row) => ({
      requestId: row[0],
      publicKey: row[1] || '',
      status: row[2] || 'pending',
      threshold: Number(row[3] || 0),
      sharesJson: row[4] || '',
      claimantName: row[5] || '',
      createdAt: row[6] || '',
      requestType: row[7] || undefined,
    }));
}

export type DeviceCustodian = {
  custodianId: string;
  name: string;
  custodianType: string;
  status: string;
  createdAt: string;
  custodianPnIdentifier?: string;
};

export async function listDeviceCustodians(
  accessToken: string,
  spreadsheetId: string,
  fetchImpl?: typeof fetch
): Promise<DeviceCustodian[]> {
  const rows = await readSheetValues(accessToken, spreadsheetId, 'Custodians!A2:K', fetchImpl);
  return rows
    .filter((row) => row[0])
    .map((row) => ({
      custodianId: row[0],
      name: row[1] || '',
      custodianType: row[2] || '',
      status: row[6] || row[4] || 'invited',
      createdAt: row[7] || row[5] || '',
      custodianPnIdentifier: row[10] || undefined,
    }));
}

const FOLDER = 'application/vnd.google-apps.folder';
const SHEET = 'application/vnd.google-apps.spreadsheet';

export async function findDriveChildId(
  accessToken: string,
  parentId: string,
  name: string,
  mimeType: string,
  fetchImpl?: typeof fetch
): Promise<string | null> {
  const q = encodeURIComponent(
    `name='${name.replace(/'/g, "\\'")}' and '${parentId}' in parents and mimeType='${mimeType}' and trashed=false`
  );
  const res = await deviceDriveCall('GET', `/api/drive/files?q=${q}&pageSize=1`, undefined, {
    accessToken,
    fetchImpl,
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { files?: Array<{ id?: string }> };
  return data.files?.[0]?.id || null;
}

export async function findRecoveryWorkbookId(
  accessToken: string,
  metadataFolderId: string,
  fetchImpl?: typeof fetch
): Promise<string | null> {
  return findDriveChildId(accessToken, metadataFolderId, 'recovery.xlsx', SHEET, fetchImpl);
}

export async function ensureAttachmentsFolderId(
  accessToken: string,
  messagesFolderId: string,
  fetchImpl?: typeof fetch
): Promise<string> {
  const existing = await findDriveChildId(
    accessToken,
    messagesFolderId,
    'attachments',
    FOLDER,
    fetchImpl
  );
  if (existing) return existing;
  const res = await deviceDriveCall(
    'POST',
    '/api/drive/folders',
    { folderName: 'attachments', parentFolderId: messagesFolderId },
    { accessToken, fetchImpl }
  );
  if (!res.ok) throw new Error('attachments_folder_failed');
  const body = (await res.json()) as { folder?: { id?: string } };
  if (!body.folder?.id) throw new Error('attachments_folder_failed');
  return body.folder.id;
}

/** Anyone-with-the-link reader. Returns the public download URL. */
export async function shareDeviceDriveFile(
  accessToken: string,
  fileId: string,
  fetchImpl: typeof fetch = fetch
): Promise<string> {
  const res = await fetchImpl(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/permissions`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ role: 'reader', type: 'anyone' }),
    }
  );
  if (!res.ok && res.status !== 409) {
    throw new Error(`drive_share_failed_${res.status}`);
  }
  return `https://drive.google.com/uc?export=download&id=${fileId}`;
}
