/**
 * DMCA Gate
 * Runs DMCA check before content is indexed (private→indexed)
 * Fetches file via Google Drive proxy, runs Gemini check
 */

import { getGeminiModerationService } from './geminiModerationService';

export interface DMCAGateResult {
  passed: boolean;
  reason?: string;
}

interface DriveProxyLike {
  downloadFile(userPnIdentifier: string, fileId: string, accountId?: string): Promise<Blob>;
}

/**
 * Run DMCA check on file before allowing it to be indexed.
 * Returns { passed: true } if content is OK, { passed: false, reason } if flagged.
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
    const gemini = getGeminiModerationService();
    const result = await gemini.checkDMCA(buffer, mimeType || blob.type || 'application/octet-stream');
    if (result.flagged) {
      return { passed: false, reason: result.reason || 'Content flagged for DMCA review' };
    }
    return { passed: true };
  } catch (err) {
    console.warn('[DMCA Gate] Check failed, allowing content:', (err as Error)?.message);
    return { passed: true }; // Fail open
  }
}
