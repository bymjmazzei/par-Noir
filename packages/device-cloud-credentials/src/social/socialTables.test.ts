import { describe, expect, it } from 'vitest';
import {
  INBOX_SCHEMA,
  MemoryBlobStore,
  conversationLogPath,
  parsePortableConversationId,
} from '@par-noir/user-owned-storage';
import { SqliteBlobTableAdapter } from '@par-noir/user-owned-storage/sqlite';
import type { DeviceBlobStore } from '../deviceBlobStore.js';
import type { DeviceSocialContext } from './socialContext.js';
import { deviceConnections } from './connections.js';
import { deviceInbox } from './inbox.js';
import { deviceConversation, groupConversationIdFor, resolveDmConversation } from './conversations.js';
import { deviceGroups } from './groups.js';
import { deviceMessageRequests } from './requests.js';

const ROOT = 'par-noir-pn-me/';

function tablesContext(): { ctx: DeviceSocialContext; blobs: MemoryBlobStore } {
  const blobs = new MemoryBlobStore();
  return {
    blobs,
    ctx: {
      kind: 'tables',
      provider: 'aws_s3',
      tables: new SqliteBlobTableAdapter(blobs, ROOT),
      blobs: blobs as unknown as DeviceBlobStore,
      layoutRoot: ROOT,
    },
  };
}

describe('device social helpers on table storage', () => {
  it('connections upsert keeps stored fields and returns a provider receipt', async () => {
    const { ctx } = tablesContext();
    const connections = deviceConnections(ctx);
    await connections.upsert({
      connectionId: 'c1',
      userPnIdentifier: 'pn-peer',
      status: 'pending_sent',
      createdAt: '2026-01-01',
      peerMlKemPublicKey: 'pk',
    });
    await connections.upsert({ connectionId: 'c1', userPnIdentifier: 'pn-peer', status: 'accepted', createdAt: '2026-01-01' });
    expect(await connections.get('c1')).toEqual(
      expect.objectContaining({ status: 'accepted', peerMlKemPublicKey: 'pk' })
    );
    expect(connections.receipt({ connectionId: 'c1' })).toEqual({ provider: 'aws_s3', connectionId: 'c1' });
  });

  it('inbox upsert rewrites a legacy participant-keyed row to the channel key without losing keys', async () => {
    const { ctx } = tablesContext();
    if (ctx.kind !== 'tables') throw new Error('unreachable');
    const table = await ctx.tables.openTable(INBOX_SCHEMA);
    await table.append({
      inboxRowKey: 'pn-peer',
      participantPnIdentifier: 'pn-peer',
      threadType: 'dm',
      spreadsheetId: 'pn-portable-conv:pn-peer',
      connectionId: 'c1',
      lastMessageAt: '2026-01-01T00:00:00Z',
      wrappedMessageRootKey: 'wrapped',
    });
    const inbox = deviceInbox(ctx);
    await inbox.upsert({
      threadType: 'dm',
      participantPnIdentifier: 'pn-peer',
      spreadsheetId: 'pn-portable-conv:pn-peer',
      connectionId: 'c1',
      lastMessageAt: '2026-02-01T00:00:00Z',
      lastMessagePreview: 'hi',
    });
    const rows = await inbox.list();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual(
      expect.objectContaining({ lastMessagePreview: 'hi', wrappedMessageRootKey: 'wrapped', channelClientId: 'platform' })
    );
    expect(await inbox.remove((t) => t.participantPnIdentifier === 'pn-peer')).toBe(1);
    expect(await inbox.list()).toEqual([]);
  });

  it('DM conversation is created once, stored newest first, and edited in place', async () => {
    const { ctx, blobs } = tablesContext();
    const args = { identityId: 'pn-me', peerPnIdentifier: 'pn-peer', connectionId: 'c1', wrappedMessageRootKey: 'w' };
    const id = await resolveDmConversation(ctx, args);
    expect(await resolveDmConversation(ctx, args)).toBe(id);
    const parsed = parsePortableConversationId(id);
    expect(parsed?.kind).toBe('dm');

    const conv = deviceConversation(ctx, id);
    await conv.append({ messageId: 'm1', fromPnIdentifier: 'pn-me', content: '', encryptedContent: 'e1', timestamp: 't1', read: false });
    await conv.append({ messageId: 'm2', fromPnIdentifier: 'pn-peer', content: '', encryptedContent: 'e2', timestamp: 't2', read: false });
    await conv.append({ messageId: 'm2', fromPnIdentifier: 'pn-peer', content: '', encryptedContent: 'e2', timestamp: 't2', read: false });
    expect((await conv.list()).map((m) => m.messageId)).toEqual(['m1', 'm2']);

    const key = `${ROOT}${conversationLogPath(parsed!.kind === 'dm' ? parsed!.peerKey : '')}`;
    const stored = new TextDecoder().decode((await blobs.get(key))!);
    expect(JSON.parse(stored.split('\n')[0]).messageId).toBe('m2');

    await conv.markRead('m2');
    expect((await conv.list())[1]).toEqual(expect.objectContaining({ read: true, readAt: expect.any(String) }));

    const rows = await conv.rows();
    expect(rows.map((r) => r.rowIndex)).toEqual([2, 3]);
    expect(await conv.applyRowUpdates([{ rowIndex: 3, fromPnIdentifier: 'pn-me2', encryptedContent: 'e1b' }])).toBe(2);
    expect((await conv.list())[0]).toEqual(expect.objectContaining({ fromPnIdentifier: 'pn-me2', encryptedContent: 'e1b' }));

    await conv.remove('m1');
    expect((await conv.list()).map((m) => m.messageId)).toEqual(['m2']);
  });

  it('groups upsert by member and rewrap replaces members under the successor', async () => {
    const { ctx } = tablesContext();
    const groups = deviceGroups(ctx);
    const base = { groupId: 'g1', ownerPnIdentifier: 'pn-me', title: 'T', createdAt: 'c', accessRole: 'admin' };
    await groups.upsert({ ...base, memberPnIdentifier: 'pn-me', wrappedChatKey: 'k1' });
    await groups.upsert({ ...base, memberPnIdentifier: 'pn-old', wrappedChatKey: 'k2', accessRole: 'readWrite' });
    expect(await groups.rewrap('g1', 'pn-me2', [{ memberPnIdentifier: 'pn-me2', wrappedChatKey: 'k3', accessRole: 'admin' }])).toBe(true);
    expect(await groups.list()).toEqual([
      expect.objectContaining({ groupId: 'g1', ownerPnIdentifier: 'pn-me2', memberPnIdentifier: 'pn-me2', wrappedChatKey: 'k3', title: 'T' }),
    ]);
    expect(groupConversationIdFor(ctx, 'g1')).toBe('pn-portable-group:g1');
  });

  it('message requests append and change status', async () => {
    const { ctx } = tablesContext();
    const requests = deviceMessageRequests(ctx);
    await requests.append({
      requestId: 'r1',
      fromPnIdentifier: 'pn-a',
      toPnIdentifier: 'pn-me',
      content: 'x',
      status: 'pending',
      timestamp: 't',
      cryptoVersion: 2,
    });
    await requests.setStatus('r1', 'accepted');
    expect(await requests.list()).toEqual([expect.objectContaining({ requestId: 'r1', status: 'accepted', cryptoVersion: 2 })]);
  });
});
