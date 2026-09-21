/**
 * Publish safety gate (before DMCA)
 * Classifies content as public | nsfw | prohibited via Gemini.
 * Prohibited → hard fail (no Prism). NSFW → force isNSFW. Public → continue.
 * Video/audio: samples clips (same as DMCA). Encrypted thoughts/text: skip.
 */

import { getGeminiModerationService, type PublishLane } from './geminiModerationService';
import { getMediaDuration, extractRandomClips } from './mediaSamplingService';
import { shouldSkipDmcaGate } from './dmcaGate';

export interface PublishSafetyGateResult {
  passed: boolean;
  lane: PublishLane;
  reason?: string;
  /** When true, caller must set isNSFW on metadata before indexing. */
  forceNsfw: boolean;
}

interface DriveProxyLike {
  downloadFile(userPnIdentifier: string, fileId: string, accountId?: string): Promise<Blob>;
}

const FALLBACK_MAX_BYTES = 5 * 1024 * 1024; // 5 MB

function isVideoOrAudio(mimeType: string): boolean {
  const base = (mimeType || '').split(';')[0].trim().toLowerCase();
  return base.startsWith('video/') || base.startsWith('audio/');
}

export function shouldSkipPublishSafetyGate(params: {
  isThoughtThumbnail?: boolean;
  thought?: unknown;
  textPost?: unknown;
}): boolean {
  return shouldSkipDmcaGate(params);
}

/**
 * Run publish-lane classify before allowing content to be indexed.
 * Already-prohibited metadata should be checked by the caller (no AI re-run).
 */
export async function runPublishSafetyCheck(
  googleDriveProxy: DriveProxyLike,
  ownerPnIdentifier: string,
  driveFileId: string,
  mimeType: string,
  accountId?: string
): Promise<PublishSafetyGateResult> {
  try {
    const blob = await googleDriveProxy.downloadFile(ownerPnIdentifier, driveFileId, accountId);
    const buffer = Buffer.from(await blob.arrayBuffer());
    const effectiveMime = mimeType || blob.type || 'application/octet-stream';
    const gemini = getGeminiModerationService();

    let result;
    if (isVideoOrAudio(effectiveMime)) {
      const duration = await getMediaDuration(buffer, effectiveMime);
      const clipBuffers = await extractRandomClips(buffer, effectiveMime, duration);
      if (clipBuffers.length > 0) {
        const clipMime = effectiveMime.startsWith('audio/') ? 'audio/mpeg' : 'video/mp4';
        const clips = clipBuffers.map((buf) => ({ buffer: buf, mimeType: clipMime }));
        result = await gemini.classifyPublishLaneSampled(clips);
      } else if (buffer.length <= FALLBACK_MAX_BYTES) {
        result = await gemini.classifyPublishLane(buffer, effectiveMime);
      } else {
        console.warn('[Publish Safety Gate] Sampling failed for large video/audio; fail open to public');
        return { passed: true, lane: 'public', forceNsfw: false };
      }
    } else {
      result = await gemini.classifyPublishLane(buffer, effectiveMime);
    }

    if (result.lane === 'prohibited') {
      return {
        passed: false,
        lane: 'prohibited',
        reason: result.reason || 'Content classified as prohibited for the network',
        forceNsfw: false,
      };
    }

    if (result.lane === 'nsfw') {
      return {
        passed: true,
        lane: 'nsfw',
        reason: result.reason,
        forceNsfw: true,
      };
    }

    return { passed: true, lane: 'public', forceNsfw: false };
  } catch (err) {
    console.warn('[Publish Safety Gate] Check failed; fail open to public:', (err as Error)?.message);
    return { passed: true, lane: 'public', forceNsfw: false, reason: 'Classify unavailable' };
  }
}

/**
 * Persist prohibited mark + content notice. Does not enqueue Prism.
 */
export async function markContentProhibited(params: {
  ownerPnIdentifier: string;
  fileId: string;
  reason?: string;
  source?: 'bot' | 'prism_denied';
}): Promise<void> {
  const { ownerPnIdentifier, fileId, reason, source = 'bot' } = params;
  try {
    const { AggregatorMetadataServiceDB } = await import('./aggregatorMetadataServiceDB');
    const service = AggregatorMetadataServiceDB.getInstance();
    const entry = await service.getFileMetadata(fileId);
    if (entry?.metadata) {
      await service.updateMetadata(fileId, {
        isProhibited: true,
        isPublic: false,
      } as any);
    }
  } catch (err) {
    console.warn('[Publish Safety Gate] Failed to persist isProhibited on metadata:', (err as Error)?.message);
  }

  try {
    const { addContentNotice } = await import('./contentNoticesService');
    await addContentNotice({
      ownerPnIdentifier,
      fileId,
      type: 'prohibited',
      reason:
        reason ||
        'This content was classified as prohibited and cannot be made public on the network. Your file remains in your private cloud. To retry, upload a new file.',
      source,
    });
  } catch (err) {
    console.warn('[Publish Safety Gate] Failed to add prohibited notice:', (err as Error)?.message);
  }
}

export function isMetadataProhibited(metadata: { isProhibited?: boolean | string } | null | undefined): boolean {
  if (!metadata) return false;
  const v = metadata.isProhibited;
  if (v === true) return true;
  if (typeof v === 'string' && v.toLowerCase() === 'true') return true;
  return false;
}

/**
 * True if file was previously marked prohibited (metadata or content notice).
 */
export async function isFileMarkedProhibited(fileId: string): Promise<boolean> {
  try {
    const { AggregatorMetadataServiceDB } = await import('./aggregatorMetadataServiceDB');
    const entry = await AggregatorMetadataServiceDB.getInstance().getFileMetadata(fileId);
    if (isMetadataProhibited(entry?.metadata as any)) return true;
  } catch {
    /* ignore */
  }
  try {
    const { getDatabasePool } = await import('../utils/database');
    const db = getDatabasePool();
    const result = await db.query(
      `SELECT 1 FROM content_notices WHERE file_id = $1 AND type = 'prohibited' LIMIT 1`,
      [fileId]
    );
    return (result.rows.length ?? 0) > 0;
  } catch {
    return false;
  }
}

export type PublishSafetyOutcome =
  | { status: 'ok'; forceNsfw: boolean }
  | { status: 'prohibited'; reason?: string };

/**
 * Full publish-safety step for make-public: already-prohibited short-circuit,
 * Gemini classify, mark+notice on prohibited (no Prism).
 */
export async function applyPublishSafetyGate(opts: {
  googleDriveProxy: DriveProxyLike;
  ownerPnIdentifier: string;
  fileId: string;
  driveFileId: string;
  mimeType: string;
  accountId?: string;
  skip?: boolean;
  existingIsProhibited?: boolean;
}): Promise<PublishSafetyOutcome> {
  const already =
    opts.existingIsProhibited === true || (await isFileMarkedProhibited(opts.fileId));
  if (already) {
    return {
      status: 'prohibited',
      reason:
        'This content was previously classified as prohibited and cannot be made public. Upload a new file to retry.',
    };
  }
  if (opts.skip) {
    return { status: 'ok', forceNsfw: false };
  }

  const result = await runPublishSafetyCheck(
    opts.googleDriveProxy,
    opts.ownerPnIdentifier,
    opts.driveFileId,
    opts.mimeType,
    opts.accountId
  );

  if (!result.passed || result.lane === 'prohibited') {
    await markContentProhibited({
      ownerPnIdentifier: opts.ownerPnIdentifier,
      fileId: opts.fileId,
      reason: result.reason,
      source: 'bot',
    });
    return { status: 'prohibited', reason: result.reason };
  }

  return { status: 'ok', forceNsfw: result.forceNsfw };
}
