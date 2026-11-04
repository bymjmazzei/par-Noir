import { beforeEach, describe, expect, it } from 'vitest';
import {
  appendDeviceMessage,
  clearOwnConversationSheetCache,
  ensureDeviceConversationSheet,
  listDeviceInbox,
  resolveOwnConversationSheet,
} from './deviceSocial.js';
import { sheetIdForJob } from './layoutSheet.js';
import { setSessionDriveIndex } from './sessionMemory.js';
import { createFakeGoogle } from './fakeGoogleSheets.testkit.js';
import type { DeviceDriveLayout } from './deviceDriveLayout.js';

const layout: DeviceDriveLayout = {
  schemaVersion: 1,
  pnFolderId: 'pn-folder',
  metadataFolderId: 'meta',
  integratorsRootId: 'int',
  messagesFolderId: 'my-messages',
  inboxSheetId: 'inbox',
  sheetIds: { connections: 'connections' },
  conversationSheets: {},
};

function inboxRow(peer: string, sheet: string, connectionId: string): string[] {
  return [peer, sheet, connectionId, '2026-11-01T00:00:00Z', '', 'kem', 'dm', 'wrap', 'platform'];
}

beforeEach(() => {
  clearOwnConversationSheetCache();
  setSessionDriveIndex('pn-me', layout);
});

describe('ensureDeviceConversationSheet', () => {
  it('creates dm-<connectionId> with a Messages tab and header row in the messages folder', async () => {
    const google = createFakeGoogle({});
    const id = await ensureDeviceConversationSheet('at', 'my-messages', 'conn-1', google.fetch);
    const file = google.files[id]!;
    expect(file.name).toBe('dm-conn-1');
    expect(file.parents).toEqual(['my-messages']);
    expect(file.tabs.Messages?.[0]?.[0]).toBe('User DID');
  });

  it('repairs a blank sheet (Sheet1 only) by adding Messages so appends stop returning 400', async () => {
    const google = createFakeGoogle({
      blank: { name: 'dm-conn-1', parents: ['my-messages'], tabs: { Sheet1: [] } },
    });
    await expect(
      appendDeviceMessage(
        'at',
        'blank',
        { fromPnIdentifier: 'pn-me', content: 'x', timestamp: 't', messageId: 'm0', read: true },
        google.fetch
      )
    ).rejects.toThrow(/400/);

    const id = await ensureDeviceConversationSheet('at', 'my-messages', 'conn-1', google.fetch);
    expect(id).toBe('blank');
    expect(Object.keys(google.files.blank!.tabs)).toContain('Messages');
    await appendDeviceMessage(
      'at',
      'blank',
      { fromPnIdentifier: 'pn-me', content: 'x', timestamp: 't', messageId: 'm1', read: true },
      google.fetch
    );
    expect(google.files.blank!.tabs.Messages!.at(-1)?.[3]).toBe('m1');
  });
});

describe('resolveOwnConversationSheet', () => {
  it('creates the sheet and the inbox row when the thread is missing', async () => {
    const google = createFakeGoogle({
      inbox: { name: 'Inbox', parents: ['my-messages'], tabs: { Inbox: [['header']] } },
    });
    const id = await resolveOwnConversationSheet({
      accessToken: 'at',
      identityId: 'pn-me',
      peerPnIdentifier: 'pn-peer',
      connectionId: 'conn-2',
      fetchImpl: google.fetch,
    });
    expect(google.files[id]!.name).toBe('dm-conn-2');
    const threads = await listDeviceInbox('at', 'inbox', google.fetch);
    expect(threads).toEqual([
      expect.objectContaining({ participantPnIdentifier: 'pn-peer', spreadsheetId: id, connectionId: 'conn-2' }),
    ]);
  });

  it('replaces a peer-owned dm sheet with one in its own Drive and keeps the session keys', async () => {
    const google = createFakeGoogle({
      inbox: {
        name: 'Inbox',
        parents: ['my-messages'],
        tabs: { Inbox: [['header'], inboxRow('pn-peer', 'peer-sheet', 'conn-3')] },
      },
      'peer-sheet': { name: 'dm-conn-3', parents: ['peer-messages'], tabs: { Sheet1: [] } },
    });
    const id = await resolveOwnConversationSheet({
      accessToken: 'at',
      identityId: 'pn-me',
      peerPnIdentifier: 'pn-peer',
      fetchImpl: google.fetch,
    });
    expect(id).not.toBe('peer-sheet');
    expect(google.files[id]!.parents).toEqual(['my-messages']);
    expect(google.files['peer-sheet']!.tabs.Messages).toBeUndefined();
    const [thread] = await listDeviceInbox('at', 'inbox', google.fetch);
    expect(thread).toEqual(
      expect.objectContaining({ spreadsheetId: id, kemCiphertext: 'kem', wrappedMessageRootKey: 'wrap' })
    );
  });

  it('keeps a legacy API-created sheet that sits outside the current messages folder', async () => {
    const google = createFakeGoogle({
      inbox: {
        name: 'Inbox',
        parents: ['my-messages'],
        tabs: { Inbox: [['header'], inboxRow('pn-old', 'legacy', 'conn-4')] },
      },
      legacy: { name: 'conversation-abc', parents: ['old-messages'], tabs: { Messages: [['User DID']] } },
    });
    const id = await resolveOwnConversationSheet({
      accessToken: 'at',
      identityId: 'pn-me',
      peerPnIdentifier: 'pn-old',
      fetchImpl: google.fetch,
    });
    expect(id).toBe('legacy');
  });

  it('finds the thread by connectionId when the sender id is absent', async () => {
    const google = createFakeGoogle({
      inbox: {
        name: 'Inbox',
        parents: ['my-messages'],
        tabs: { Inbox: [['header'], inboxRow('pn-peer', 'mine', 'conn-5')] },
      },
      mine: { name: 'dm-conn-5', parents: ['my-messages'], tabs: { Messages: [['User DID']] } },
    });
    const id = await resolveOwnConversationSheet({
      accessToken: 'at',
      identityId: 'pn-me',
      connectionId: 'conn-5',
      fetchImpl: google.fetch,
    });
    expect(id).toBe('mine');
  });
});

describe('sheetIdForJob', () => {
  it('never routes chat rows to the Inbox spreadsheet', () => {
    expect(sheetIdForJob(layout, 'message_append')).toBeNull();
    expect(sheetIdForJob(layout, 'group_message_append')).toBeNull();
  });
});
