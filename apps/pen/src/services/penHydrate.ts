/**
 * Cold-open hydrate: cloud replica → local buffer (decrypt with docKey).
 */

import type { PenSession } from './penSession';
import { loadLocalDoc, saveLocalDoc, type LocalDocBundle } from './penLocalStore';
import { fetchDocFromDrive } from './penCloudStore';
import { loadDocKey, saveDocKey } from './penDocCrypto';
import {
  decryptCloudDoc,
  openDocKeysFromGroups,
  type DecryptedCloudDoc,
  type OpenedDocKey
} from '@par-noir/device-cloud-credentials';
import { penSessionDrive } from './penDriveLibrary';
import { loadLiveClaimSecret, saveLiveClaimSecret } from './penLiveStore';

/** Last cold-open failure (localStorage) — Agent reads this after a reproduce. */
export const PEN_HYDRATE_LAST_FAIL_KEY = 'pen_hydrate_last_fail_v1';

export type HydrateFailReason =
  | 'cloud_fetch_empty'
  | 'cloud_token_missing'
  | 'mlkem_missing'
  | 'groups_sheet_missing'
  | 'doc_key_unwrap_failed'
  | 'decrypt_failed'
  | 'sections_empty'
  | 'unknown';

export type HydrateDocOutcome = {
  bundle: LocalDocBundle | null;
  /** Present when there is nothing to show in the editor. */
  failReason?: HydrateFailReason;
  detail?: string;
};

function recordHydrateFail(
  docId: string,
  failReason: HydrateFailReason,
  detail?: string
): HydrateDocOutcome {
  const payload = {
    at: new Date().toISOString(),
    docId,
    failReason,
    detail: detail || null
  };
  try {
    localStorage.setItem(PEN_HYDRATE_LAST_FAIL_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
  try {
    console.warn('[pen.hydrate]', payload);
  } catch {
    /* ignore */
  }
  return { bundle: null, failReason, detail };
}

/** Every group row this member can open (owner wrap or sealed peer invite), newest first. */
async function openGroupRows(params: {
  session: PenSession;
  groupId: string;
}): Promise<{ rows: OpenedDocKey[]; fail?: HydrateFailReason; detail?: string }> {
  const secret = params.session.mlKemSecretKey;
  if (!secret) {
    return { rows: [], fail: 'mlkem_missing', detail: 'session.mlKemSecretKey empty' };
  }
  try {
    const drive = await penSessionDrive(params.session.pnIdentifier);
    const sheetId = drive.index.sheetIds.groups;
    if (!sheetId) {
      return { rows: [], fail: 'groups_sheet_missing', detail: 'drive.index.sheetIds.groups empty' };
    }
    const rows = await openDocKeysFromGroups({
      accessToken: drive.accessToken,
      groupsSheetId: sheetId,
      groupId: params.groupId,
      mlKemSecretKey: secret
    });
    if (!rows.length) {
      return {
        rows: [],
        fail: 'doc_key_unwrap_failed',
        detail: `no openable wrap for groupId=${params.groupId}`
      };
    }
    return { rows };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/cloud_on_device/i.test(msg)) {
      return { rows: [], fail: 'cloud_token_missing', detail: msg };
    }
    return { rows: [], fail: 'doc_key_unwrap_failed', detail: msg };
  }
}

async function openGroupRow(params: {
  session: PenSession;
  groupId: string;
}): Promise<{
  docKey: string | null;
  liveClaimSecret: string | null;
  fail?: HydrateFailReason;
  detail?: string;
}> {
  const opened = await openGroupRows(params);
  const newest = opened.rows[0];
  if (!newest) {
    return {
      docKey: null,
      liveClaimSecret: null,
      fail: opened.fail,
      detail: opened.detail
    };
  }
  return { docKey: newest.docKey, liveClaimSecret: newest.liveClaimSecret };
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
  const newer = (await openGroupRows(params)).rows.find(
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
  return (await openGroupRows(params)).rows.map((r) => r.docKey);
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

/**
 * Cloud → local cold open. Always returns an outcome; failReason is set only when
 * there is no local buffer to fall back to.
 */
export async function hydrateDocFromCloud(params: {
  session: PenSession;
  docId: string;
}): Promise<HydrateDocOutcome> {
  const local = loadLocalDoc(params.session.pnIdentifier, params.docId);
  const keepLocal = (): HydrateDocOutcome => ({ bundle: local });

  let raw;
  try {
    raw = await fetchDocFromDrive({
      userPnIdentifier: params.session.pnIdentifier,
      docId: params.docId
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (local) return keepLocal();
    if (/cloud_on_device/i.test(msg)) {
      return recordHydrateFail(params.docId, 'cloud_token_missing', msg);
    }
    return recordHydrateFail(params.docId, 'cloud_fetch_empty', msg);
  }

  if (!raw.manifest || !raw.chain) {
    if (local) return keepLocal();
    return recordHydrateFail(
      params.docId,
      'cloud_fetch_empty',
      `manifest=${Boolean(raw.manifest)} chain=${Boolean(raw.chain)}`
    );
  }

  let docKey = loadDocKey(params.docId);
  let keyFail: HydrateFailReason | undefined;
  let keyDetail: string | undefined;
  if (!docKey && raw.manifest.groupId) {
    const opened = await openGroupRow({
      session: params.session,
      groupId: raw.manifest.groupId
    });
    if (opened.docKey) {
      saveDocKey(params.docId, opened.docKey);
      docKey = opened.docKey;
    } else {
      keyFail = opened.fail || 'doc_key_unwrap_failed';
      keyDetail = opened.detail;
    }
    if (opened.liveClaimSecret) saveLiveClaimSecret(params.docId, opened.liveClaimSecret);
  } else if (!docKey && !raw.manifest.groupId) {
    keyFail = 'doc_key_unwrap_failed';
    keyDetail = 'manifest.groupId missing and no session docKey';
  }

  let cloud: DecryptedCloudDoc;
  try {
    cloud = await decryptCloudDoc({ raw, docKey });
  } catch (firstErr) {
    try {
      const fallbackKeys = raw.manifest.groupId
        ? await docKeyHistoryFromGroup({
            session: params.session,
            groupId: raw.manifest.groupId
          })
        : [];
      if (!fallbackKeys.length) {
        if (local) return keepLocal();
        return recordHydrateFail(
          params.docId,
          keyFail || 'decrypt_failed',
          keyDetail ||
            (firstErr instanceof Error ? firstErr.message : String(firstErr)) ||
            'no fallback keys'
        );
      }
      cloud = await decryptCloudDoc({
        raw,
        docKey: docKey || fallbackKeys[0],
        fallbackKeys
      });
    } catch (e) {
      if (local) return keepLocal();
      return recordHydrateFail(
        params.docId,
        keyFail || 'decrypt_failed',
        keyDetail || (e instanceof Error ? e.message : String(e))
      );
    }
  }

  if (!cloud.manifest || !cloud.chain) {
    if (local) return keepLocal();
    return recordHydrateFail(params.docId, 'cloud_fetch_empty', 'decrypt returned empty manifest/chain');
  }

  const draft = cloud.drafts[0];
  const sections =
    draft?.sections?.length
      ? draft.sections
      : cloud.currentSections.length
        ? cloud.currentSections
        : local?.sections || [];

  if (!sections.length) {
    if (local) return keepLocal();
    return recordHydrateFail(
      params.docId,
      'sections_empty',
      `current=${cloud.currentSections.length} drafts=${cloud.drafts.length} hasDocKey=${Boolean(docKey)} ${keyDetail || ''}`
    );
  }

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
  try {
    localStorage.removeItem(PEN_HYDRATE_LAST_FAIL_KEY);
  } catch {
    /* ignore */
  }
  return { bundle };
}
