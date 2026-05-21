/**
 * Public feed metadata via API key (content scope).
 */

import {
  apiKeyHeaders,
  normalizeApiEndpoint,
  parseJsonResponse,
  throwIfNotOk
} from './integrator/pnApiClient';
import type { IntegratorClientConfig, PublicIndexResponse } from './integrator/types';

export type { PublicIndexFile, PublicIndexResponse } from './integrator/types';

export class PublicIndexClient {
  private apiEndpoint: string;

  constructor(config: IntegratorClientConfig = {}) {
    this.apiEndpoint = normalizeApiEndpoint(config.apiEndpoint);
  }

  async getPublicIndex(identityId: string, apiKey: string): Promise<PublicIndexResponse> {
    const res = await fetch(
      `${this.apiEndpoint}/api/v1/public-index/${encodeURIComponent(identityId)}`,
      { headers: apiKeyHeaders(apiKey) }
    );
    const data = await parseJsonResponse<PublicIndexResponse>(res);
    await throwIfNotOk(res, data);
    return data;
  }
}

export function createPublicIndexClient(config?: IntegratorClientConfig): PublicIndexClient {
  return new PublicIndexClient(config);
}
