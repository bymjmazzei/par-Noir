/**
 * Auto-subscribe user to L5 community feed when they grant OAuth to an approved indexer.
 */

import { PreferencesService } from './preferencesService';
import { getThirdPartyIndexersService } from './thirdPartyIndexersService';
import { isFirstPartyClient } from './integratorStoragePaths';

export async function autoSubscribeCommunityOnIntegratorGrant(params: {
  clientId: string;
  userAccessToken: string;
  metadataFolderId: string;
  normalizedPn: string;
  accountId?: string;
}): Promise<void> {
  const { clientId, userAccessToken, metadataFolderId, normalizedPn, accountId } = params;
  if (isFirstPartyClient(clientId)) return;

  const indexers = await getThirdPartyIndexersService().listIndexers();
  if (!indexers.some((i) => i.id === clientId && i.status === 'active')) return;

  const existing =
    (await PreferencesService.getPreferencesFile(userAccessToken, metadataFolderId, normalizedPn)) || {
      identifier: normalizedPn,
      updatedAt: new Date().toISOString(),
      subscribedCommunityIds: [] as string[]
    };

  const subscribed = new Set(existing.subscribedCommunityIds || []);
  if (subscribed.has(clientId)) return;
  subscribed.add(clientId);

  await PreferencesService.updatePreferencesFile(
    userAccessToken,
    metadataFolderId,
    normalizedPn,
    { subscribedCommunityIds: [...subscribed] },
    normalizedPn,
    accountId
  );
}
