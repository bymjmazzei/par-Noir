import {
  resolveSocialCloudProvider,
  type StorageCredentialsEnvelope,
  type StorageProviderId,
} from '@par-noir/user-owned-storage';
import { ensureDeviceDriveLayout, type DeviceDriveLayout } from '../deviceDriveLayout.js';
import { getSessionDriveIndex } from '../sessionMemory.js';
import { socialMigrationDirection } from './migrateSocialCloud.js';
import { initializeDevicePortableLayout } from './portableLayout.js';
import { tablesSocialContextFor, type DeviceSocialContext } from './socialContext.js';

export type SocialCloudMove = {
  direction: ReturnType<typeof socialMigrationDirection>;
  sourceProvider: StorageProviderId;
  source: DeviceSocialContext;
  target: DeviceSocialContext;
  /** What the API records once the copy is done. */
  targetLayout: { pathPrefix: string } | { pnDriveIndex: DeviceDriveLayout };
};

function sameCloud(credentials: StorageCredentialsEnvelope, provider: StorageProviderId, accountId?: string) {
  if (resolveSocialCloudProvider(credentials) !== provider) return false;
  return provider === 'google_drive' || !accountId || accountId === credentials.socialCloudAccountId;
}

async function openSource(
  pnIdentifier: string,
  credentials: StorageCredentialsEnvelope,
  googleAccessToken: string | undefined,
  fetchImpl?: typeof fetch
): Promise<DeviceSocialContext> {
  if (resolveSocialCloudProvider(credentials) !== 'google_drive') {
    const ctx = await tablesSocialContextFor(pnIdentifier, credentials, { fetchImpl });
    if (!ctx) throw new Error('Current social cloud is not connected on this device.');
    return ctx;
  }
  const index = getSessionDriveIndex(pnIdentifier);
  if (!googleAccessToken || !index) throw new Error('Reconnect Google Drive on this device first.');
  return { kind: 'google_drive', accessToken: googleAccessToken, index };
}

/**
 * Open the current and the new social cloud for a move, laying out the new
 * one first. Nothing on the API changes until the copy is reported done.
 */
export async function openSocialCloudMove(args: {
  pnIdentifier: string;
  credentials: StorageCredentialsEnvelope;
  targetProvider: StorageProviderId;
  targetAccountId?: string;
  googleAccessToken?: string;
  fetchImpl?: typeof fetch;
}): Promise<SocialCloudMove> {
  const { pnIdentifier, credentials, targetProvider, targetAccountId, googleAccessToken, fetchImpl } = args;
  if (sameCloud(credentials, targetProvider, targetAccountId)) {
    throw new Error('That cloud already holds your social data.');
  }
  const sourceProvider = resolveSocialCloudProvider(credentials);
  const source = await openSource(pnIdentifier, credentials, googleAccessToken, fetchImpl);

  if (targetProvider === 'google_drive') {
    if (!googleAccessToken) throw new Error('Connect Google Drive on this device first.');
    const pnDriveIndex = await ensureDeviceDriveLayout(googleAccessToken, pnIdentifier, fetchImpl);
    return {
      direction: socialMigrationDirection(source.kind, 'google_drive'),
      sourceProvider,
      source,
      target: { kind: 'google_drive', accessToken: googleAccessToken, index: pnDriveIndex },
      targetLayout: { pnDriveIndex },
    };
  }

  const targetCredentials: StorageCredentialsEnvelope = {
    ...credentials,
    socialCloudProvider: targetProvider,
    primaryProvider: targetProvider,
    socialCloudAccountId: targetAccountId,
    cachedLayout: undefined,
    cachedFolderIds: undefined,
  };
  const layout = await initializeDevicePortableLayout(pnIdentifier, targetCredentials, { fetchImpl });
  if (!layout) throw new Error('Could not lay out the new cloud.');
  const target = await tablesSocialContextFor(
    pnIdentifier,
    { ...targetCredentials, cachedLayout: { pathPrefix: layout.pathPrefix } },
    { fetchImpl }
  );
  if (!target) throw new Error('New cloud is not connected on this device.');
  return {
    direction: socialMigrationDirection(source.kind, 'tables'),
    sourceProvider,
    source,
    target,
    targetLayout: { pathPrefix: layout.pathPrefix },
  };
}
