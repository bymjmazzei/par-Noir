/**
 * Decrypt public feed media via blind proxy + slim shareKey.
 * Never relies on embedded shareEncrypted or peer Drive tokens.
 */

import { decryptPublicIndexedMedia } from '@par-noir/aggregator-domain';
import { API_ENDPOINT } from '../config/api';

export async function decryptPublicFeedMedia(
  fileId: string,
  publicToken: unknown,
  titleHint?: string
): Promise<Blob> {
  if (!fileId) throw new Error('fileId required for public media decrypt');
  return decryptPublicIndexedMedia({
    fileId,
    publicToken,
    apiBase: API_ENDPOINT,
    titleHint,
  });
}
