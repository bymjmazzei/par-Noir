/**
 * Shared types for owned-asset registry (no secrets).
 * @packageDocumentation
 */

export type OwnedAssetKind =
  | 'human'
  | 'api_key'
  | 'feed'
  | 'device'
  | 'ai_agent'
  | 'smart_device';

export type OwnedAssetStatus = 'active' | 'revoked' | 'suspended';

/** Public-safe metadata (labels, model names — never passcodes). */
export type OwnedAssetMetadata = Record<string, unknown>;

export interface OwnedAssetRecord {
  id: string;
  rootPnIdentifier: string;
  subjectPnIdentifier: string | null;
  kind: OwnedAssetKind;
  status: OwnedAssetStatus;
  metadata: OwnedAssetMetadata;
  apiKeyId: string | null;
  createdAt: string;
  updatedAt: string;
  revokedAt: string | null;
}

export type AssetDelegationStatus = 'active' | 'revoked';

export interface AssetDelegationRecord {
  id: string;
  ownedAssetId: string;
  delegateePnIdentifier: string | null;
  delegateeClientId: string | null;
  scope: string;
  expiresAt: string | null;
  status: AssetDelegationStatus;
  createdAt: string;
  updatedAt: string;
}

/** Non-sensitive entry for IPFS PNMetadata.ownedAssets */
export interface OwnedAssetManifestEntry {
  assetId: string;
  kind: OwnedAssetKind;
  subjectPnIdentifier?: string;
  label?: string;
  publicDetailCid?: string;
}
