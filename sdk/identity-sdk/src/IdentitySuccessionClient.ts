/**
 * Public identity succession lookups for L5 integrators.
 */

import {
  buildQuery,
  normalizeApiEndpoint,
  parseJsonResponse,
  throwIfNotOk
} from './integrator/pnApiClient';
import type { IntegratorClientConfig, SuccessorInfo } from './integrator/types';

export type { SuccessorInfo } from './integrator/types';

export class IdentitySuccessionClient {
  private apiEndpoint: string;

  constructor(config: IntegratorClientConfig = {}) {
    this.apiEndpoint = normalizeApiEndpoint(config.apiEndpoint);
  }

  async getSuccessor(pnIdentifier: string): Promise<SuccessorInfo> {
    const res = await fetch(
      `${this.apiEndpoint}/api/v1/identity/successor${buildQuery({ pn_identifier: pnIdentifier })}`
    );
    const data = await parseJsonResponse<SuccessorInfo>(res);
    await throwIfNotOk(res, data);
    return data;
  }
}

export function createIdentitySuccessionClient(
  config?: IntegratorClientConfig
): IdentitySuccessionClient {
  return new IdentitySuccessionClient(config);
}
