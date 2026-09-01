/**
 * L5 integrator publish client — public content refs and metadata index submission.
 */

import {
  CENTRAL_INDEX_PATH,
  ensurePublicContentRef as domainEnsurePublicContentRef,
  materializePublicShare as domainMaterializePublicShare,
  type PublicContentRef,
  type PublicMetadataSubmission,
  type PublicShareGenerationResult
} from '@par-noir/aggregator-domain';
import {
  integratorAuthHeaders,
  normalizeApiEndpoint,
  parseJsonResponse,
  throwIfNotOk
} from './integrator/pnApiClient';
import type { IntegratorApiContext, IntegratorClientConfig } from './integrator/types';

export type { PublicContentRef, PublicMetadataSubmission, PublicShareGenerationResult };

export class IntegratorPublishClient {
  private apiEndpoint: string;

  constructor(config: IntegratorClientConfig = {}) {
    this.apiEndpoint = normalizeApiEndpoint(config.apiEndpoint);
  }

  async ensurePublicContentRef(
    ctx: IntegratorApiContext | string,
    params: { objectId: string; backend?: string; publicUrl?: string }
  ): Promise<PublicContentRef> {
    return domainEnsurePublicContentRef({
      objectId: params.objectId,
      backend: params.backend,
      apiBase: this.apiEndpoint,
      headers: integratorAuthHeaders(ctx),
      publicUrl: params.publicUrl
    });
  }

  async materializePublicShare(
    ctx: IntegratorApiContext | string,
    params: {
      generation: PublicShareGenerationResult;
      backend?: string;
      envelopeFileName?: string;
      uploadEnvelope: (blob: Blob, fileName: string) => Promise<{ objectId: string; publicUrl?: string }>;
    }
  ): Promise<{ publicToken: string; publicContentRef: PublicContentRef; envelopeObjectId: string }> {
    return domainMaterializePublicShare({
      generation: params.generation,
      apiBase: this.apiEndpoint,
      headers: integratorAuthHeaders(ctx),
      backend: params.backend,
      envelopeFileName: params.envelopeFileName,
      uploadEnvelope: params.uploadEnvelope
    });
  }

  async submitMetadataIndex(
    ctx: IntegratorApiContext | string,
    metadata: PublicMetadataSubmission
  ): Promise<void> {
    let publicToken: string | undefined;
    if (metadata.publicToken) {
      publicToken =
        typeof metadata.publicToken === 'string'
          ? metadata.publicToken
          : JSON.stringify(metadata.publicToken);
    }

    const { pnIdentifier, ...metadataWithoutIdentity } = metadata;
    const payload = { ...metadataWithoutIdentity, publicToken };

    const res = await fetch(`${this.apiEndpoint}${CENTRAL_INDEX_PATH}`, {
      method: 'POST',
      headers: integratorAuthHeaders(ctx, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ metadata: payload, pnIdentifier })
    });
    const data = await parseJsonResponse<Record<string, unknown>>(res);
    await throwIfNotOk(res, data);
  }
}

export function createIntegratorPublishClient(
  config?: IntegratorClientConfig
): IntegratorPublishClient {
  return new IntegratorPublishClient(config);
}
