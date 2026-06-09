/**
 * Resume DM/group migration steps after identity re-key (browser unlock).
 */

import {
  MIGRATION_STATE_KEY,
  parseMigrationState,
  rekeyConnectionAsRequester,
  rewrapGroupForOwnerRotation,
  buildMemberMessageRootsFromRekeys,
} from '@par-noir/identity-migration/browser';
import { getMessageThreads } from './messageService';
import { listGroups } from './groupService';
import { getDmIdentity } from './dmIdentitySession';
import { cacheLegacyMessageRoot } from './dmCryptoClient';
import { setMessageRootKey, getLegacyMessageRootKey } from './dmSessionCache';
import { rekeyConnection, rewrapGroupKeys } from './identityMigrationApiClient';
import { unwrapChatKeyForOwner } from './groupCryptoClient';
import { PNOAuthService } from './pnOAuthService';

function loadMigrationState() {
  const raw = localStorage.getItem(MIGRATION_STATE_KEY);
  if (!raw) return null;
  return parseMigrationState(raw);
}

export async function migrateConnectionsOnUnlock(params: {
  predecessorMlKemSecretKey: string;
  predecessorMlKemPublicKey: string;
  successorMlKemSecretKey: string;
  successorMlKemPublicKey: string;
  authToken: string;
}): Promise<void> {
  const state = loadMigrationState();
  if (!state) return;

  const session = PNOAuthService.loadSession();
  const userPn = session?.pnIdentifier;
  if (!userPn) return;

  const { migrationId, plan, progress } = state;
  if (progress.completedStepIds.includes('dm_rekey')) return;

  const threads = await getMessageThreads(userPn);
  const rekeyResults: Array<{ participantPnIdentifier: string; newMessageRootKey: string }> = [];

  for (const thread of threads) {
    if (!thread.connectionId) continue;
    if (!thread.kemCiphertext) continue;
    try {
      const result = rekeyConnectionAsRequester(
        {
          connectionId: thread.connectionId,
          kemCiphertext: thread.kemCiphertext,
          participantPnIdentifier: thread.participantPnIdentifier || '',
          isRequester: true,
        },
        {
          mlKemSecretKey: params.predecessorMlKemSecretKey,
          mlKemPublicKey: params.predecessorMlKemPublicKey,
        },
        {
          mlKemSecretKey: params.successorMlKemSecretKey,
          mlKemPublicKey: params.successorMlKemPublicKey,
        }
      );
      if (result.legacyMessageRootKey) {
        cacheLegacyMessageRoot(thread.connectionId, result.legacyMessageRootKey);
      }
      if (result.newKemCiphertext) {
        await rekeyConnection(
          params.authToken,
          migrationId,
          thread.connectionId,
          userPn,
          result.newKemCiphertext
        );
      }
      setMessageRootKey(thread.connectionId, result.newMessageRootKey);
      if (thread.participantPnIdentifier) {
        rekeyResults.push({
          participantPnIdentifier: thread.participantPnIdentifier,
          newMessageRootKey: result.newMessageRootKey,
        });
      }
    } catch {
      /* skip connection */
    }
  }

  const groups = await listGroups(userPn);
  const ownedGroupIds = new Set(
    groups
      .filter(
        (g) =>
          g.ownerPnIdentifier === plan.predecessorPnIdentifier ||
          g.ownerPnIdentifier === plan.successorPnIdentifier
      )
      .map((g) => g.groupId)
  );
  const memberRoots = buildMemberMessageRootsFromRekeys(rekeyResults);

  for (const groupId of ownedGroupIds) {
    const rows = groups.filter((g) => g.groupId === groupId);
    const ownerRow = rows.find((r) => r.memberPnIdentifier === r.ownerPnIdentifier);
    if (!ownerRow) continue;
    try {
      const { mlKemSecretKey } = getDmIdentity();
      const chatKey = await unwrapChatKeyForOwner(ownerRow.wrappedChatKey, mlKemSecretKey, groupId);
      const keyRotation = await rewrapGroupForOwnerRotation({
        group: {
          groupId,
          ownerPnIdentifier: ownerRow.ownerPnIdentifier,
          chatKeyB64: chatKey,
          members: rows.map((r) => ({
            memberPnIdentifier: r.memberPnIdentifier,
            wrappedChatKey: r.wrappedChatKey,
            accessRole: r.accessRole,
          })),
        },
        successorOwnerPn: plan.successorPnIdentifier,
        successorMlKemSecretKey: params.successorMlKemSecretKey,
        memberMessageRoots: memberRoots,
      });
      await rewrapGroupKeys(
        params.authToken,
        migrationId,
        ownerRow.ownerPnIdentifier,
        plan.successorPnIdentifier,
        groupId,
        keyRotation
      );
    } catch {
      /* skip group */
    }
  }

  const legacyDmRoots: Record<string, string> = { ...progress.legacyDmRoots };
  for (const t of threads) {
    if (!t.connectionId) continue;
    const leg = getLegacyMessageRootKey(t.connectionId);
    if (leg) legacyDmRoots[t.connectionId] = leg;
  }
  progress.legacyDmRoots = legacyDmRoots;
  progress.completedStepIds = [...new Set([...progress.completedStepIds, 'dm_rekey', 'group_rewrap'])];
  localStorage.setItem(MIGRATION_STATE_KEY, JSON.stringify({ plan, progress }));
}
