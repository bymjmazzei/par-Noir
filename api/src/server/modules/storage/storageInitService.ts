import {
  CONTENT_CLASSES,
  JSON_BLOB_PATHS,
  METADATA_DIR,
  INTEGRATORS_DIR,
  MESSAGES_DIR,
  TABLE_PATHS,
  ensureSocialCloudOnCredentials,
  listConnectedProviders,
  pnRootFolderName,
  resolveSocialCloudProvider,
  type StorageCredentialsEnvelope,
  type StorageProviderId
} from '@par-noir/user-owned-storage';
import { defaultDevicePolicy } from '@par-noir/device-auth';
import { SqliteBlobTableAdapter } from '@par-noir/user-owned-storage';
import { storageCredentialsService } from '../storageCredentialsService';
import { createBlobStoreForProvider } from './blobAdapters';

const PORTABLE_TABLES = [
  { id: 'third-party-permissions', keyColumn: 'toolId', path: TABLE_PATHS.thirdPartyPermissions },
  { id: 'connections', keyColumn: 'connectionId', path: TABLE_PATHS.connections },
  { id: 'notifications', keyColumn: 'notification_id', path: TABLE_PATHS.notifications },
  { id: 'public-file-index', keyColumn: 'fileId', path: TABLE_PATHS.publicFileIndex },
  { id: 'owner-file-index', keyColumn: 'fileId', path: TABLE_PATHS.ownerFileIndex },
  { id: 'zkp-data-points', keyColumn: 'dataPointId', path: TABLE_PATHS.zkpDataPoints },
  { id: 'devices', keyColumn: 'deviceId', path: TABLE_PATHS.devices },
  { id: 'groups', keyColumn: 'memberKey', path: TABLE_PATHS.groups },
  { id: 'followers', keyColumn: 'followerPnIdentifier', path: TABLE_PATHS.followers },
  { id: 'following', keyColumn: 'followingKey', path: TABLE_PATHS.following },
  { id: 'activity-ledger', keyColumn: 'activity_id', path: TABLE_PATHS.activityLedger },
  { id: 'messaging-ledger', keyColumn: 'message_activity_id', path: TABLE_PATHS.messagingLedger },
  { id: 'message-requests', keyColumn: 'requestId', path: TABLE_PATHS.messageRequests },
  { id: 'data-point-requests', keyColumn: 'requestId', path: TABLE_PATHS.dataPointRequests },
  { id: 'inbox', keyColumn: 'participantPnIdentifier', path: `${MESSAGES_DIR}/inbox` },
  { id: 'recovery-custodians', keyColumn: 'custodianId', path: TABLE_PATHS.recovery },
  { id: 'recovery-pending', keyColumn: 'shareIndex', path: `${METADATA_DIR}/recovery-pending` },
  { id: 'recovery-requests', keyColumn: 'requestId', path: `${METADATA_DIR}/recovery-requests` },
  { id: 'preferences-interactions', keyColumn: 'interaction_id', path: TABLE_PATHS.preferences },
  { id: 'prism-ledger', keyColumn: 'activity_id', path: TABLE_PATHS.prismLedger }
] as const;

function rootPrefix(pnIdentifier: string, credentials: StorageCredentialsEnvelope): string {
  const layout = credentials.cachedLayout;
  if (layout?.pathPrefix) {
    return layout.pathPrefix.endsWith('/') ? layout.pathPrefix : `${layout.pathPrefix}/`;
  }
  return `${pnRootFolderName(pnIdentifier)}/`;
}

/**
 * Initialize portable provider layout (S3, Dropbox, Azure, OneDrive, FTP).
 * Google Drive init remains in server.ts unchanged.
 */
export async function initializePortableStorage(
  pnIdentifier: string,
  credentials: StorageCredentialsEnvelope,
  providerOverride?: StorageProviderId
): Promise<{ pathPrefix: string }> {
  const provider = providerOverride ?? resolveSocialCloudProvider(credentials);
  if (!provider || provider === 'google_drive') {
    throw new Error('initializePortableStorage called for google_drive');
  }

  const socialAccountId =
    credentials.socialCloudProvider === provider
      ? credentials.socialCloudAccountId
      : undefined;

  const prefix = rootPrefix(pnIdentifier, credentials);
  const blobStore = await createBlobStoreForProvider(
    pnIdentifier,
    credentials,
    provider,
    socialAccountId
  );

  const dirs = [
    prefix,
    `${prefix}${METADATA_DIR}/`,
    `${prefix}${INTEGRATORS_DIR}/`,
    `${prefix}${MESSAGES_DIR}/`,
    `${prefix}${MESSAGES_DIR}/attachments/`
  ];

  for (const dir of CONTENT_CLASSES) {
    dirs.push(`${prefix}${METADATA_DIR}/${dir}/`);
  }

  for (const dir of dirs) {
    await blobStore.mkdir(dir);
  }

  const tableAdapter = new SqliteBlobTableAdapter(blobStore, prefix);
  for (const schema of PORTABLE_TABLES) {
    await tableAdapter.ensureTable(schema);
  }

  for (const cc of CONTENT_CLASSES) {
    await tableAdapter.ensureTable({
      id: `${cc}-public-index`,
      keyColumn: 'fileId',
      path: `${METADATA_DIR}/${cc}/${cc}-public-index`
    });
    await tableAdapter.ensureTable({
      id: `${cc}-owner-index`,
      keyColumn: 'fileId',
      path: `${METADATA_DIR}/${cc}/${cc}-owner-index`
    });
  }

  const profileKey = `${prefix}${JSON_BLOB_PATHS.profile}`;
  const existingProfile = await blobStore.head(profileKey);
  if (!existingProfile) {
    const profile = {
      identifier: pnIdentifier,
      updatedAt: new Date().toISOString()
    };
    await blobStore.put(profileKey, Buffer.from(JSON.stringify(profile), 'utf8'), {
      contentType: 'application/json'
    });
  }

  const prefsKey = `${prefix}${JSON_BLOB_PATHS.preferences}`;
  const existingPrefs = await blobStore.head(prefsKey);
  if (!existingPrefs) {
    const prefs = {
      identifier: pnIdentifier,
      updatedAt: new Date().toISOString(),
      tagPreferences: []
    };
    await blobStore.put(prefsKey, Buffer.from(JSON.stringify(prefs), 'utf8'), {
      contentType: 'application/json'
    });
  }

  const policyKey = `${prefix}${JSON_BLOB_PATHS.devicePolicy}`;
  const existingPolicy = await blobStore.head(policyKey);
  if (!existingPolicy) {
    await blobStore.put(policyKey, Buffer.from(JSON.stringify(defaultDevicePolicy()), 'utf8'), {
      contentType: 'application/json'
    });
  }

  credentials.cachedLayout = {
    ...credentials.cachedLayout,
    pathPrefix: prefix
  };
  const updated = ensureSocialCloudOnCredentials({
    ...credentials,
    cachedLayout: { ...credentials.cachedLayout, pathPrefix: prefix },
    socialCloudProvider: provider,
    primaryProvider: provider
  });

  await storageCredentialsService.upsertCredentials(pnIdentifier, updated);

  return { pathPrefix: prefix };
}

export function shouldInitializePortable(credentials: StorageCredentialsEnvelope): boolean {
  const social = resolveSocialCloudProvider(credentials);
  return social !== 'google_drive';
}

export function inferPrimaryProviderFromCredentials(
  credentials: StorageCredentialsEnvelope
): StorageCredentialsEnvelope {
  return ensureSocialCloudOnCredentials(credentials);
}

/** Set social cloud on first connect when unset */
export function assignSocialCloudIfUnset(
  credentials: StorageCredentialsEnvelope,
  newProvider: StorageProviderId,
  accountId?: string
): StorageCredentialsEnvelope {
  const connected = listConnectedProviders(credentials);
  const hasSocial =
    credentials.socialCloudProvider != null || credentials.primaryProvider != null;
  if (hasSocial) {
    return credentials;
  }
  return {
    ...credentials,
    socialCloudProvider: newProvider,
    primaryProvider: newProvider,
    socialCloudAccountId: accountId
  };
}
