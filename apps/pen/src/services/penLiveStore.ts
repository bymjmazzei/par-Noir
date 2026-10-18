/**
 * Durable live state for a doc: a docKey-sealed Yjs snapshot in localStorage
 * and on the member's own Drive (live.ysnap), plus the latest owner-signed
 * roles update and this member's key-claim secret.
 */

import * as Y from 'yjs';
import {
  isPenLiveSealedSnapshot,
  openPenLiveSnapshot,
  sealPenLiveSnapshot,
  type PenLiveRolesUpdate,
  type PenLiveSealedSnapshot
} from '@par-noir/pen-live';
import { penSessionDrive, readLiveSnapshotFile, writeLiveSnapshotFile } from './penDriveLibrary';

/** Window event: a peer snapshot arrived by mailbox; detail `{ docId, sealed }`. */
export const PEN_LIVE_SNAPSHOT_EVENT = 'pen-live-snapshot';

/** Window event: an owner re-key was applied from the mailbox; detail `{ docId, keyEpoch, roles }`. */
export const PEN_LIVE_REKEY_EVENT = 'pen-live-rekey';

const snapKey = (pn: string, docId: string) => `pen_live_v1:${pn}:${docId}`;
const rolesKey = (pn: string, docId: string) => `pen_live_roles_v1:${pn}:${docId}`;
const claimKey = (docId: string) => `pen_live_claim:${docId}`;

function parseSnapshot(raw: string | null): PenLiveSealedSnapshot | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return isPenLiveSealedSnapshot(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function loadLocalLiveSnapshot(pn: string, docId: string): PenLiveSealedSnapshot | null {
  try {
    return parseSnapshot(localStorage.getItem(snapKey(pn, docId)));
  } catch {
    return null;
  }
}

/** Never replaces a snapshot from a newer key epoch (a closing pre-rekey session must not win). */
export function saveLocalLiveSnapshot(pn: string, docId: string, sealed: PenLiveSealedSnapshot): void {
  const prev = loadLocalLiveSnapshot(pn, docId);
  if (prev && prev.keyEpoch > sealed.keyEpoch) return;
  try {
    localStorage.setItem(snapKey(pn, docId), JSON.stringify(sealed));
  } catch {
    /* quota — Drive copy and peers still hold the state */
  }
}

export async function loadDriveLiveSnapshot(
  pn: string,
  docId: string
): Promise<PenLiveSealedSnapshot | null> {
  try {
    const drive = await penSessionDrive(pn);
    return parseSnapshot(
      await readLiveSnapshotFile({
        accessToken: drive.accessToken,
        pnFolderId: drive.index.pnFolderId,
        docId
      })
    );
  } catch {
    return null;
  }
}

export async function saveDriveLiveSnapshot(
  pn: string,
  docId: string,
  sealed: PenLiveSealedSnapshot
): Promise<void> {
  const drive = await penSessionDrive(pn);
  await writeLiveSnapshotFile({
    accessToken: drive.accessToken,
    pnFolderId: drive.index.pnFolderId,
    docId,
    sealedJson: JSON.stringify(sealed)
  });
}

/** Apply every snapshot on this key epoch into `ydoc` (CRDT merge, order-free). */
export async function applyLiveSnapshots(
  ydoc: Y.Doc,
  snapshots: Array<PenLiveSealedSnapshot | null>,
  docKey: string,
  keyEpoch: number,
  origin: unknown
): Promise<number> {
  let applied = 0;
  for (const snap of snapshots) {
    if (!snap) continue;
    try {
      const update = await openPenLiveSnapshot(snap, docKey, keyEpoch);
      if (!update) continue;
      Y.applyUpdate(ydoc, update, origin);
      applied += 1;
    } catch {
      /* wrong key or corrupt */
    }
  }
  return applied;
}

/** Merge a peer's snapshot (mailbox) into the local one without opening a session. */
export async function mergeLiveSnapshotIntoLocal(params: {
  pn: string;
  docId: string;
  incoming: PenLiveSealedSnapshot;
  docKey: string;
}): Promise<boolean> {
  const { pn, docId, incoming, docKey } = params;
  const local = loadLocalLiveSnapshot(pn, docId);
  const epoch = Math.max(incoming.keyEpoch, local?.keyEpoch ?? 0);
  const ydoc = new Y.Doc();
  try {
    const applied = await applyLiveSnapshots(ydoc, [local, incoming], docKey, epoch, null);
    if (!applied) return false;
    saveLocalLiveSnapshot(pn, docId, await sealPenLiveSnapshot(ydoc, docKey, epoch));
    return true;
  } finally {
    ydoc.destroy();
  }
}

export function loadLiveRolesUpdate(pn: string, docId: string): PenLiveRolesUpdate | null {
  try {
    const raw = localStorage.getItem(rolesKey(pn, docId));
    return raw ? (JSON.parse(raw) as PenLiveRolesUpdate) : null;
  } catch {
    return null;
  }
}

/** Keep the newest update; callers verify the owner signature before trusting it. */
export function saveLiveRolesUpdate(pn: string, docId: string, update: PenLiveRolesUpdate): void {
  const prev = loadLiveRolesUpdate(pn, docId);
  if (prev && prev.keyEpoch > update.keyEpoch) return;
  if (prev && prev.keyEpoch === update.keyEpoch && prev.issuedAt >= update.issuedAt) return;
  try {
    localStorage.setItem(rolesKey(pn, docId), JSON.stringify(update));
  } catch {
    /* quota */
  }
}

export function loadLiveClaimSecret(docId: string): string | null {
  try {
    return sessionStorage.getItem(claimKey(docId));
  } catch {
    return null;
  }
}

export function saveLiveClaimSecret(docId: string, secret: string): void {
  try {
    sessionStorage.setItem(claimKey(docId), secret);
  } catch {
    /* ignore */
  }
}
