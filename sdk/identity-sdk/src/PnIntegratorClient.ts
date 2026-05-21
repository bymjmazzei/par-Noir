/**
 * Facade for L5 integrator apps: OAuth + Drive silo + ZKP + succession.
 */

import { PNOAuthClient, type PNOAuthConfig } from './PNOAuthClient';
import { IntegratorStorageClient } from './IntegratorStorageClient';
import { IntegratorZkpClient } from './IntegratorZkpClient';
import { IdentitySuccessionClient } from './IdentitySuccessionClient';
import { PublicIndexClient } from './PublicIndexClient';
import { PN_INTEGRATOR_SCOPES, SCOPE_CLOUD_APP } from './integrator/pnApiClient';

export interface PnIntegratorClientConfig extends PNOAuthConfig {
  /** Same as PNOAuthConfig.apiEndpoint */
}

export class PnIntegratorClient {
  readonly auth: PNOAuthClient;
  readonly storage: IntegratorStorageClient;
  readonly zkp: IntegratorZkpClient;
  readonly succession: IdentitySuccessionClient;
  readonly publicIndex: PublicIndexClient;

  constructor(config: PnIntegratorClientConfig) {
    const apiEndpoint = config.apiEndpoint;
    this.auth = new PNOAuthClient(config);
    this.storage = new IntegratorStorageClient({ apiEndpoint });
    this.zkp = new IntegratorZkpClient({ apiEndpoint });
    this.succession = new IdentitySuccessionClient({ apiEndpoint });
    this.publicIndex = new PublicIndexClient({ apiEndpoint });
  }
}

export function createPnIntegratorClient(config: PnIntegratorClientConfig): PnIntegratorClient {
  return new PnIntegratorClient(config);
}

export { PN_INTEGRATOR_SCOPES, SCOPE_CLOUD_APP };
