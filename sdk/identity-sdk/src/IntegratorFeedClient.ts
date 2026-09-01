/**
 * L5 integrator feed client — query public metadata index by indexer.
 */

import {
  CENTRAL_INDEX_PATH,
  type CentralIndexResponse
} from '@par-noir/aggregator-domain';
import {
  buildQuery,
  integratorAuthHeaders,
  normalizeApiEndpoint,
  parseJsonResponse,
  throwIfNotOk
} from './integrator/pnApiClient';
import type { IntegratorApiContext, IntegratorClientConfig } from './integrator/types';

export type { CentralIndexResponse };

export class IntegratorFeedClient {
  private apiEndpoint: string;

  constructor(config: IntegratorClientConfig = {}) {
    this.apiEndpoint = normalizeApiEndpoint(config.apiEndpoint);
  }

  async listByIndexerId(
    ctx: IntegratorApiContext | string,
    params: { indexerId: string; limit?: number; offset?: number }
  ): Promise<CentralIndexResponse> {
    const res = await fetch(
      `${this.apiEndpoint}${CENTRAL_INDEX_PATH}${buildQuery({
        indexerId: params.indexerId,
        limit: params.limit,
        offset: params.offset
      })}`,
      { headers: integratorAuthHeaders(ctx) }
    );
    const data = await parseJsonResponse<CentralIndexResponse>(res);
    await throwIfNotOk(res, data);
    return data;
  }
}

export function createIntegratorFeedClient(config?: IntegratorClientConfig): IntegratorFeedClient {
  return new IntegratorFeedClient(config);
}
