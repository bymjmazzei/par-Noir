/**
 * Resume DM/group migration steps after identity re-key (browser unlock).
 */

import {
  openDmSession,
  unwrapMessageRootKey,
  wrapMessageRootKey,
} from '@par-noir/dm-crypto';
import {
  MIGRATION_STATE_KEY,
  parseMigrationState,
  rekeyConnectionAsRequester,
  rewrapGroupForOwnerRotation,
  buildMemberMessageRootsFromRekeys,
  migrateDmThreadHistory,
} from '@par-noir/identity-migration/browser';
import { getMessageThreads } from './messageService';
import { listGroups } from './groupService';
import { getDmIdentity } from './dmIdentitySession';
import { cacheLegacyMessageRoot } from './dmCryptoClient';
import { setMessageRootKey, getLegacyMessageRootKey } from './dmSessionCache';
import {
  rekeyConnection,
  rewrapConnectionRoot,
  rewrapGroupKeys,
  fetchConversationRowsForMigration,
  postDmMessageRowUpdates,
  ackMigrationStep,
} from './identityMigrationApiClient';
import { unwrapChatKeyForOwner } from './groupCryptoClient';
import { PNOAuthService } from './pnOAuthService';

function loadMigrationState() {
  const raw = localStorage.getItem(MIGRATION_STATE_KEY);
  if (!raw) return null;
  return parseMigrationState(raw);
}

function isRequesterForKem(kemCiphertext: string, predecessorMlKemSecretKey: string): boolean {
  try {
    openDmSession(kemCiphertext, predecessorMlKemSecretKey);
    return true;
  } catch {
    return false;
  }
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
    if (!thread.connectionId || !thread.participantPnIdentifier) continue;
    if (thread.threadType === 'group') continue;
    if (!thread.kemCiphertext && !thread.wrappedMessageRootKey) continue;

    const isRequester = thread.kemCiphertext
      ? isRequesterForKem(thread.kemCiphertext, params.predecessorMlKemSecretKey)
      : false;

    try {
      let newKem: string | undefined;
      let legacyRoot: string | undefined;
      let newRoot: string;

      if (isRequester) {
        const result = rekeyConnectionAsRequester(
          {
            connectionId: thread.connectionId,
            kemCiphertext: thread.kemCiphertext!,
            participantPnIdentifier: thread.participantPnIdentifier,
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
        newKem = result.newKemCiphertext;
        legacyRoot = result.legacyMessageRootKey;
        newRoot = result.newMessageRootKey;
        if (newKem) {
          await rekeyConnection(
            params.authToken,
            migrationId,
            thread.connectionId,
            userPn,
            newKem
          );
        }
      } else {
        if (thread.wrappedMessageRootKey) {
          legacyRoot = await unwrapMessageRootKey(
            thread.wrappedMessageRootKey,
            params.predecessorMlKemSecretKey,
            thread.connectionId
          );
          newRoot = legacyRoot;
          const newWrapped = await wrapMessageRootKey(
            legacyRoot,
            params.successorMlKemSecretKey,
            thread.connectionId
          );
          await rewrapConnectionRoot(
            params.authToken,
            migrationId,
            thread.connectionId,
            userPn,
            thread.participantPnIdentifier,
            newWrapped
          );
        } else {
          legacyRoot = getLegacyMessageRootKey(thread.connectionId);
          if (!legacyRoot) continue;
          newRoot = legacyRoot;
        }
      }

      if (legacyRoot) {
        cacheLegacyMessageRoot(thread.connectionId, legacyRoot);
      }
      setMessageRootKey(thread.connectionId, newRoot);

      const { rows, spreadsheetId } = await fetchConversationRowsForMigration(
        params.authToken,
        migrationId,
        thread.participantPnIdentifier,
        thread.spreadsheetId
      );
      if (rows.length) {
        const history = await migrateDmThreadHistory(
          {
            connectionId: thread.connectionId,
            kemCiphertext: newKem || thread.kemCiphertext,
            participantPnIdentifier: thread.participantPnIdentifier,
            isRequester,
            rows: rows.filter((r) => r.encryptedContent),
          },
          {
            mlKemSecretKey: params.predecessorMlKemSecretKey,
            mlKemPublicKey: params.predecessorMlKemPublicKey,
            pnIdentifier: plan.predecessorPnIdentifier,
          },
          {
            mlKemSecretKey: params.successorMlKemSecretKey,
            mlKemPublicKey: params.successorMlKemPublicKey,
            pnIdentifier: plan.successorPnIdentifier,
          }
        );
        if (history.rowUpdates.length) {
          await postDmMessageRowUpdates(params.authToken, migrationId, {
            connectionId: thread.connectionId,
            kemCiphertext: history.newKemCiphertext,
            spreadsheetId,
            participantPnIdentifier: thread.participantPnIdentifier,
            rowUpdates: history.rowUpdates,
          });
        }
      }

      rekeyResults.push({
        participantPnIdentifier: thread.participantPnIdentifier,
        newMessageRootKey: newRoot,
      });
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
  sessionStorage.removeItem('pn_identity_migration_kem_handoff');

  await ackMigrationStep(params.authToken, migrationId, 'dm_rekey');
  await ackMigrationStep(params.authToken, migrationId, 'group_rewrap');
}
