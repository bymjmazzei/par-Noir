import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { generateChatKey } from '@par-noir/dm-crypto';
import {
  PenLiveBridge,
  readPenLiveState,
  sealPenLiveSnapshot,
  type PenLiveDocState,
  type PenLiveRolesUpdate
} from '@par-noir/pen-live';
import type { PenTipTapNode } from '@par-noir/pen-protocol';

vi.mock('./penDriveLibrary', () => ({ penSessionDrive: vi.fn() }));

import {
  applyLiveSnapshots,
  loadLiveRolesUpdate,
  loadLocalLiveSnapshot,
  mergeLiveSnapshotIntoLocal,
  saveLiveRolesUpdate,
  saveLocalLiveSnapshot
} from './penLiveStore';
import { penEditorSchema } from './penEditorExtensions';

function para(text: string): PenTipTapNode {
  return { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] };
}

function docWith(sections: Record<string, string>): Y.Doc {
  const ydoc = new Y.Doc();
  const state: PenLiveDocState = {
    title: 'Shared',
    toc: Object.keys(sections),
    sections: Object.entries(sections).map(([slug, text]) => ({ slug, doc: para(text) }))
  };
  new PenLiveBridge(ydoc, penEditorSchema()).applyLocal(state);
  return ydoc;
}

function textOf(node: PenTipTapNode | undefined): string {
  if (!node) return '';
  if (node.text) return node.text;
  return (node.content || []).map(textOf).join('');
}

describe('pen live store', () => {
  const pn = 'pn-member';
  const docId = 'doc_live';
  const docKey = generateChatKey();

  beforeEach(() => {
    const data = new Map<string, string>();
    const mem = {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, String(v)),
      removeItem: (k: string) => void data.delete(k),
      clear: () => data.clear()
    };
    vi.stubGlobal('localStorage', mem);
    vi.stubGlobal('sessionStorage', mem);
  });

  it('merges a peer snapshot from the mailbox into the local live state', async () => {
    saveLocalLiveSnapshot(pn, docId, await sealPenLiveSnapshot(docWith({ intro: 'Mine' }), docKey, 0));
    const incoming = await sealPenLiveSnapshot(docWith({ outro: 'Theirs' }), docKey, 0);
    expect(await mergeLiveSnapshotIntoLocal({ pn, docId, incoming, docKey })).toBe(true);

    const merged = new Y.Doc();
    await applyLiveSnapshots(merged, [loadLocalLiveSnapshot(pn, docId)], docKey, 0, null);
    const slugs = readPenLiveState(merged).sections.map((s) => s.slug).sort();
    expect(slugs).toEqual(['intro', 'outro']);
    expect(textOf(readPenLiveState(merged).sections.find((s) => s.slug === 'outro')?.doc)).toBe('Theirs');
  });

  it('does not let an older key epoch snapshot replace the current one', async () => {
    saveLocalLiveSnapshot(pn, docId, await sealPenLiveSnapshot(docWith({ body: 'Epoch 1' }), docKey, 1));
    const stale = await sealPenLiveSnapshot(docWith({ body: 'Epoch 0' }), docKey, 0);
    await mergeLiveSnapshotIntoLocal({ pn, docId, incoming: stale, docKey });

    const local = loadLocalLiveSnapshot(pn, docId);
    expect(local?.keyEpoch).toBe(1);
    const ydoc = new Y.Doc();
    await applyLiveSnapshots(ydoc, [local], docKey, 1, null);
    expect(textOf(readPenLiveState(ydoc).sections[0]?.doc)).toBe('Epoch 1');
  });

  it('skips snapshots sealed with another key', async () => {
    const foreign = await sealPenLiveSnapshot(docWith({ body: 'x' }), generateChatKey(), 0);
    const ydoc = new Y.Doc();
    expect(await applyLiveSnapshots(ydoc, [foreign], docKey, 0, null)).toBe(0);
  });

  it('keeps the newest roles update', () => {
    const update = (issuedAt: number): PenLiveRolesUpdate => ({
      t: 'roles',
      docId,
      keyEpoch: 0,
      issuedAt,
      roles: [],
      signature: String(issuedAt)
    });
    saveLiveRolesUpdate(pn, docId, update(20));
    saveLiveRolesUpdate(pn, docId, update(10));
    expect(loadLiveRolesUpdate(pn, docId)?.issuedAt).toBe(20);
    saveLiveRolesUpdate(pn, docId, update(30));
    expect(loadLiveRolesUpdate(pn, docId)?.issuedAt).toBe(30);
    saveLiveRolesUpdate(pn, docId, { ...update(5), keyEpoch: 1 });
    saveLiveRolesUpdate(pn, docId, update(99));
    expect(loadLiveRolesUpdate(pn, docId)?.keyEpoch).toBe(1);
  });

  it('a session closing on the old epoch does not overwrite the re-keyed snapshot', async () => {
    const nextKey = generateChatKey();
    saveLocalLiveSnapshot(pn, docId, await sealPenLiveSnapshot(docWith({ body: 'Re-keyed' }), nextKey, 1));
    saveLocalLiveSnapshot(pn, docId, await sealPenLiveSnapshot(docWith({ body: 'Closing' }), docKey, 0));
    const local = loadLocalLiveSnapshot(pn, docId);
    expect(local?.keyEpoch).toBe(1);
    const ydoc = new Y.Doc();
    expect(await applyLiveSnapshots(ydoc, [local], nextKey, 1, null)).toBe(1);
  });
});
