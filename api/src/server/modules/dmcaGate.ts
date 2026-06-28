/**
 * DMCA Gate
 * Runs DMCA check before content is indexed (private→indexed)
 * Fetches file via Google Drive proxy, runs Gemini check.
 * Video/audio: samples clips for cost-effective check. Images: full check.
 *
 * Fail policy: DMCA_GATE_FAIL_MODE=open|closed (default: open).
 * - open: On error or sampling failure, allow content (availability over strictness).
 * - closed: On error or sampling failure, treat as flagged (content goes to Prism queue for human review).
 */

import { getGeminiModerationService } from './geminiModerationService';
import { getMediaDuration, extractRandomClips } from './mediaSamplingService';

export interface DMCAGateResult {
  passed: boolean;
  reason?: string;
}

interface DriveProxyLike {
  downloadFile(userPnIdentifier: string, fileId: string, accountId?: string): Promise<Blob>;
}

const FALLBACK_MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const FAIL_MODE = (process.env.DMCA_GATE_FAIL_MODE || 'open').toLowerCase();

function isVideoOrAudio(mimeType: string): boolean {
  const base = (mimeType || '').split(';')[0].trim().toLowerCase();
  return base.startsWith('video/') || base.startsWith('audio/');
}

/** Encrypted thoughts/thumbnails cannot be meaningfully moderated before publish. */
export function shouldSkipDmcaGate(params: {
  isThoughtThumbnail?: boolean;
  thought?: unknown;
  textPost?: unknown;
}): boolean {
  if (params.isThoughtThumbnail === true) return true;
  return !!(params.thought || params.textPost);
}

/** Thoughts: Postgres is feed truth; companion spreadsheet can be created after HTTP response. */
export function shouldDeferCompanionMetadata(params: {
  isThoughtThumbnail?: boolean;
  thought?: unknown;
  textPost?: unknown;
}): boolean {
  return shouldSkipDmcaGate(params);
}

/**
 * Run DMCA check on file before allowing it to be indexed.
 * Video/audio: samples random clips. Images: full file. Other: full file.
 */
export async function runDMCACheck(
  googleDriveProxy: DriveProxyLike,
  ownerPnIdentifier: string,
  driveFileId: string,
  mimeType: string,
  accountId?: string
): Promise<DMCAGateResult> {
  try {
    const blob = await googleDriveProxy.downloadFile(ownerPnIdentifier, driveFileId, accountId);
    const buffer = Buffer.from(await blob.arrayBuffer());
    const effectiveMime = mimeType || blob.type || 'application/octet-stream';
    const gemini = getGeminiModerationService();

    if (isVideoOrAudio(effectiveMime)) {
      const duration = await getMediaDuration(buffer, effectiveMime);
      const clipBuffers = await extractRandomClips(buffer, effectiveMime, duration);
      if (clipBuffers.length > 0) {
        const clipMime = effectiveMime.startsWith('audio/') ? 'audio/mpeg' : 'video/mp4';
        const clips = clipBuffers.map((buf) => ({ buffer: buf, mimeType: clipMime }));
        const result = await gemini.checkDMCASampled(clips);
        if (result.flagged) {
          return { passed: false, reason: result.reason || 'Content flagged for DMCA review' };
        }
        return { passed: true };
      }
      if (buffer.length <= FALLBACK_MAX_BYTES) {
        const result = await gemini.checkDMCA(buffer, effectiveMime);
        if (result.flagged) {
          return { passed: false, reason: result.reason || 'Content flagged for DMCA review' };
        }
        return { passed: true };
      }
      console.warn('[DMCA Gate] Sampling failed for large video/audio;', FAIL_MODE === 'closed' ? 'fail closed (pending review)' : 'allowing (fail open)');
      if (FAIL_MODE === 'closed') {
        return { passed: false, reason: 'Check failed; content pending human review.' };
      }
      return { passed: true };
    }

    const result = await gemini.checkDMCA(buffer, effectiveMime);
    if (result.flagged) {
      return { passed: false, reason: result.reason || 'Content flagged for DMCA review' };
    }
    return { passed: true };
  } catch (err) {
    console.warn('[DMCA Gate] Check failed:', (err as Error)?.message, FAIL_MODE === 'closed' ? '(fail closed)' : '(allowing)');
    if (FAIL_MODE === 'closed') {
      return { passed: false, reason: 'Check failed; content pending human review.' };
    }
    return { passed: true };
  }
  return { passed: true };
}
