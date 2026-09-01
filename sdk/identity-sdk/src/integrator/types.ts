/**
 * Types for L5 integrator Drive and API responses.
 */

export interface IntegratorApiContext {
  accessToken: string;
  cloudAccessToken?: string;
  accountId?: string;
}

export interface IntegratorStorageRoot {
  integratorFolderId: string;
  integratorPath: string;
  clientId: string;
}

export interface DriveFileRef {
  id: string;
  name?: string;
  mimeType?: string;
  parents?: string[];
  [key: string]: unknown;
}

export interface DriveFolderRef {
  id: string;
  name?: string;
  parents?: string[];
}

export interface ZkpDataPointProof {
  dataPointId: string;
  proofType?: string;
  zkpProof?: string;
  verifiedAt?: string;
  expiresAt?: string;
  verificationLevel?: string;
}

export interface ZkpDataPointsResponse {
  success: boolean;
  dataPoints: ZkpDataPointProof[];
}

export interface SuccessorInfo {
  revoked: boolean;
  successorPnIdentifier?: string;
  effectiveAt?: string;
}

export interface PublicIndexFile {
  fileId?: string;
  isPublic?: boolean;
  [key: string]: unknown;
}

export interface PublicIndexResponse {
  identityId: string;
  files: PublicIndexFile[];
  total: number;
  updatedAt: string;
}

export interface IntegratorClientConfig {
  apiEndpoint?: string;
}
