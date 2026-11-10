import { describe, expect, it } from 'vitest';
import { MemoryBlobStore } from '@par-noir/user-owned-storage';
import { SqliteBlobTableAdapter } from '@par-noir/user-owned-storage/sqlite';
import type { DeviceBlobStore } from '../deviceBlobStore.js';
import type { TablesSocialContext } from './socialContext.js';
import { applyInboundJobToTables } from './applyTablesJob.js';
import { deviceConnections } from './connections.js';
import { deviceConversation } from './conversations.js';
import { deviceInbox } from './inbox.js';
import { migrateSocialCloudOnDevice, socialMigrationDirection, type SocialMigrationItem } from './migrateSocialCloud.js';

function tablesContext(provider: TablesSocialContext['provider'], layoutRoot: string): TablesSocialContext {
  const blobs = new MemoryBlobStore();
  return {
    kind: 'tables',
    provider,
    tables: new SqliteBlobTableAdapter(blobs, layoutRoot),
    blobs: blobs as unknown as DeviceBlobStore,
    layoutRoot,
  };
}

describe('moving the social cloud on the device', () => {
  it('portable to portable copies the social layout (not file blobs), so threads read the same on the new cloud', async () => {
    const source = tablesContext('azure_blob', 'par-noir-pn-me/');
    const target = tablesContext('dropbox', 'custom-root/');
    await applyInboundJobToTables(source, 'pn-me', 'connection_accept', {
      peerPnIdentifier: 'peer',
      connectionId: 'c1',
      wrappedMessageRootKey: 'w',
    });
    await applyInboundJobToTables(source, 'pn-me', 'message_append', {
      fromPnIdentifier: 'pn-peer',
      connectionId: 'c1',
      messageId: 'm1',
      encryptedContent: 'e1',
      timestamp: '2026-01-01T00:00:00Z',
    });

    await source.blobs.put('par-noir-pn-me/_metadata/media/f1.encrypted', new Uint8Array([9]));

    const seen: SocialMigrationItem[] = [];
    const items = await migrateSocialCloudOnDevice(source, target, { identityId: 'pn-me', onItem: (i) => seen.push(i) });

    expect(items.length).toBeGreaterThan(0);
    expect(items.every((i) => i.outcome === 'migrated')).toBe(true);
    expect(seen).toEqual(items);
    expect((await deviceConnections(target).get('c1'))?.status).toBe('accepted');
    const [thread] = await deviceInbox(target).list();
    const messages = await deviceConversation(target, thread.spreadsheetId).list();
    expect(messages.map((m) => m.messageId)).toEqual(['m1']);
    expect(items.some((i) => i.path.startsWith('par-noir-messages/'))).toBe(true);
    expect(await target.blobs.get('custom-root/_metadata/media/f1.encrypted')).toBeNull();
  });

  it('names the direction the wizard shows', () => {
    expect(socialMigrationDirection('tables', 'tables')).toBe('portable_to_portable');
    expect(socialMigrationDirection('google_drive', 'tables')).toBe('google_to_portable');
    expect(socialMigrationDirection('tables', 'google_drive')).toBe('portable_to_google');
  });
});
