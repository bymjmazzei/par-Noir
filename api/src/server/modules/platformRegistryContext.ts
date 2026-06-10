/**
 * Resolve operator pN Google Drive context for platform-registry.xlsx reads/writes.
 */

import { getUserDriveMetadataContext } from './driveMetadataHelper';
import { getPlatformRegistryPnIdentifier, isPlatformRegistryConfigured } from './platformOperatorService';

export async function getPlatformRegistryDriveContext() {
  if (!isPlatformRegistryConfigured()) {
    return null;
  }
  const registryPn = getPlatformRegistryPnIdentifier();
  if (!registryPn) return null;
  return getUserDriveMetadataContext(registryPn);
}

export class PlatformRegistryNotConfiguredError extends Error {
  constructor(message = 'Platform registry is not configured (PLATFORM_REGISTRY_PN_IDENTIFIER and operator Drive connection required)') {
    super(message);
    this.name = 'PlatformRegistryNotConfiguredError';
  }
}

export async function requirePlatformRegistryDriveContext() {
  const ctx = await getPlatformRegistryDriveContext();
  if (!ctx) {
    throw new PlatformRegistryNotConfiguredError();
  }
  return ctx;
}
