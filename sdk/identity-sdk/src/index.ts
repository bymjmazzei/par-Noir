/**
 * @identity-protocol/identity-sdk — L5 integrator kit (one façade).
 *
 * User OAuth is `/oauth/*` only. Do not import legacy IdentitySDK paths.
 */

export {
  PNOAuthClient,
  createPNOAuthClient,
  type PNOAuthConfig,
  type PNOAuthTokenResponse,
  type PNOAuthUserInfo,
  type PNOAuthSession
} from './PNOAuthClient';

export {
  IntegratorStorageClient,
  createIntegratorStorageClient,
  type IntegratorStorageRoot,
  type IntegratorClientConfig as IntegratorStorageClientConfig,
  type DriveFileRef,
  type DriveFolderRef,
  SCOPE_CLOUD_APP
} from './IntegratorStorageClient';

export {
  IntegratorZkpClient,
  createIntegratorZkpClient,
  type ZkpDataPointProof,
  type ZkpDataPointsResponse
} from './IntegratorZkpClient';

export {
  IdentitySuccessionClient,
  createIdentitySuccessionClient,
  type SuccessorInfo
} from './IdentitySuccessionClient';

export {
  PublicIndexClient,
  createPublicIndexClient,
  type PublicIndexFile,
  type PublicIndexResponse
} from './PublicIndexClient';

export {
  PnIntegratorClient,
  createPnIntegratorClient,
  type PnIntegratorClientConfig,
  PN_INTEGRATOR_SCOPES
} from './PnIntegratorClient';

export {
  PnApiError,
  SCOPE_OPENID,
  SCOPE_PROFILE,
  PN_INTEGRATOR_SCOPES as PN_OAUTH_INTEGRATOR_SCOPES,
  normalizeApiEndpoint
} from './integrator/pnApiClient';
