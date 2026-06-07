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

  /**
   * Server-to-server fetch after user granted consent (API key + identity_id).
   */
  async getDataPointWithApiKey(
    apiKey: string,
    dataPointId: string,
    identityId: string,
    clientId: string
  ): Promise<{ success: boolean; dataPoint?: unknown }> {
    const res = await fetch(
      `${this.apiEndpoint}/api/v1/data-points/${encodeURIComponent(dataPointId)}${buildQuery({
        identity_id: identityId,
        client_id: clientId
      })}`,
      { headers: { 'X-API-Key': apiKey } }
    );
    const data = await parseJsonResponse<{ success: boolean; dataPoint?: unknown }>(res);
    await throwIfNotOk(res, data);
    return data;
  }

  /** Create a consent request the user approves in the dashboard Privacy tab. */
  async requestDataPointsWithApiKey(
    apiKey: string,
    params: {
      identityId: string;
      clientId: string;
      dataPoints: string[];
      reason?: string;
      toolName?: string;
    }
  ): Promise<{ success: boolean; requestId: string; status: string }> {
    const res = await fetch(`${this.apiEndpoint}/api/v1/data-points/request`, {
      method: 'POST',
      headers: {
        'X-API-Key': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        identity_id: params.identityId,
        client_id: params.clientId,
        data_points: params.dataPoints,
        reason: params.reason,
        tool_name: params.toolName
      })
    });
    const data = await parseJsonResponse<{ success: boolean; requestId: string; status: string }>(res);
    await throwIfNotOk(res, data);
    return data;
  }
}

export function createIntegratorZkpClient(config?: IntegratorClientConfig): IntegratorZkpClient {
  return new IntegratorZkpClient(config);
}
