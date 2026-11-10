/**
 * Publish safety gate (before DMCA)
 * Classifies the public feed preview as public | nsfw | prohibited via Gemini.
 * Prohibited → hard fail (no Prism). NSFW → force isNSFW. Public → continue.
 * Video: samples clips from the SD preview (same as DMCA). Encrypted notes/text: skip.
 * Audio and preview-less content: nothing to classify here; DMCA routes audio to Prism.
 */

import { getGeminiModerationService, type PublishLane } from './geminiModerationService';
import { getMediaDuration, extractRandomClips } from './mediaSamplingService';
import { shouldSkipDmcaGate } from './dmcaGate';
import type { ModerationPreview } from './moderationPreview';

export interface PublishSafetyGateResult {
  passed: boolean;
  lane: PublishLane;
  reason?: string;
  /** When true, caller must set isNSFW on metadata before indexing. */
  forceNsfw: boolean;
}

export type LoadModerationPreview = () => Promise<ModerationPreview>;

const FALLBACK_MAX_BYTES = 5 * 1024 * 1024; // 5 MB

export function shouldSkipPublishSafetyGate(params: {
  isNoteThumbnail?: boolean;
  thought?: unknown;
  note?: unknown;
  textPost?: unknown;
}): boolean {
  return shouldSkipDmcaGate(params);
}

/**
 * Run publish-lane classify before allowing content to be indexed.
 * Already-prohibited metadata should be checked by the caller (no AI re-run).
 */
export async function runPublishSafetyCheck(
  loadPreview: LoadModerationPreview
): Promise<PublishSafetyGateResult> {
  try {
    const preview = await loadPreview();
    if (preview.kind === 'audio' || preview.kind === 'none') {
      return { passed: true, lane: 'public', forceNsfw: false };
    }
    const gemini = getGeminiModerationService();

    let result;
    if (preview.kind === 'video') {
      const duration = await getMediaDuration(preview.buffer, preview.mimeType);
      const clipBuffers = await extractRandomClips(preview.buffer, preview.mimeType, duration);
      if (clipBuffers.length > 0) {
        const clips = clipBuffers.map((buf) => ({ buffer: buf, mimeType: 'video/mp4' }));
        result = await gemini.classifyPublishLaneSampled(clips);
      } else if (preview.buffer.length <= FALLBACK_MAX_BYTES) {
        result = await gemini.classifyPublishLane(preview.buffer, preview.mimeType);
      } else {
        console.warn('[Publish Safety Gate] Sampling failed for large video preview; fail open to public');
        return { passed: true, lane: 'public', forceNsfw: false };
      }
    } else {
      result = await gemini.classifyPublishLane(preview.buffer, preview.mimeType);
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
  loadPreview: LoadModerationPreview;
  ownerPnIdentifier: string;
  fileId: string;
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

  const result = await runPublishSafetyCheck(opts.loadPreview);

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
