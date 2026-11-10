import { describe, expect, it } from 'vitest';
import { MemoryBlobStore } from '@par-noir/user-owned-storage';
import { SqliteBlobTableAdapter } from '@par-noir/user-owned-storage/sqlite';
import type { DeviceBlobStore } from '../deviceBlobStore.js';
import type { TablesSocialContext } from './socialContext.js';
import { applyInboundJobToTables, applyOwnOutboxToTables } from './applyTablesJob.js';
import { deviceConnections } from './connections.js';
import { deviceConversation } from './conversations.js';
import { deviceGroups } from './groups.js';
import { deviceInbox } from './inbox.js';

function tablesContext(): TablesSocialContext {
  const blobs = new MemoryBlobStore();
  return {
    kind: 'tables',
    provider: 'azure_blob',
    tables: new SqliteBlobTableAdapter(blobs, 'par-noir-pn-me/'),
    blobs: blobs as unknown as DeviceBlobStore,
    layoutRoot: 'par-noir-pn-me/',
  };
}

describe('applying social jobs on a non-Google social cloud', () => {
  it('accepted connection opens a DM; inbound and own messages land in the same thread', async () => {
    const ctx = tablesContext();
    const accept = await applyInboundJobToTables(ctx, 'pn-me', 'connection_accept', {
      peerPnIdentifier: 'peer',
      connectionId: 'c1',
      wrappedMessageRootKey: 'w',
    });
    expect(accept).toEqual({ provider: 'azure_blob', peerPnIdentifier: 'pn-peer', connectionId: 'c1' });
    expect((await deviceConnections(ctx).get('c1'))?.status).toBe('accepted');

    const inbound = await applyInboundJobToTables(ctx, 'pn-me', 'message_append', {
      fromPnIdentifier: 'pn-peer',
      connectionId: 'c1',
      messageId: 'm1',
      encryptedContent: 'e1',
      timestamp: '2026-01-01T00:00:00Z',
    });
    const own = await applyOwnOutboxToTables(ctx, 'pn-me', 'message_append', {
      toPnIdentifier: 'pn-peer',
      connectionId: 'c1',
      messageId: 'm2',
      encryptedContent: 'e2',
      timestamp: '2026-01-01T00:01:00Z',
    });
    expect(inbound?.spreadsheetId).toBe(own?.spreadsheetId);
    const messages = await deviceConversation(ctx, String(own?.spreadsheetId)).list();
    expect(messages.map((m) => [m.messageId, m.fromPnIdentifier, m.read])).toEqual([
      ['m1', 'pn-peer', false],
      ['m2', 'pn-me', true],
    ]);
    expect(await deviceInbox(ctx).list()).toHaveLength(1);
  });

  it('group invite, message, and removal', async () => {
    const ctx = tablesContext();
    await applyInboundJobToTables(ctx, 'pn-me', 'group_inbox_update', {
      groupId: 'g1',
      title: 'Team',
      ownerPnIdentifier: 'pn-owner',
      preview: 'Added to group: Team',
      members: [
        { memberPnIdentifier: 'pn-owner', wrappedChatKey: 'k0', accessRole: 'readWrite' },
        { memberPnIdentifier: 'pn-me', wrappedChatKey: 'k1', accessRole: 'readWrite' },
      ],
    });
    expect((await deviceGroups(ctx).list()).map((r) => r.memberPnIdentifier).sort()).toEqual(['pn-me', 'pn-owner']);
    const inbox = await deviceInbox(ctx).list();
    expect(inbox[0]).toEqual(expect.objectContaining({ threadType: 'group', groupId: 'g1', spreadsheetId: 'pn-portable-group:g1' }));

    await applyInboundJobToTables(ctx, 'pn-me', 'group_message_append', {
      groupId: 'g1',
      fromPnIdentifier: 'pn-owner',
      messageId: 'gm1',
      encryptedContent: 'x',
    });
    expect((await deviceConversation(ctx, 'pn-portable-group:g1').list())[0]?.messageId).toBe('gm1');

    await applyInboundJobToTables(ctx, 'pn-me', 'group_inbox_update', { groupId: 'g1', removed: true });
    expect(await deviceGroups(ctx).list()).toEqual([]);
    expect(await deviceInbox(ctx).list()).toEqual([]);
  });

  it('leaves pen jobs in the mailbox', async () => {
    expect(await applyInboundJobToTables(tablesContext(), 'pn-me', 'pen.comment', { docId: 'd' })).toBeNull();
  });
});
