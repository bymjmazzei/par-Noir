/**
 * DMCA Gate
 * Runs DMCA check on the public feed preview before content is indexed (private→indexed).
 * Video: samples clips from the SD preview. Images: full poster check.
 * Audio has no visual preview, so it always goes to Prism human review.
 *
 * Fail policy: DMCA_GATE_FAIL_MODE=open|closed (default: open).
 * - open: On error or sampling failure, allow content (availability over strictness).
 * - closed: On error or sampling failure, treat as flagged (content goes to Prism queue for human review).
 */

import { getGeminiModerationService } from './geminiModerationService';
import { getMediaDuration, extractRandomClips } from './mediaSamplingService';
import type { ModerationPreview } from './moderationPreview';

export interface DMCAGateResult {
  passed: boolean;
  reason?: string;
}

const FALLBACK_MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const FAIL_MODE = (process.env.DMCA_GATE_FAIL_MODE || 'open').toLowerCase();

export const AUDIO_REVIEW_REASON =
  'Audio posts are reviewed by a person before they go public. You will be notified when review is done.';

/** Encrypted notes/thumbnails cannot be meaningfully moderated before publish. */
export function shouldSkipDmcaGate(params: {
  isNoteThumbnail?: boolean;
  thought?: unknown;
  note?: unknown;
  textPost?: unknown;
}): boolean {
  if (params.isNoteThumbnail === true) return true;
  return !!(params.note || params.thought || params.textPost);
}

/** Notes: Postgres is feed truth; companion spreadsheet can be created after HTTP response. */
export function shouldDeferCompanionMetadata(params: {
  isNoteThumbnail?: boolean;
  thought?: unknown;
  note?: unknown;
  textPost?: unknown;
}): boolean {
  return shouldSkipDmcaGate(params);
}

function failResult(): DMCAGateResult {
  if (FAIL_MODE === 'closed') {
    return { passed: false, reason: 'Check failed; content pending human review.' };
  }
  return { passed: true };
}

/**
 * Run DMCA check on the public preview before allowing it to be indexed.
 */
export async function runDMCACheck(loadPreview: () => Promise<ModerationPreview>): Promise<DMCAGateResult> {
  try {
    const preview = await loadPreview();
    if (preview.kind === 'audio') {
      return { passed: false, reason: AUDIO_REVIEW_REASON };
    }
    if (preview.kind === 'none') {
      return { passed: true };
    }
    const gemini = getGeminiModerationService();

    if (preview.kind === 'video') {
      const duration = await getMediaDuration(preview.buffer, preview.mimeType);
      const clipBuffers = await extractRandomClips(preview.buffer, preview.mimeType, duration);
      if (clipBuffers.length > 0) {
        const clips = clipBuffers.map((buf) => ({ buffer: buf, mimeType: 'video/mp4' }));
        const result = await gemini.checkDMCASampled(clips);
        if (result.flagged) {
          return { passed: false, reason: result.reason || 'Content flagged for DMCA review' };
        }
        return { passed: true };
      }
      if (preview.buffer.length <= FALLBACK_MAX_BYTES) {
        const result = await gemini.checkDMCA(preview.buffer, preview.mimeType);
        if (result.flagged) {
          return { passed: false, reason: result.reason || 'Content flagged for DMCA review' };
        }
        return { passed: true };
      }
      console.warn('[DMCA Gate] Sampling failed for large video preview;', FAIL_MODE === 'closed' ? 'fail closed (pending review)' : 'allowing (fail open)');
      return failResult();
    }

    const result = await gemini.checkDMCA(preview.buffer, preview.mimeType);
    if (result.flagged) {
      return { passed: false, reason: result.reason || 'Content flagged for DMCA review' };
    }
    return { passed: true };
  } catch (err) {
    console.warn('[DMCA Gate] Check failed:', (err as Error)?.message, FAIL_MODE === 'closed' ? '(fail closed)' : '(allowing)');
    return failResult();
  }
}
