import {
  deriveGroupWrapKey,
  wrapChatKey,
  wrapChatKeyForOwner,
  unwrapChatKeyForOwner,
} from '@par-noir/dm-crypto';
import type { GroupMemberWrap, GroupRewrapInput } from './types';

export async function unwrapGroupChatKeyAsOwner(
  wrappedChatKey: string,
  groupId: string,
  mlKemSecretKey: string
): Promise<string> {
  return unwrapChatKeyForOwner(wrappedChatKey, mlKemSecretKey, groupId);
}

export async function wrapGroupChatKeyForMember(
  chatKeyB64: string,
  ownerPnIdentifier: string,
  messageRootKey: string,
  groupId: string
): Promise<string> {
  const wrapKey = deriveGroupWrapKey(ownerPnIdentifier, messageRootKey, groupId);
  return wrapChatKey(chatKeyB64, wrapKey);
}

export async function rewrapGroupForOwnerRotation(params: {
  group: GroupRewrapInput;
  successorOwnerPn: string;
  successorMlKemSecretKey: string;
  memberMessageRoots: Record<string, string>;
}): Promise<GroupMemberWrap[]> {
  const { group, successorOwnerPn, successorMlKemSecretKey, memberMessageRoots } = params;
  const results: GroupMemberWrap[] = [];

  for (const member of group.members) {
    if (member.memberPnIdentifier === group.ownerPnIdentifier) {
      const wrapped = await wrapChatKeyForOwner(group.chatKeyB64, successorMlKemSecretKey, group.groupId);
      results.push({
        memberPnIdentifier: successorOwnerPn,
        wrappedChatKey: wrapped,
        accessRole: member.accessRole,
      });
      continue;
    }
    const root = memberMessageRoots[member.memberPnIdentifier];
    if (!root) {
      throw new Error(`Missing DM root for group member ${member.memberPnIdentifier}`);
    }
    const wrapped = await wrapGroupChatKeyForMember(
      group.chatKeyB64,
      successorOwnerPn,
      root,
      group.groupId
    );
    results.push({
      memberPnIdentifier: member.memberPnIdentifier,
      wrappedChatKey: wrapped,
      accessRole: member.accessRole,
    });
  }
  return results;
}

export function buildMemberMessageRootsFromRekeys(
  connections: Array<{ participantPnIdentifier: string; newMessageRootKey: string }>
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const c of connections) {
    map[c.participantPnIdentifier] = c.newMessageRootKey;
  }
  return map;
}
