/**
 * Fetch ZKP data point proofs for L5 integrators (after user consent).
 */

import {
  authHeaders,
  buildQuery,
  normalizeApiEndpoint,
  parseJsonResponse,
  throwIfNotOk
} from './integrator/pnApiClient';
import type { IntegratorClientConfig, ZkpDataPointsResponse } from './integrator/types';

export type { ZkpDataPointProof, ZkpDataPointsResponse } from './integrator/types';

export class IntegratorZkpClient {
  private apiEndpoint: string;

  constructor(config: IntegratorClientConfig = {}) {
    this.apiEndpoint = normalizeApiEndpoint(config.apiEndpoint);
  }

  /**
   * Returns ZKP proofs only — never pn name, passcode, or raw PII.
   * Request scopes like zkp:age_attestation or pass dataPoints explicitly.
   */
  async getDataPoints(
    accessToken: string,
    options?: { dataPoints?: string[] }
  ): Promise<ZkpDataPointsResponse> {
    const dataPoints = options?.dataPoints?.filter(Boolean);
    const res = await fetch(
      `${this.apiEndpoint}/oauth/zkp-data-points${buildQuery({
        data_points: dataPoints?.length ? dataPoints.join(',') : undefined
      })}`,
      { headers: authHeaders(accessToken) }
    );
    const data = await parseJsonResponse<ZkpDataPointsResponse>(res);
    await throwIfNotOk(res, data);
    return {
      success: data.success ?? true,
      dataPoints: data.dataPoints || []
    };
  }
}

export function createIntegratorZkpClient(config?: IntegratorClientConfig): IntegratorZkpClient {
  return new IntegratorZkpClient(config);
}
