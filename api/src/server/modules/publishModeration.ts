/**
 * Make-public moderation: publish safety (prohibited / nsfw) then DMCA, both on the public
 * feed preview. Prism-approved files skip DMCA. Encrypted notes/text skip both.
 */
import type { Response } from 'express';
import { applyPublishSafetyGate, isMetadataProhibited, shouldSkipPublishSafetyGate } from './publishSafetyGate';
import { runDMCACheck } from './dmcaGate';
import { loadModerationPreview, type ModerationPreview, type ModerationPreviewSource } from './moderationPreview';

export type PublishModerationOutcome =
  | { status: 'ok'; forceNsfw: boolean }
  | { status: 'prohibited'; reason?: string }
  | { status: 'pending_review'; reason?: string; queueItemId?: string };

export type PublishModerationMetadata = ModerationPreviewSource & {
  isNoteThumbnail?: boolean;
  isThoughtThumbnail?: boolean;
  thought?: unknown;
  note?: unknown;
  textPost?: unknown;
  isProhibited?: boolean | string;
};

export async function runPublishModeration(opts: {
  ownerPnIdentifier: string;
  fileId: string;
  metadata: PublishModerationMetadata;
}): Promise<PublishModerationOutcome> {
  const { ownerPnIdentifier, fileId, metadata } = opts;
  const skip = shouldSkipPublishSafetyGate({
    isNoteThumbnail: metadata.isNoteThumbnail === true || metadata.isThoughtThumbnail === true,
    thought: metadata.thought,
    note: metadata.note,
    textPost: metadata.textPost,
  });

  let cached: Promise<ModerationPreview> | null = null;
  const loadPreview = () => {
    if (!cached) cached = loadModerationPreview(metadata);
    return cached;
  };

  const safety = await applyPublishSafetyGate({
    loadPreview,
    ownerPnIdentifier,
    fileId,
    skip,
    existingIsProhibited: isMetadataProhibited(metadata),
  });
  if (safety.status === 'prohibited') return safety;
  if (skip) return safety;

  const { isFileApprovedByPrism, addToPrismQueue } = await import('./prismQueueService');
  if (await isFileApprovedByPrism(fileId)) return safety;

  const dmca = await runDMCACheck(loadPreview);
  if (dmca.passed) return safety;

  const queueItemId = await addToPrismQueue({
    fileId,
    ownerPnIdentifier,
    flagSource: 'bot',
    reporterPnIdentifier: null,
    reportType: 'dmca_bot',
  });
  const { addContentNotice } = await import('./contentNoticesService');
  await addContentNotice({
    ownerPnIdentifier,
    fileId,
    type: 'pending_review',
    source: 'bot',
  });
  return { status: 'pending_review', reason: dmca.reason, queueItemId: queueItemId || undefined };
}

/** Writes the 422 / 202 response for a blocked outcome. Returns true when it responded. */
export function respondPublishModeration(
  res: Response,
  outcome: PublishModerationOutcome,
  requestId?: string
): boolean {
  if (outcome.status === 'prohibited') {
    res.status(422).json({
      status: 'prohibited',
      error: 'Content prohibited',
      message:
        outcome.reason ||
        'This content cannot be made public on the network. Your file remains private. Upload a new file to retry.',
      ...(requestId && { requestId }),
    });
    return true;
  }
  if (outcome.status === 'pending_review') {
    res.status(202).json({
      status: 'pending_review',
      error: 'Content flagged for DMCA review',
      message:
        outcome.reason || 'This content has been flagged for copyright review and is pending human review.',
      queueItemId: outcome.queueItemId,
      ...(requestId && { requestId }),
    });
    return true;
  }
  return false;
}
