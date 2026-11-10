import { portableConversationBlobId } from '@par-noir/dm-crypto';
import { copyPortableSocialCloudBlobs } from '@par-noir/storage-migration';
import { FOLLOWERS_SCHEMA, FOLLOWING_SCHEMA, NOTIFICATIONS_SCHEMA } from '@par-noir/user-owned-storage';
import { ensureDeviceConversationSheet } from '../deviceSocial.js';
import { listDeviceFollowers, listDeviceFollowing, listDeviceNotifications } from '../deviceProduct.js';
import { normalizeCloudIdentityId } from '../sessionMemory.js';
import { deviceConnections } from './connections.js';
import { deviceConversation, groupConversationIdFor } from './conversations.js';
import { deviceFileIndex } from './fileIndex.js';
import { deviceGroups } from './groups.js';
import { deviceInbox, type DeviceInboxEntry } from './inbox.js';
import { deviceMessageRequests } from './requests.js';
import type { DeviceSocialContext } from './socialContext.js';

export type SocialMigrationOutcome = 'migrated' | 'skipped' | 'failed';
export type SocialMigrationItem = { path: string; outcome: SocialMigrationOutcome; count?: number; error?: string };

/** Data sets a Google ↔ portable move does not carry; the preview lists them before the user confirms. */
export const SOCIAL_MIGRATION_NOT_CARRIED = [
  'activity, messaging and Prism ledgers',
  'engagement (likes and comments index)',
  'per-content-class file indexes (rebuilt from the file index)',
  'companion metadata and integrator folders',
  'profile and preferences (the new cloud starts from defaults)',
] as const;

export function socialMigrationDirection(source: DeviceSocialContext['kind'], target: DeviceSocialContext['kind']) {
  if (source === 'tables' && target === 'tables') return 'portable_to_portable' as const;
  return source === 'google_drive' ? ('google_to_portable' as const) : ('portable_to_google' as const);
}

type Report = (item: SocialMigrationItem) => void;

async function step(path: string, report: Report, items: SocialMigrationItem[], run: () => Promise<number>) {
  try {
    const count = await run();
    const item: SocialMigrationItem = { path, outcome: 'migrated', count };
    items.push(item);
    report(item);
  } catch (err) {
    const item: SocialMigrationItem = { path, outcome: 'failed', error: err instanceof Error ? err.message : String(err) };
    items.push(item);
    report(item);
  }
}

/** Target conversation id for one DM thread, created when missing (with its inbox row). */
async function targetDmConversation(target: DeviceSocialContext, identityId: string, thread: DeviceInboxEntry): Promise<string> {
  if (target.kind === 'google_drive') {
    return ensureDeviceConversationSheet(target.accessToken, target.index.messagesFolderId, thread.connectionId);
  }
  return portableConversationBlobId(
    normalizeCloudIdentityId(identityId),
    normalizeCloudIdentityId(thread.participantPnIdentifier)
  );
}

async function copyConversation(source: DeviceSocialContext, sourceId: string, target: DeviceSocialContext, targetId: string) {
  const from = await deviceConversation(source, sourceId).list();
  const to = deviceConversation(target, targetId);
  const existing = new Set((await to.list()).map((m) => m.messageId));
  let copied = 0;
  for (const message of from) {
    if (message.messageId && existing.has(message.messageId)) continue;
    await to.append(message);
    copied += 1;
  }
  return copied;
}

async function copyRowsToTable(
  target: DeviceSocialContext,
  schema: typeof FOLLOWERS_SCHEMA,
  rows: Array<Record<string, unknown>>
): Promise<number> {
  if (target.kind !== 'tables') return 0;
  const table = await target.tables.openTable(schema);
  for (const row of rows) await table.append(row);
  return rows.length;
}

/**
 * Copy this pN's social data from its current social cloud to a new one, on
 * the device. Portable clouds share one file format, so that move copies the
 * layout blobs; moves to or from Google go through the social stores.
 */
export async function migrateSocialCloudOnDevice(
  source: DeviceSocialContext,
  target: DeviceSocialContext,
  opts: { identityId: string; onItem?: Report }
): Promise<SocialMigrationItem[]> {
  const items: SocialMigrationItem[] = [];
  const report: Report = opts.onItem ?? (() => undefined);

  if (source.kind === 'tables' && target.kind === 'tables') {
    await copyPortableSocialCloudBlobs({
      jobId: 'device',
      sourceStore: source.blobs,
      destStore: target.blobs,
      sourcePrefix: source.layoutRoot,
      destPrefix: target.layoutRoot,
      onItem: (item) => {
        const out: SocialMigrationItem = { path: item.path, outcome: item.outcome === 'patched' ? 'migrated' : item.outcome, error: item.error };
        items.push(out);
        report(out);
      },
    });
    return items;
  }

  await step('connections', report, items, async () => {
    const rows = await deviceConnections(source).list();
    const to = deviceConnections(target);
    for (const row of rows) await to.upsert(row);
    return rows.length;
  });

  const groups = await deviceGroups(source).list().catch(() => []);
  await step('groups', report, items, async () => {
    const to = deviceGroups(target);
    for (const row of groups) {
      await to.append({ ...row, conversationSpreadsheetId: target.kind === 'google_drive' ? row.conversationSpreadsheetId : undefined });
    }
    return groups.length;
  });

  const threads = await deviceInbox(source).list().catch(() => []);
  const targetInbox = deviceInbox(target);
  for (const thread of threads) {
    const label = thread.threadType === 'group' ? `group ${thread.groupId || thread.participantPnIdentifier}` : `dm ${thread.participantPnIdentifier}`;
    if (thread.threadType === 'group') {
      const groupId = thread.groupId || thread.participantPnIdentifier;
      const sheet = groups.find((g) => g.groupId === groupId && g.conversationSpreadsheetId)?.conversationSpreadsheetId;
      const targetId = groupConversationIdFor(target, groupId, target.kind === 'google_drive' ? sheet : undefined);
      if (!targetId) {
        const item: SocialMigrationItem = { path: label, outcome: 'skipped', error: 'Google Drive keeps group history on the owner sheet' };
        items.push(item);
        report(item);
        continue;
      }
      await step(label, report, items, async () => {
        const copied = thread.spreadsheetId ? await copyConversation(source, thread.spreadsheetId, target, targetId) : 0;
        await targetInbox.upsert({ ...thread, groupId, spreadsheetId: targetId });
        return copied;
      });
      continue;
    }
    await step(label, report, items, async () => {
      const targetId = await targetDmConversation(target, opts.identityId, thread);
      const copied = thread.spreadsheetId ? await copyConversation(source, thread.spreadsheetId, target, targetId) : 0;
      await targetInbox.upsert({ ...thread, spreadsheetId: targetId });
      return copied;
    });
  }

  await step('message requests', report, items, async () => {
    const rows = await deviceMessageRequests(source).list();
    const to = deviceMessageRequests(target);
    for (const row of rows) await to.append(row);
    return rows.length;
  });

  for (const kind of ['owner', 'public'] as const) {
    await step(`${kind} file index`, report, items, async () => {
      const rows = await deviceFileIndex(source, kind).list();
      const to = deviceFileIndex(target, kind);
      for (const row of rows) await to.upsert(row);
      return rows.length;
    });
  }

  if (source.kind === 'google_drive' && target.kind === 'tables') {
    const sheets = source.index.sheetIds;
    await step('followers', report, items, async () =>
      copyRowsToTable(target, FOLLOWERS_SCHEMA, sheets.followers ? await listDeviceFollowers(source.accessToken, sheets.followers) : [])
    );
    await step('following', report, items, async () =>
      copyRowsToTable(
        target,
        FOLLOWING_SCHEMA,
        (sheets.following ? await listDeviceFollowing(source.accessToken, sheets.following) : []).map((f) => ({
          ...f,
          followingKey: `${f.targetType}:${f.targetPnIdentifier}`,
        }))
      )
    );
    await step('notifications', report, items, async () =>
      copyRowsToTable(
        target,
        NOTIFICATIONS_SCHEMA,
        sheets.notifications ? await listDeviceNotifications(source.accessToken, sheets.notifications) : []
      )
    );
  } else {
    for (const path of ['followers', 'following', 'notifications']) {
      const item: SocialMigrationItem = { path, outcome: 'skipped', error: 'Rebuilt from new activity on Google Drive' };
      items.push(item);
      report(item);
    }
  }

  return items;
}
