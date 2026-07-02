/**
 * Short-TTL Redis cache for messaging inbox and conversation reads.
 */

import { deleteCache, deleteCachePattern, getCache, setCache } from '../utils/cache';

const INBOX_TTL_SECONDS = 20;
const CONVERSATION_TTL_SECONDS = 15;
const GROUP_MTIME_TTL_SECONDS = 20;

function normalizePn(pnIdentifier: string): string {
  return pnIdentifier.startsWith('pn-') ? pnIdentifier : `pn-${pnIdentifier}`;
}

function inboxKey(pnIdentifier: string): string {
  return `msg:inbox:${normalizePn(pnIdentifier)}`;
}

function conversationKey(
  pnIdentifier: string,
  participantPnIdentifier: string,
  limit: number,
  offset: number
): string {
  return `msg:conv:${normalizePn(pnIdentifier)}:${normalizePn(participantPnIdentifier)}:${limit}:${offset}`;
}

export async function getCachedInboxConversations<T>(pnIdentifier: string): Promise<T | null> {
  return getCache<T>(inboxKey(pnIdentifier));
}

export async function setCachedInboxConversations<T>(pnIdentifier: string, value: T): Promise<void> {
  await setCache(inboxKey(pnIdentifier), value, INBOX_TTL_SECONDS);
}

export async function invalidateInboxCache(pnIdentifier: string): Promise<void> {
  await deleteCache(inboxKey(pnIdentifier));
}

export async function getCachedConversationMessages<T>(
  pnIdentifier: string,
  participantPnIdentifier: string,
  limit: number,
  offset: number
): Promise<T | null> {
  return getCache<T>(conversationKey(pnIdentifier, participantPnIdentifier, limit, offset));
}

export async function setCachedConversationMessages<T>(
  pnIdentifier: string,
  participantPnIdentifier: string,
  limit: number,
  offset: number,
  value: T
): Promise<void> {
  await setCache(
    conversationKey(pnIdentifier, participantPnIdentifier, limit, offset),
    value,
    CONVERSATION_TTL_SECONDS
  );
}

export async function invalidateConversationCache(
  pnIdentifier: string,
  participantPnIdentifier?: string
): Promise<void> {
  const normalized = normalizePn(pnIdentifier);
  if (participantPnIdentifier) {
    const participant = normalizePn(participantPnIdentifier);
    await deleteCachePattern(`msg:conv:${normalized}:${participant}:*`);
    return;
  }
  await deleteCachePattern(`msg:conv:${normalized}:*`);
}

function groupMtimeKey(ownerPnIdentifier: string, spreadsheetId: string): string {
  return `msg:group-mtime:${normalizePn(ownerPnIdentifier)}:${spreadsheetId}`;
}

export async function getCachedGroupFileMtime(
  ownerPnIdentifier: string,
  spreadsheetId: string
): Promise<string | null> {
  return getCache<string>(groupMtimeKey(ownerPnIdentifier, spreadsheetId));
}

export async function setCachedGroupFileMtime(
  ownerPnIdentifier: string,
  spreadsheetId: string,
  modifiedTime: string
): Promise<void> {
  await setCache(groupMtimeKey(ownerPnIdentifier, spreadsheetId), modifiedTime, GROUP_MTIME_TTL_SECONDS);
}

export async function invalidateGroupFileMtime(
  ownerPnIdentifier: string,
  spreadsheetId: string
): Promise<void> {
  await deleteCache(groupMtimeKey(ownerPnIdentifier, spreadsheetId));
}

export async function invalidateMessagingCachesForUsers(
  pnIdentifiers: string[],
  participants?: Array<{ pn: string; other: string }>
): Promise<void> {
  await Promise.all(
    pnIdentifiers.map(async (pn) => {
      await invalidateInboxCache(pn);
      await invalidateConversationCache(pn);
    })
  );
  if (participants) {
    await Promise.all(
      participants.map(({ pn, other }) => invalidateConversationCache(pn, other))
    );
  }
}
