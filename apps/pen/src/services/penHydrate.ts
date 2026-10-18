/**
 * Cold-open hydrate: cloud replica → local buffer (decrypt with docKey).
 */

import type { PenSession } from './penSession';
import { loadLocalDoc, saveLocalDoc, type LocalDocBundle } from './penLocalStore';
import { decryptCloudDoc, fetchDocFromDrive } from './penCloudStore';
import { loadDocKey, saveDocKey } from './penDocCrypto';
import {
  isSocialEnvelope,
  openSocialEnvelope,
  unwrapChatKeyForOwner
} from '@par-noir/dm-crypto';
import { listDeviceGroups } from '@par-noir/device-cloud-credentials';
import { penSessionDrive } from './penDriveLibrary';
import { loadLiveClaimSecret, saveLiveClaimSecret } from './penLiveStore';

type OpenedGroupRow = { docKey: string; liveClaimSecret: string | null; keyEpoch: number | null };

async function openWrappedKey(
  wrapped: string,
  mlKemSecretKey: string,
  groupId: string
): Promise<OpenedGroupRow | null> {
  if (!wrapped) return null;
  try {
    const parsed = JSON.parse(wrapped) as unknown;
    if (isSocialEnvelope(parsed)) {
      const opened = await openSocialEnvelope<{
        docKey?: string;
        liveClaimSecret?: string;
        keyEpoch?: number;
      }>(parsed, mlKemSecretKey, groupId);
      return opened.docKey
        ? {
            docKey: opened.docKey,
            liveClaimSecret: opened.liveClaimSecret || null,
            keyEpoch: Number.isInteger(opened.keyEpoch) ? (opened.keyEpoch as number) : null
          }
        : null;
    }
  } catch {
    /* not a social envelope — try owner wrap */
  }
  try {
    return {
      docKey: await unwrapChatKeyForOwner(wrapped, mlKemSecretKey, groupId),
      liveClaimSecret: null,
      keyEpoch: null
    };
  } catch {
    return null;
  }
}

/**
 * Every group row this member can open (owner wrap or sealed peer invite), newest first.
 * A re-key appends rows, so the first entry carries the current docKey.
 */
async function openGroupRows(params: { session: PenSession; groupId: string }): Promise<OpenedGroupRow[]> {
  const secret = params.session.mlKemSecretKey;
  if (!secret) return [];
  try {
    const drive = await penSessionDrive(params.session.pnIdentifier);
    const sheetId = drive.index.sheetIds.groups;
    if (!sheetId) return [];
    const rows = (await listDeviceGroups(drive.accessToken, sheetId))
      .filter((g) => g.groupId === params.groupId)
      .reverse();
    const out: OpenedGroupRow[] = [];
    for (const row of rows) {
      const opened = await openWrappedKey(row.wrappedChatKey || '', secret, params.groupId);
      if (opened && !out.some((o) => o.docKey === opened.docKey)) out.push(opened);
    }
    return out;
  } catch {
    return [];
  }
}

async function openGroupRow(params: {
  session: PenSession;
  groupId: string;
}): Promise<{ docKey: string | null; liveClaimSecret: string | null }> {
  const [newest] = await openGroupRows(params);
  return newest || { docKey: null, liveClaimSecret: null };
}

/**
 * Member missed a re-key notice: adopt a newer-epoch key sealed to them in a
 * group row. Returns the new epoch, or null when nothing newer exists.
 */
export async function adoptNewerGroupKey(params: {
  session: PenSession;
  docId: string;
  groupId: string;
  keyEpoch: number;
}): Promise<number | null> {
  const newer = (await openGroupRows(params)).find(
    (r) => r.keyEpoch !== null && r.keyEpoch > params.keyEpoch
  );
  if (!newer || newer.keyEpoch === null) return null;
  saveDocKey(params.docId, newer.docKey);
  if (newer.liveClaimSecret) saveLiveClaimSecret(params.docId, newer.liveClaimSecret);
  return newer.keyEpoch;
}

/** Older docKeys from earlier key epochs; Drive files written before a re-key stay sealed with them. */
export async function docKeyHistoryFromGroup(params: {
  session: PenSession;
  groupId: string;
}): Promise<string[]> {
  return (await openGroupRows(params)).map((r) => r.docKey);
}

/** Try to recover docKey from group membership (owner wrap or sealed peer invite). */
export async function ensureDocKeyFromGroup(params: {
  session: PenSession;
  docId: string;
  groupId: string;
}): Promise<string | null> {
  const existing = loadDocKey(params.docId);
  if (existing) return existing;
  const { docKey, liveClaimSecret } = await openGroupRow(params);
  if (docKey) saveDocKey(params.docId, docKey);
  if (liveClaimSecret) saveLiveClaimSecret(params.docId, liveClaimSecret);
  return docKey;
}

/** Claim secret the owner sealed into this member's invite (null for the owner and legacy invites). */
export async function ensureLiveClaimSecret(params: {
  session: PenSession;
  docId: string;
  groupId: string;
}): Promise<string | null> {
  const existing = loadLiveClaimSecret(params.docId);
  if (existing) return existing;
  const { docKey, liveClaimSecret } = await openGroupRow(params);
  if (docKey && !loadDocKey(params.docId)) saveDocKey(params.docId, docKey);
  if (liveClaimSecret) saveLiveClaimSecret(params.docId, liveClaimSecret);
  return liveClaimSecret;
}

export async function hydrateDocFromCloud(params: {
  session: PenSession;
  docId: string;
}): Promise<LocalDocBundle | null> {
  const local = loadLocalDoc(params.session.pnIdentifier, params.docId);

  // Fetch opaque replica first so we can recover docKey before decrypt.
  const raw = await fetchDocFromDrive({
    userPnIdentifier: params.session.pnIdentifier,
    docId: params.docId
  });
  if (!raw.manifest || !raw.chain) return local;

  let docKey = loadDocKey(params.docId);
  if (!docKey && raw.manifest.groupId) {
    docKey = await ensureDocKeyFromGroup({
      session: params.session,
      docId: params.docId,
      groupId: raw.manifest.groupId
    });
  }

  let cloud: Awaited<ReturnType<typeof decryptCloudDoc>>;
  try {
    cloud = await decryptCloudDoc({ raw, docKey });
  } catch {
    try {
      const fallbackKeys = raw.manifest.groupId
        ? await docKeyHistoryFromGroup({ session: params.session, groupId: raw.manifest.groupId })
        : [];
      if (!fallbackKeys.length) return local;
      cloud = await decryptCloudDoc({ raw, docKey: docKey || fallbackKeys[0], fallbackKeys });
    } catch {
      // Missing/wrong docKey — keep local buffer rather than wipe the editor.
      return local;
    }
  }

  if (!cloud.manifest || !cloud.chain) return local;

  // Prefer draft sections when present (WIP); else current published.
  const draft = cloud.drafts[0];
  const sections =
    draft?.sections?.length
      ? draft.sections
      : cloud.currentSections.length
        ? cloud.currentSections
        : local?.sections || [];

  if (!sections.length) return local;

  const bundle: LocalDocBundle = {
    manifest: {
      ...cloud.manifest,
      ...(draft?.draft?.draftId
        ? { activeDraftId: draft.draft.draftId, lifecycle: 'draft' as const }
        : {})
    },
    sections,
    chain: cloud.chain
  };
  saveLocalDoc(params.session.pnIdentifier, bundle);
  return bundle;
}
