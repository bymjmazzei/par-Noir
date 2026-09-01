import type { IntegratorPermissionManifest } from '@par-noir/standard-data-points';

export type ApplicationStatus = 'pending' | 'approved' | 'rejected';
export type OAuthClientRegistryStatus = 'active' | 'suspended' | 'revoked';
export type CommercialLicenseStatus = 'active' | 'suspended' | 'revoked' | 'expired';
export type LicenseTier = 'free' | 'commercial';
export type LicenseType = 'annual' | 'perpetual';

export interface PlatformApplication {
  applicationId: string;
  clientId: string;
  name: string;
  description?: string;
  redirectUris: string[];
  scopes: string[];
  permissionManifest?: IntegratorPermissionManifest;
  ownerPnId: string;
  status: ApplicationStatus;
  submittedAt: string;
  reviewedAt?: string;
  reviewedByPn?: string;
  notes?: string;
}

export interface PlatformOAuthClientRow {
  clientId: string;
  name: string;
  description?: string;
  redirectUris: string[];
  scopes: string[];
  permissionManifest?: IntegratorPermissionManifest;
  ownerPnId: string;
  status: OAuthClientRegistryStatus;
  verified: boolean;
  commercialLicenseId?: string;
  approvedAt?: string;
  updatedAt: string;
  notes?: string;
}

export interface PlatformCommercialLicense {
  licenseId: string;
  granteePnId: string;
  granteeClientId?: string;
  tier: LicenseTier;
  type: LicenseType;
  scopes: string[];
  rateLimits: { requestsPerMinute: number; requestsPerDay: number };
  status: CommercialLicenseStatus;
  issuedAt: string;
  expiresAt?: string;
  notes?: string;
  updatedAt: string;
}

export interface PlatformRegistrySyncResult {
  syncedAt: string;
  oauthClientsUpserted: number;
  licensesUpserted: number;
  oauthClientsDeactivated: number;
}
