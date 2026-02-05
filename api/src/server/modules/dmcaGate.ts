/**
 * DMCA Gate
 * Runs DMCA check before content is indexed (private→indexed)
 * Fetches file via Google Drive proxy, runs Gemini check.
 * Video/audio: samples clips for cost-effective check. Images: full check.
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

function isVideoOrAudio(mimeType: string): boolean {
  const base = (mimeType || '').split(';')[0].trim().toLowerCase();
  return base.startsWith('video/') || base.startsWith('audio/');
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
      console.warn('[DMCA Gate] Sampling failed for large video/audio; allowing (fail open)');
      return { passed: true };
    }

    const result = await gemini.checkDMCA(buffer, effectiveMime);
    if (result.flagged) {
      return { passed: false, reason: result.reason || 'Content flagged for DMCA review' };
    }
    return { passed: true };
  } catch (err) {
    console.warn('[DMCA Gate] Check failed, allowing content:', (err as Error)?.message);
    return { passed: true }; // Fail open
  }
  return { passed: true };
}
