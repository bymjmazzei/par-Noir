/**
 * Cold-open hydrate: cloud replica → local buffer (decrypt with docKey).
 */

import type { PenSession } from './penSession';
import { loadLocalDoc, saveLocalDoc, type LocalDocBundle } from './penLocalStore';
import { loadDocFromDrive } from './penCloudStore';
import { loadDocKey, saveDocKey } from './penDocCrypto';
import {
  isSocialEnvelope,
  openSocialEnvelope,
  unwrapChatKeyForOwner
} from '@par-noir/dm-crypto';
import { ownerGet } from './penOwnerFetch';

/** Try to recover docKey from group membership (owner wrap or sealed peer invite). */
export async function ensureDocKeyFromGroup(params: {
  session: PenSession;
  docId: string;
  groupId: string;
}): Promise<string | null> {
  const existing = loadDocKey(params.docId);
  if (existing) return existing;
  if (!params.session.mlKemSecretKey) return null;

  try {
    const q = new URLSearchParams({
      userPnIdentifier: params.session.pnIdentifier
    });
    const res = await ownerGet(`/api/groups?${q}`, {
      pnIdentifier: params.session.pnIdentifier
    });
    if (!res.ok) return null;
    const data = (await res.json().catch(() => ({}))) as {
      groups?: Array<{
        groupId?: string;
        wrappedChatKey?: string;
        ownerPnIdentifier?: string;
        memberPnIdentifier?: string;
      }>;
    };
    const row = (data.groups || []).find((g) => g.groupId === params.groupId);
    const wrapped = row?.wrappedChatKey || '';
    if (!wrapped) return null;

    let docKey: string | null = null;
    try {
      const parsed = JSON.parse(wrapped) as unknown;
      if (isSocialEnvelope(parsed)) {
        const opened = await openSocialEnvelope<{
          docKey?: string;
          docId?: string;
        }>(parsed, params.session.mlKemSecretKey, params.groupId);
        if (opened.docKey) docKey = opened.docKey;
      }
    } catch {
      /* not a social envelope — try owner wrap */
    }
    if (!docKey) {
      try {
        docKey = await unwrapChatKeyForOwner(
          wrapped,
          params.session.mlKemSecretKey,
          params.groupId
        );
      } catch {
        return null;
      }
    }
    if (docKey) saveDocKey(params.docId, docKey);
    return docKey;
  } catch {
    return null;
  }
}

export async function hydrateDocFromCloud(params: {
  session: PenSession;
  docId: string;
}): Promise<LocalDocBundle | null> {
  const local = loadLocalDoc(params.session.pnIdentifier, params.docId);
  const cloud = await loadDocFromDrive({
    userPnIdentifier: params.session.pnIdentifier,
    docId: params.docId
  });
  if (!cloud.manifest || !cloud.chain) return local;

  if (cloud.manifest.groupId) {
    await ensureDocKeyFromGroup({
      session: params.session,
      docId: params.docId,
      groupId: cloud.manifest.groupId
    });
  }

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
