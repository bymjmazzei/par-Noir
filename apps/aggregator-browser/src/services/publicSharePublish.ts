/**
 * Browser helper: upload public ciphertext envelope, ensure-public, return API fields.
 */

import {
  materializePublicShare,
  revokePublicContentRef,
  type PublicContentRef,
  type PublicShareGenerationResult,
} from '@par-noir/aggregator-domain';
import { API_ENDPOINT } from '../config/api';
import { ownerApiHeadersAsync } from './ownerApiHeaders';
import { uploadStorageFile } from './storageApiClient';
import { PNOAuthService } from './pnOAuthService';

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.includes(',') ? result.split(',')[1]! : result);
    };
    reader.onerror = () => reject(new Error('Failed to read envelope blob'));
    reader.readAsDataURL(blob);
  });
}

export async function publishPublicShare(params: {
  generation: PublicShareGenerationResult;
  accessToken: string;
  accountId: string;
  backend?: string;
  envelopeFileName?: string;
}): Promise<{ publicToken: string; publicContentRef: PublicContentRef }> {
  const session = PNOAuthService.loadSession();
  const pnIdentifier = session?.pnIdentifier;
  if (!pnIdentifier) {
    throw new Error('Unlock your pN to publish public content');
  }
  const backend = params.backend || 'google_drive';
  const headers = await ownerApiHeadersAsync(params.accessToken);

  const { publicToken, publicContentRef } = await materializePublicShare({
    generation: params.generation,
    apiBase: API_ENDPOINT,
    headers,
    backend,
    envelopeFileName: params.envelopeFileName,
    uploadEnvelope: async (blob, fileName) => {
      const base64 = await blobToBase64(blob);
      const { id } = await uploadStorageFile(params.accessToken, pnIdentifier, backend, {
        fileData: base64,
        fileName,
        mimeType: 'application/json',
        accountId: params.accountId,
        encrypt: false,
      });
      return { objectId: id };
    },
  });

  return { publicToken, publicContentRef };
}

export async function revokePublishedPublicContent(params: {
  objectId: string;
  accessToken: string;
  backend?: string;
}): Promise<void> {
  const headers = await ownerApiHeadersAsync(params.accessToken);
  await revokePublicContentRef({
    objectId: params.objectId,
    backend: params.backend || 'google_drive',
    apiBase: API_ENDPOINT,
    headers,
  });
}
