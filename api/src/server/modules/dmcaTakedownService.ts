/**
 * DMCA Takedown Service
 * Executes index-only "takedown": removes content from par Noir index and third-party indexes.
 * We do not host content and cannot delete files from the user's Google Drive.
 */

import { AggregatorMetadataServiceDB } from './aggregatorMetadataServiceDB';
import { addContentNotice } from './contentNoticesService';
import { validatePublicRowShareFields } from './publicRowGuard';

export type TakedownSource = 'prism_denied' | 'dmca_notice';

/**
 * Execute takedown: set isPublic false (remove from index) and add content notice for owner.
 */
export async function executeTakedown(
  fileId: string,
  reason: string,
  source: TakedownSource
): Promise<{ ok: boolean; error?: string }> {
  try {
    const service = AggregatorMetadataServiceDB.getInstance();
    const entry = await service.getFileMetadata(fileId);
    if (!entry) {
      console.warn(`[DMCA Takedown] File not found in index: ${fileId}`);
      return { ok: false, error: 'File not found in index' };
    }
    const ownerPn = entry.pnIdentifier ?? '';
    if (!ownerPn) {
      console.warn(`[DMCA Takedown] No owner for file: ${fileId}`);
      return { ok: false, error: 'No owner' };
    }
    await service.updateMetadata(fileId, { isPublic: false });
    await addContentNotice({
      ownerPnIdentifier: ownerPn,
      fileId,
      type: 'taken_down',
      reason,
      source,
    });
    console.log(`[DMCA Takedown] Removed from index: ${fileId} (source: ${source})`);
    return { ok: true };
  } catch (err) {
    const message = (err as Error)?.message ?? String(err);
    console.error(`[DMCA Takedown] Failed for ${fileId}:`, message);
    return { ok: false, error: message };
  }
}

/**
 * Restore content to the index (re-list). Used after counter-notice window with no legal action.
 * Refuses to re-list when the row lacks usable share material.
 */
export async function restoreContent(fileId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const service = AggregatorMetadataServiceDB.getInstance();
    const entry = await service.getFileMetadata(fileId);
    if (!entry) {
      console.warn(`[DMCA Restore] File not found in index: ${fileId}`);
      return { ok: false, error: 'File not found' };
    }
    const meta = entry.metadata as {
      publicToken?: unknown;
      publicContentRef?: unknown;
    };
    const failure = validatePublicRowShareFields({
      isPublic: true,
      publicToken: meta.publicToken,
      publicContentRef: meta.publicContentRef,
    });
    if (failure) {
      console.warn(`[DMCA Restore] Refusing restore without share fields: ${fileId} (${failure.error})`);
      return { ok: false, error: failure.error_description };
    }
    const ownerPn = entry.pnIdentifier ?? '';
    await service.updateMetadata(fileId, { isPublic: true });
    const { addContentNotice } = await import('./contentNoticesService');
    await addContentNotice({
      ownerPnIdentifier: ownerPn,
      fileId,
      type: 'restored',
      reason: 'Content re-listed on the index after counter-notice period.',
      source: 'counter_notice',
    });
    console.log(`[DMCA Restore] Re-listed on index: ${fileId}`);
    return { ok: true };
  } catch (err) {
    const message = (err as Error)?.message ?? String(err);
    console.error(`[DMCA Restore] Failed for ${fileId}:`, message);
    return { ok: false, error: message };
  }
}
