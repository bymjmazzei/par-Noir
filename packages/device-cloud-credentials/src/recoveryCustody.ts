/**
 * Recovery material on the user's own Drive (device-side Google token only):
 * - custodians keep sealed recovery shares for the owners they protect;
 * - owners keep the release-proof secret a claimant must read back to finish recovery.
 */

import { METADATA_DIR } from '@par-noir/user-owned-storage';
import { deviceDriveCall } from './deviceDriveCall.js';
import { findFolderByName, findOrCreateFolder, findPnRootFolderId } from './deviceDriveFind.js';
import { findRecoveryWorkbookId, listDeviceCustodians, type DeviceCustodian } from './deviceProduct.js';

export const RECOVERY_CUSTODY_FILE = 'recovery-custody.json';
export const RECOVERY_DRIVE_PROOF_FILE = 'recovery-release-proof.json';

export interface RecoveryCustodyEntry {
  ownerPublicKey: string;
  custodianId: string;
  shareIndex: number;
  epoch: number;
  /** Serialized SealedShare, sealed to the custodian's ML-KEM key. */
  sealedShare: string;
  storedAt: string;
}

interface CustodyFile {
  v: 1;
  entries: Record<string, RecoveryCustodyEntry>;
}

export type RecoveryDriveOpts = {
  accessToken: string;
  pnIdentifier: string;
  fetchImpl?: typeof fetch;
};

function textToB64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin);
}

async function metadataFolder(opts: RecoveryDriveOpts, create: boolean): Promise<string | null> {
  const root = await findPnRootFolderId(opts.accessToken, opts.pnIdentifier, opts.fetchImpl);
  if (!root) {
    if (create) throw new Error('pn_root_not_found');
    return null;
  }
  return create
    ? findOrCreateFolder(opts.accessToken, METADATA_DIR, root, opts.fetchImpl)
    : findFolderByName(opts.accessToken, METADATA_DIR, root, opts.fetchImpl);
}

async function findFile(opts: RecoveryDriveOpts, folderId: string, name: string): Promise<string | null> {
  const q = `name='${name}' and '${folderId}' in parents and trashed=false`;
  const res = await deviceDriveCall('GET', `/api/drive/files?q=${encodeURIComponent(q)}&pageSize=1`, undefined, {
    accessToken: opts.accessToken,
    fetchImpl: opts.fetchImpl,
  });
  if (!res.ok) throw new Error(`drive_list_failed_${res.status}`);
  const data = (await res.json()) as { files?: Array<{ id?: string }> };
  return data.files?.[0]?.id ?? null;
}

async function readJson<T>(opts: RecoveryDriveOpts, name: string): Promise<T | null> {
  const folder = await metadataFolder(opts, false);
  if (!folder) return null;
  const id = await findFile(opts, folder, name);
  if (!id) return null;
  const res = await deviceDriveCall('GET', `/api/drive/files/${encodeURIComponent(id)}?download=true`, undefined, {
    accessToken: opts.accessToken,
    fetchImpl: opts.fetchImpl,
  });
  if (!res.ok) throw new Error(`drive_read_failed_${res.status}`);
  try {
    return JSON.parse(await res.text()) as T;
  } catch {
    return null;
  }
}

async function writeJson(opts: RecoveryDriveOpts, name: string, value: unknown): Promise<void> {
  const folder = (await metadataFolder(opts, true))!;
  const fileData = textToB64(JSON.stringify(value));
  const existing = await findFile(opts, folder, name);
  const init = { accessToken: opts.accessToken, fetchImpl: opts.fetchImpl };
  const res = existing
    ? await deviceDriveCall(
        'PUT',
        `/api/drive/files/${encodeURIComponent(existing)}/content`,
        { fileData, mimeType: 'application/json' },
        init
      )
    : await deviceDriveCall(
        'POST',
        '/api/drive/files',
        { fileData, fileName: name, mimeType: 'application/json', parents: [folder] },
        init
      );
  if (!res.ok) throw new Error(`drive_write_failed_${res.status}`);
}

/** All sealed shares this custodian holds, one per custodian slot (latest epoch). */
export async function readRecoveryCustody(opts: RecoveryDriveOpts): Promise<RecoveryCustodyEntry[]> {
  const file = await readJson<CustodyFile>(opts, RECOVERY_CUSTODY_FILE);
  return file?.entries ? Object.values(file.entries) : [];
}

export async function findRecoveryCustody(
  opts: RecoveryDriveOpts & { custodianId: string; epoch?: number }
): Promise<RecoveryCustodyEntry | null> {
  const entry = (await readRecoveryCustody(opts)).find((e) => e.custodianId === opts.custodianId);
  if (!entry) return null;
  return opts.epoch === undefined || entry.epoch === opts.epoch ? entry : null;
}

/** Merge entries; a newer epoch replaces the slot, an older one is ignored. */
export async function writeRecoveryCustody(
  opts: RecoveryDriveOpts & { entries: RecoveryCustodyEntry[] }
): Promise<void> {
  if (opts.entries.length === 0) return;
  const file = (await readJson<CustodyFile>(opts, RECOVERY_CUSTODY_FILE)) ?? { v: 1, entries: {} };
  const entries = { ...(file.entries || {}) };
  for (const e of opts.entries) {
    const prev = entries[e.custodianId];
    if (prev && prev.epoch > e.epoch) continue;
    entries[e.custodianId] = e;
  }
  await writeJson(opts, RECOVERY_CUSTODY_FILE, { v: 1, entries } satisfies CustodyFile);
}

export function createRecoveryDriveProofSecret(): string {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** sha256 hex of the secret; the server keeps only a peppered digest of this. */
export async function recoveryDriveProofHash(secret: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret.trim()));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function writeRecoveryDriveProof(opts: RecoveryDriveOpts & { secret: string }): Promise<void> {
  await writeJson(opts, RECOVERY_DRIVE_PROOF_FILE, { v: 1, secret: opts.secret });
}

export async function readRecoveryDriveProof(opts: RecoveryDriveOpts): Promise<string | null> {
  const file = await readJson<{ v?: number; secret?: unknown }>(opts, RECOVERY_DRIVE_PROOF_FILE);
  return typeof file?.secret === 'string' && file.secret ? file.secret : null;
}

/**
 * Pre-relay recovery workbook (`_metadata/recovery.xlsx`). It also stored encrypted shares, so
 * after re-securing it is deleted rather than kept as a roster.
 */
export async function readLegacyRecoveryRoster(
  opts: RecoveryDriveOpts
): Promise<{ workbookId: string; custodians: DeviceCustodian[] } | null> {
  const folder = await metadataFolder(opts, false);
  if (!folder) return null;
  const workbookId = await findRecoveryWorkbookId(opts.accessToken, folder, opts.fetchImpl);
  if (!workbookId) return null;
  const custodians = (await listDeviceCustodians(opts.accessToken, workbookId, opts.fetchImpl)).filter(
    (c) => c.status !== 'revoked' && c.custodianType !== 'vault' && !c.custodianId.startsWith('vault_share_')
  );
  return { workbookId, custodians };
}

export async function deleteLegacyRecoveryWorkbook(opts: RecoveryDriveOpts & { workbookId: string }): Promise<void> {
  const res = await deviceDriveCall('DELETE', `/api/drive/files/${encodeURIComponent(opts.workbookId)}`, undefined, {
    accessToken: opts.accessToken,
    fetchImpl: opts.fetchImpl,
  });
  if (!res.ok && res.status !== 404) throw new Error(`drive_delete_failed_${res.status}`);
}
