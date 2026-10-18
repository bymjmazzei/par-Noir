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

/** Open this member's group row: owner wrap, or sealed peer invite (docKey + live claim secret). */
async function openGroupRow(params: {
  session: PenSession;
  groupId: string;
}): Promise<{ docKey: string | null; liveClaimSecret: string | null }> {
  const none = { docKey: null, liveClaimSecret: null };
  if (!params.session.mlKemSecretKey) return none;
  try {
    const drive = await penSessionDrive(params.session.pnIdentifier);
    const sheetId = drive.index.sheetIds.groups;
    if (!sheetId) return none;
    const groups = await listDeviceGroups(drive.accessToken, sheetId);
    const row = groups.find((g) => g.groupId === params.groupId);
    const wrapped = row?.wrappedChatKey || '';
    if (!wrapped) return none;

    try {
      const parsed = JSON.parse(wrapped) as unknown;
      if (isSocialEnvelope(parsed)) {
        const opened = await openSocialEnvelope<{
          docKey?: string;
          docId?: string;
          liveClaimSecret?: string;
        }>(parsed, params.session.mlKemSecretKey, params.groupId);
        if (opened.docKey) {
          return { docKey: opened.docKey, liveClaimSecret: opened.liveClaimSecret || null };
        }
      }
    } catch {
      /* not a social envelope — try owner wrap */
    }
    try {
      const docKey = await unwrapChatKeyForOwner(
        wrapped,
        params.session.mlKemSecretKey,
        params.groupId
      );
      return { docKey, liveClaimSecret: null };
    } catch {
      return none;
    }
  } catch {
    return none;
  }
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
    // Missing/wrong docKey — keep local buffer rather than wipe the editor.
    return local;
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
