export type ThirdPartyStatus = 'active' | 'inactive' | 'revoked';

export interface ThirdPartyIndexer {
  id: string;
  name: string;
  description?: string;
  website?: string;
  status: ThirdPartyStatus;
  requestedScopes: string[];
  createdAt: string;
  updatedAt: string;
  isAuthorized?: boolean;
}

export interface ThirdPartyAccess {
  identity: string;
  thirdPartyId: string;
  isEnabled: boolean;
  grantedScopes: string[];
  status: ThirdPartyStatus;
  grantedAt: string;
  updatedAt: string;
}

export interface IndexingPermissions {
  mode: 'all' | 'custom' | 'none';
  allowed?: string[];
  blocked?: string[];
  updatedAt?: string;
}

