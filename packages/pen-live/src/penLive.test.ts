import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { getSchema } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { generateChatKey } from '@par-noir/dm-crypto';
import { mlDsa65Keygen } from '@par-noir/pqc-crypto/ml-dsa';
import type {
  PenLiveBatch,
  PenPageLayer,
  PenRoleAssignment,
  PenSectionContent,
  PenTipTapNode
} from '@par-noir/pen-protocol';
import {
  PEN_LIVE_LOCAL,
  PEN_LIVE_REMOTE,
  PenLiveBridge,
  PenLiveReplayGuard,
  PenLiveSession,
  attestMemberKey,
  bytesToBase64,
  deriveKeyClaimSecret,
  makeKeyClaim,
  signRekey,
  signRolesUpdate,
  trustedLiveRoles,
  verifyKeyClaim,
  verifyRekey,
  verifyRolesUpdate,
  openPenLiveBatch,
  openPenLiveSnapshot,
  penLivePresenceColor,
  penLiveRoomToken,
  penLiveSeedUpdate,
  readPenLivePeers,
  setPenLivePresence,
  readPenLiveState,
  sealPenLiveBatch,
  sealPenLiveSnapshot,
  type PenLiveDocState,
  type PenLiveTransport,
  type PenLiveWireKind,
  type PenLiveWirePayload
} from './index.js';

const schema = getSchema([StarterKit]);

function para(text: string): PenTipTapNode {
  return {
    type: 'doc',
    content: [{ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] }]
  };
}

function textOf(node: PenTipTapNode | undefined): string {
  if (!node) return '';
  if (node.text) return node.text;
  return (node.content || []).map(textOf).join('');
}

function layer(id: string, extra: Partial<PenPageLayer> = {}): PenPageLayer {
  return { id, kind: 'text', x: 0, y: 0, w: 100, h: 50, zIndex: 1, ...extra };
}

function baseState(): PenLiveDocState {
  return {
    title: 'Doc',
    toc: ['body'],
    sections: [
      {
        slug: 'body',
        doc: para('Hello'),
        layers: [layer('l1', { textDoc: para('Caption'), clips: [{ id: 'c1', inSec: 0, outSec: 2 }] })]
      }
    ]
  };
}

function sync(a: Y.Doc, b: Y.Doc): void {
  const ua = Y.encodeStateAsUpdate(a, Y.encodeStateVector(b));
  const ub = Y.encodeStateAsUpdate(b, Y.encodeStateVector(a));
  Y.applyUpdate(b, ua, PEN_LIVE_REMOTE);
  Y.applyUpdate(a, ub, PEN_LIVE_REMOTE);
}

function forkFromSeed(state: PenLiveDocState): [Y.Doc, Y.Doc] {
  const seed = penLiveSeedUpdate(state, schema);
  const a = new Y.Doc();
  const b = new Y.Doc();
  Y.applyUpdate(a, seed, PEN_LIVE_REMOTE);
  Y.applyUpdate(b, seed, PEN_LIVE_REMOTE);
  return [a, b];
}

function section(state: PenLiveDocState, slug = 'body'): PenSectionContent {
  return state.sections.find((s) => s.slug === slug)!;
}

describe('doc model', () => {
  it('round-trips sections, layers, text layers and clips', () => {
    const state = baseState();
    const doc = new Y.Doc();
    new PenLiveBridge(doc, schema).applyLocal(state);
    const read = readPenLiveState(doc);
    expect(read.title).toBe('Doc');
    expect(read.toc).toEqual(['body']);
    expect(textOf(section(read).doc)).toBe('Hello');
    expect(textOf(section(read).layers?.[0]?.textDoc)).toBe('Caption');
    expect(section(read).layers?.[0]?.clips).toEqual([{ id: 'c1', inSec: 0, outSec: 2 }]);
  });

  it('identical seeds from two devices do not duplicate content', () => {
    const state = baseState();
    const a = new Y.Doc();
    const b = new Y.Doc();
    Y.applyUpdate(a, penLiveSeedUpdate(state, schema), PEN_LIVE_REMOTE);
    Y.applyUpdate(b, penLiveSeedUpdate(state, schema), PEN_LIVE_REMOTE);
    sync(a, b);
    expect(textOf(section(readPenLiveState(a)).doc)).toBe('Hello');
  });

  it('merges concurrent text edits in one paragraph', () => {
    const state = baseState();
    const [a, b] = forkFromSeed(state);
    const ba = new PenLiveBridge(a, schema);
    const bb = new PenLiveBridge(b, schema);
    ba.adopt(readPenLiveState(a));
    bb.adopt(readPenLiveState(b));
    const sa = readPenLiveState(a);
    const sb = readPenLiveState(b);
    ba.applyLocal({ ...sa, sections: [{ ...section(sa), doc: para('Hello world') }] });
    bb.applyLocal({ ...sb, sections: [{ ...section(sb), doc: para('Hey Hello') }] });
    sync(a, b);
    expect(textOf(section(readPenLiveState(a)).doc)).toBe('Hey Hello world');
    expect(readPenLiveState(a)).toEqual(readPenLiveState(b));
  });

  it('keeps concurrent edits to different layer properties and a remote-added layer', () => {
    const [a, b] = forkFromSeed(baseState());
    const ba = new PenLiveBridge(a, schema);
    const bb = new PenLiveBridge(b, schema);
    const sa = readPenLiveState(a);
    const sb = readPenLiveState(b);
    ba.adopt(sa);
    bb.adopt(sb);
    const la = section(sa).layers![0]!;
    const lb = section(sb).layers![0]!;
    ba.applyLocal({ ...sa, sections: [{ ...section(sa), layers: [{ ...la, x: 40 }] }] });
    bb.applyLocal({
      ...sb,
      sections: [{ ...section(sb), layers: [{ ...lb, opacity: 50 }, layer('l2', { zIndex: 2 })] }]
    });
    sync(a, b);
    const merged = section(readPenLiveState(a)).layers!;
    expect(merged.find((l) => l.id === 'l1')).toMatchObject({ x: 40, opacity: 50 });
    expect(merged.some((l) => l.id === 'l2')).toBe(true);
  });

  it('merges concurrent timeline cuts on one layer', () => {
    const [a, b] = forkFromSeed(baseState());
    const ba = new PenLiveBridge(a, schema);
    const bb = new PenLiveBridge(b, schema);
    const sa = readPenLiveState(a);
    const sb = readPenLiveState(b);
    ba.adopt(sa);
    bb.adopt(sb);
    const la = section(sa).layers![0]!;
    const lb = section(sb).layers![0]!;
    ba.applyLocal({
      ...sa,
      sections: [{ ...section(sa), layers: [{ ...la, clips: [...la.clips!, { id: 'ca', inSec: 3, outSec: 4 }] }] }]
    });
    bb.applyLocal({
      ...sb,
      sections: [{ ...section(sb), layers: [{ ...lb, clips: [...lb.clips!, { id: 'cb', inSec: 5, outSec: 6 }] }] }]
    });
    sync(a, b);
    const clips = section(readPenLiveState(a)).layers![0]!.clips!.map((c) => c.id);
    expect(clips).toEqual(['c1', 'ca', 'cb']);
  });

  it('a delete racing an edit removes the layer on both sides', () => {
    const [a, b] = forkFromSeed(baseState());
    const ba = new PenLiveBridge(a, schema);
    const bb = new PenLiveBridge(b, schema);
    const sa = readPenLiveState(a);
    const sb = readPenLiveState(b);
    ba.adopt(sa);
    bb.adopt(sb);
    ba.applyLocal({ ...sa, sections: [{ ...section(sa), layers: [] }] });
    bb.applyLocal({
      ...sb,
      sections: [{ ...section(sb), layers: [{ ...section(sb).layers![0]!, x: 99 }] }]
    });
    sync(a, b);
    expect(readPenLiveState(a)).toEqual(readPenLiveState(b));
    expect(section(readPenLiveState(a)).layers).toBeUndefined();
  });

  it('reports remote section changes and not local ones', () => {
    const [a, b] = forkFromSeed(baseState());
    const bb = new PenLiveBridge(b, schema);
    bb.adopt(readPenLiveState(b));
    const seen: string[] = [];
    bb.onRemote((change) => seen.push(...change.sections.keys()));
    const ba = new PenLiveBridge(a, schema);
    const sa = readPenLiveState(a);
    ba.adopt(sa);
    ba.applyLocal({ ...sa, sections: [{ ...section(sa), doc: para('Changed') }] });
    bb.applyLocal({ ...readPenLiveState(b), title: 'Local title' });
    expect(seen).toEqual([]);
    sync(a, b);
    expect(seen).toContain('body');
  });

  it('keeps both pages when two editors add one at the same time', () => {
    const [a, b] = forkFromSeed(baseState());
    const ba = new PenLiveBridge(a, schema);
    const bb = new PenLiveBridge(b, schema);
    const sa = readPenLiveState(a);
    const sb = readPenLiveState(b);
    ba.adopt(sa);
    bb.adopt(sb);
    ba.applyLocal({ ...sa, toc: ['body', 'p2'], sections: [...sa.sections, { slug: 'p2', doc: para('A') }] });
    bb.applyLocal({ ...sb, toc: ['body', 'p3'], sections: [...sb.sections, { slug: 'p3', doc: para('B') }] });
    sync(a, b);
    const merged = readPenLiveState(a);
    expect(merged.toc.slice().sort()).toEqual(['body', 'p2', 'p3']);
    expect(merged.toc).toEqual(readPenLiveState(b).toc);
  });

  it('drops a deleted page from the toc even when a peer reordered pages concurrently', () => {
    const start: PenLiveDocState = {
      title: 'Doc',
      toc: ['body', 'p2', 'p3'],
      sections: ['body', 'p2', 'p3'].map((slug) => ({ slug, doc: para(slug) }))
    };
    const [a, b] = forkFromSeed(start);
    const ba = new PenLiveBridge(a, schema);
    const bb = new PenLiveBridge(b, schema);
    const sa = readPenLiveState(a);
    const sb = readPenLiveState(b);
    ba.adopt(sa);
    bb.adopt(sb);
    ba.applyLocal({ ...sa, toc: ['body', 'p3'], sections: sa.sections.filter((s) => s.slug !== 'p2') });
    bb.applyLocal({ ...sb, toc: ['p3', 'body', 'p2'] });
    sync(a, b);
    const merged = readPenLiveState(a);
    expect(merged.toc).not.toContain('p2');
    expect(merged.toc.slice().sort()).toEqual(['body', 'p3']);
    expect(merged).toEqual(readPenLiveState(b));
  });

  it('converges concurrent layer reorders without duplicate layers', () => {
    const start: PenLiveDocState = {
      title: 'Doc',
      toc: ['body'],
      sections: [{ slug: 'body', doc: para('x'), layers: [layer('l1'), layer('l2'), layer('l3')] }]
    };
    const [a, b] = forkFromSeed(start);
    const ba = new PenLiveBridge(a, schema);
    const bb = new PenLiveBridge(b, schema);
    const sa = readPenLiveState(a);
    const sb = readPenLiveState(b);
    ba.adopt(sa);
    bb.adopt(sb);
    const [l1, l2, l3] = section(sa).layers!;
    ba.applyLocal({ ...sa, sections: [{ ...section(sa), layers: [l3!, l1!, l2!] }] });
    bb.applyLocal({ ...sb, sections: [{ ...section(sb), layers: [l2!, l1!, l3!] }] });
    sync(a, b);
    const ids = section(readPenLiveState(a)).layers!.map((l) => l.id);
    expect(ids.slice().sort()).toEqual(['l1', 'l2', 'l3']);
    expect(ids).toEqual(section(readPenLiveState(b)).layers!.map((l) => l.id));
  });

  it('merges concurrent widget settings and a concurrent move on one layer', () => {
    const start: PenLiveDocState = {
      title: 'Doc',
      toc: ['body'],
      sections: [
        {
          slug: 'body',
          doc: para('x'),
          layers: [layer('w1', { kind: 'interactive', behavior: 'poll.vote', name: 'Poll' })]
        }
      ]
    };
    const [a, b] = forkFromSeed(start);
    const ba = new PenLiveBridge(a, schema);
    const bb = new PenLiveBridge(b, schema);
    const sa = readPenLiveState(a);
    const sb = readPenLiveState(b);
    ba.adopt(sa);
    bb.adopt(sb);
    const wa = section(sa).layers![0]!;
    const wb = section(sb).layers![0]!;
    ba.applyLocal({ ...sa, sections: [{ ...section(sa), layers: [{ ...wa, name: 'Favourite colour?' }] }] });
    bb.applyLocal({ ...sb, sections: [{ ...section(sb), layers: [{ ...wb, x: 120, y: 64 }] }] });
    sync(a, b);
    expect(section(readPenLiveState(a)).layers![0]).toMatchObject({
      behavior: 'poll.vote',
      name: 'Favourite colour?',
      x: 120,
      y: 64
    });
    expect(readPenLiveState(a)).toEqual(readPenLiveState(b));
  });

  it('leaves an editor-bound fragment to the editor', () => {
    const doc = new Y.Doc();
    const bridge = new PenLiveBridge(doc, schema);
    const state = baseState();
    bridge.applyLocal(state);
    const frag = bridge.ensureFragment('body', null, para('ignored'))!;
    expect(textOf(section(readPenLiveState(doc)).doc)).toBe('Hello');
    bridge.bind(frag);
    bridge.applyLocal({ ...state, sections: [{ ...section(state), doc: para('Stale editor JSON') }] });
    expect(textOf(section(readPenLiveState(doc)).doc)).toBe('Hello');
    bridge.bind(null);
    bridge.applyLocal({ ...state, sections: [{ ...section(state), doc: para('Unbound write') }] });
    expect(textOf(section(readPenLiveState(doc)).doc)).toBe('Unbound write');
  });

  it('creates a missing text-layer fragment from the given doc', () => {
    const doc = new Y.Doc();
    const bridge = new PenLiveBridge(doc, schema);
    bridge.applyLocal({ ...baseState(), sections: [{ slug: 'body', doc: para('Hi'), layers: [layer('l9')] }] });
    const frag = bridge.ensureFragment('body', 'l9', para('Layer text'));
    expect(frag).not.toBeNull();
    expect(textOf(section(readPenLiveState(doc)).layers?.[0]?.textDoc)).toBe('Layer text');
    expect(bridge.ensureFragment('missing', null, para('x'))).toBeNull();
  });

  it('reports undo of local edits so the app can show it', () => {
    const doc = new Y.Doc();
    const bridge = new PenLiveBridge(doc, schema);
    const state = baseState();
    bridge.applyLocal(state);
    const undo = new Y.UndoManager([doc.getMap('sections'), doc.getMap('meta')], {
      trackedOrigins: new Set([PEN_LIVE_LOCAL])
    });
    const l1 = section(state).layers![0]!;
    bridge.applyLocal({ ...state, sections: [{ ...section(state), layers: [{ ...l1, x: 77 }] }] });
    const seen: PenSectionContent[] = [];
    bridge.onRemote((change) => {
      const s = change.sections.get('body');
      if (s) seen.push(s);
    });
    undo.undo();
    expect(seen.at(-1)?.layers?.[0]?.x).toBe(0);
  });
});

function keys() {
  const kp = mlDsa65Keygen();
  return { secret: kp.secretKey, pub: bytesToBase64(kp.publicKey) };
}

describe('batch verification', () => {
  const docKey = generateChatKey();
  const owner = keys();
  const viewer = keys();
  const commentor = keys();
  const stranger = keys();
  const roles: PenRoleAssignment[] = [
    { pnHash: 'owner', role: 'owner', mlDsaPublicKey: owner.pub },
    { pnHash: 'viewer', role: 'viewer', mlDsaPublicKey: viewer.pub },
    { pnHash: 'commentor', role: 'commentor', mlDsaPublicKey: commentor.pub }
  ];
  const ctx = () => ({
    docId: 'd1',
    keyEpoch: 0,
    docKey,
    roles,
    ownerPnHash: 'owner',
    replay: new PenLiveReplayGuard()
  });
  const seal = (pnHash: string, secret: Uint8Array, type: PenLiveBatch['type'] = 'update', seq = 1) =>
    sealPenLiveBatch({
      docId: 'd1',
      keyEpoch: 0,
      docKey,
      signer: { pnHash, mlDsaSecretKey: secret },
      clientId: 7,
      seq,
      type,
      payload: new Uint8Array([1, 2, 3])
    });

  it('accepts an owner update and decrypts it', async () => {
    const opened = await openPenLiveBatch(await seal('owner', owner.secret), ctx());
    expect(opened.ok && Array.from(opened.payload)).toEqual([1, 2, 3]);
  });

  it('rejects a batch signed by someone else claiming to be the owner', async () => {
    const forged = await seal('owner', stranger.secret);
    expect(await openPenLiveBatch(forged, ctx())).toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('rejects tampered ciphertext', async () => {
    const batch = await seal('owner', owner.secret);
    const tampered = { ...batch, seq: 2 };
    expect(await openPenLiveBatch(tampered, ctx())).toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('rejects edits from viewers and commentors but lets them request sync', async () => {
    expect(await openPenLiveBatch(await seal('viewer', viewer.secret), ctx())).toEqual({
      ok: false,
      reason: 'role_denied'
    });
    expect(await openPenLiveBatch(await seal('commentor', commentor.secret), ctx())).toEqual({
      ok: false,
      reason: 'role_denied'
    });
    expect(await openPenLiveBatch(await seal('viewer', viewer.secret, 'sync2'), ctx())).toEqual({
      ok: false,
      reason: 'role_denied'
    });
    expect((await openPenLiveBatch(await seal('viewer', viewer.secret, 'sync1'), ctx())).ok).toBe(true);
  });

  it('rejects non-members, other epochs and replays', async () => {
    expect(await openPenLiveBatch(await seal('stranger', stranger.secret), ctx())).toEqual({
      ok: false,
      reason: 'not_member'
    });
    const batch = await seal('owner', owner.secret);
    expect(await openPenLiveBatch(batch, { ...ctx(), keyEpoch: 1 })).toEqual({
      ok: false,
      reason: 'wrong_epoch'
    });
    const c = ctx();
    expect((await openPenLiveBatch(batch, c)).ok).toBe(true);
    expect(await openPenLiveBatch(batch, c)).toEqual({ ok: false, reason: 'replay' });
  });

  it('accepts out-of-order seqs inside the window once each', () => {
    const guard = new PenLiveReplayGuard();
    expect(guard.accept('a', 1, 5)).toBe(true);
    expect(guard.accept('a', 1, 3)).toBe(true);
    expect(guard.accept('a', 1, 3)).toBe(false);
    expect(guard.accept('a', 2, 3)).toBe(true);
    expect(guard.accept('a', 1, 0)).toBe(false);
  });

  it('derives a different room per key epoch', () => {
    expect(penLiveRoomToken(docKey, 'g1', 0)).not.toBe(penLiveRoomToken(docKey, 'g1', 1));
    expect(penLiveRoomToken(docKey, 'g1', 0)).toBe(penLiveRoomToken(docKey, 'g1', 0));
  });
});

describe('member key attestation', () => {
  const owner = keys();
  const member = keys();
  const intruder = keys();
  const anchor = { docId: 'd1', ownerPnHash: 'owner', ownerMlDsaPublicKey: owner.pub };
  const ownerKem = bytesToBase64(new Uint8Array(32).fill(9));

  it('trusts a member key only with an owner attestation for this doc', () => {
    const keyAttestation = attestMemberKey({
      docId: 'd1',
      pnHash: 'member',
      mlDsaPublicKey: member.pub,
      owner: { pnHash: 'owner', mlDsaSecretKey: owner.secret }
    });
    const roles: PenRoleAssignment[] = [
      { pnHash: 'owner', role: 'owner', mlDsaPublicKey: intruder.pub },
      { pnHash: 'member', role: 'collaborator', mlDsaPublicKey: member.pub, keyAttestation },
      { pnHash: 'self-asserted', role: 'collaborator', mlDsaPublicKey: intruder.pub }
    ];
    const trusted = trustedLiveRoles(roles, anchor);
    expect(trusted.find((r) => r.pnHash === 'owner')?.mlDsaPublicKey).toBe(owner.pub);
    expect(trusted.find((r) => r.pnHash === 'member')?.mlDsaPublicKey).toBe(member.pub);
    expect(trusted.find((r) => r.pnHash === 'self-asserted')?.mlDsaPublicKey).toBeUndefined();
    expect(trustedLiveRoles(roles, { ...anchor, docId: 'other' }).find((r) => r.pnHash === 'member')?.mlDsaPublicKey).toBeUndefined();
  });

  it('accepts a key claim made with the invite secret and refuses one made without it', () => {
    const secret = deriveKeyClaimSecret(ownerKem, 'd1', 'member');
    const claim = makeKeyClaim({ docId: 'd1', pnHash: 'member', mlDsaPublicKey: member.pub, claimSecret: secret });
    expect(verifyKeyClaim(ownerKem, claim)).toBe(true);
    const otherSecret = deriveKeyClaimSecret(ownerKem, 'd1', 'intruder');
    const forged = makeKeyClaim({ docId: 'd1', pnHash: 'member', mlDsaPublicKey: intruder.pub, claimSecret: otherSecret });
    expect(verifyKeyClaim(ownerKem, forged)).toBe(false);
    expect(verifyKeyClaim(ownerKem, { ...claim, mlDsaPublicKey: intruder.pub })).toBe(false);
  });

  it('verifies owner-signed role updates', () => {
    const update = signRolesUpdate({
      docId: 'd1',
      keyEpoch: 0,
      roles: [{ pnHash: 'member', role: 'viewer' }],
      owner: { pnHash: 'owner', mlDsaSecretKey: owner.secret }
    });
    expect(verifyRolesUpdate(update, anchor)).toBe(true);
    expect(verifyRolesUpdate({ ...update, roles: [{ pnHash: 'member', role: 'owner' }] }, anchor)).toBe(false);
    const byIntruder = signRolesUpdate({
      docId: 'd1',
      keyEpoch: 0,
      roles: [],
      owner: { pnHash: 'owner', mlDsaSecretKey: intruder.secret }
    });
    expect(verifyRolesUpdate(byIntruder, anchor)).toBe(false);
  });

  it('verifies owner-signed re-keys and refuses tampered key maps', () => {
    const rekey = signRekey({
      docId: 'd1',
      keyEpoch: 1,
      roles: [{ pnHash: 'member', role: 'collaborator' }],
      keys: { member: 'sealed-for-member' },
      owner: { pnHash: 'owner', mlDsaSecretKey: owner.secret }
    });
    expect(verifyRekey(rekey, anchor)).toBe(true);
    expect(verifyRekey({ ...rekey, keys: { ...rekey.keys, removed: 'sealed-for-removed' } }, anchor)).toBe(false);
    expect(verifyRekey({ ...rekey, keyEpoch: 2 }, anchor)).toBe(false);
    expect(verifyRekey({ ...rekey, roles: [] }, anchor)).toBe(false);
    expect(verifyRekey(rekey, { ...anchor, ownerMlDsaPublicKey: intruder.pub })).toBe(false);
  });
});

describe('snapshots', () => {
  it('round-trips under the same epoch and refuses another epoch', async () => {
    const docKey = generateChatKey();
    const doc = new Y.Doc();
    new PenLiveBridge(doc, schema).applyLocal(baseState());
    const sealed = await sealPenLiveSnapshot(doc, docKey, 2);
    expect(await openPenLiveSnapshot(sealed, docKey, 3)).toBeNull();
    const update = await openPenLiveSnapshot(sealed, docKey, 2);
    const restored = new Y.Doc();
    Y.applyUpdate(restored, update!);
    expect(readPenLiveState(restored)).toEqual(readPenLiveState(doc));
  });
});

function createHub() {
  type Handler = (kind: PenLiveWireKind, room: string, payload: PenLiveWirePayload) => void;
  const clients: Array<{ rooms: Set<string>; handlers: Set<Handler> }> = [];
  let sent = 0;
  return {
    get sent() {
      return sent;
    },
    transport(): PenLiveTransport {
      const me = { rooms: new Set<string>(), handlers: new Set<Handler>() };
      clients.push(me);
      return {
        join: (room) => me.rooms.add(room),
        leave: (room) => me.rooms.delete(room),
        send: (kind, room, payload) => {
          sent += 1;
          const wire = JSON.stringify(payload);
          for (const other of clients) {
            if (other === me || !other.rooms.has(room)) continue;
            for (const h of other.handlers) setTimeout(() => h(kind, room, JSON.parse(wire)), 0);
          }
        },
        subscribe: (h) => {
          me.handlers.add(h);
          return () => me.handlers.delete(h);
        },
        onReconnect: () => () => undefined
      };
    }
  };
}

async function settle(sessions: PenLiveSession[], rounds = 25): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    await Promise.all(sessions.map((s) => s.drain()));
    await new Promise((r) => setTimeout(r, 4));
  }
}

describe('live session over a relay', () => {
  const docKey = generateChatKey();
  const owner = keys();
  const collab = keys();
  const viewer = keys();
  const roles: PenRoleAssignment[] = [
    { pnHash: 'owner', role: 'owner', mlDsaPublicKey: owner.pub },
    { pnHash: 'collab', role: 'collaborator', mlDsaPublicKey: collab.pub },
    { pnHash: 'viewer', role: 'viewer', mlDsaPublicKey: viewer.pub }
  ];

  function open(hub: ReturnType<typeof createHub>, pnHash: string, secret: Uint8Array, seed?: Uint8Array) {
    const ydoc = new Y.Doc();
    if (seed) Y.applyUpdate(ydoc, seed, PEN_LIVE_REMOTE);
    const rejects: string[] = [];
    const session = new PenLiveSession({
      ydoc,
      docId: 'd1',
      groupId: 'g1',
      keyEpoch: 0,
      docKey,
      signer: { pnHash, mlDsaSecretKey: secret },
      roles,
      ownerPnHash: 'owner',
      transport: hub.transport(),
      batchWindowMs: 5,
      onReject: (r) => rejects.push(r)
    });
    return { ydoc, session, bridge: new PenLiveBridge(ydoc, schema), rejects };
  }

  it('two editors converge and a late joiner catches up from peers', async () => {
    const hub = createHub();
    const seed = penLiveSeedUpdate(baseState(), schema);
    const a = open(hub, 'owner', owner.secret, seed);
    const b = open(hub, 'collab', collab.secret, seed);
    a.session.start();
    b.session.start();
    await settle([a.session, b.session]);

    const sa = readPenLiveState(a.ydoc);
    a.bridge.adopt(sa);
    a.bridge.applyLocal({ ...sa, sections: [{ ...section(sa), doc: para('Hello there') }] });
    const sb = readPenLiveState(b.ydoc);
    b.bridge.adopt(sb);
    b.bridge.applyLocal({ ...sb, title: 'Shared title' });
    await settle([a.session, b.session]);

    expect(readPenLiveState(a.ydoc)).toEqual(readPenLiveState(b.ydoc));
    expect(readPenLiveState(b.ydoc).title).toBe('Shared title');
    expect(textOf(section(readPenLiveState(b.ydoc)).doc)).toBe('Hello there');

    const late = open(hub, 'viewer', viewer.secret);
    late.session.start();
    await settle([a.session, b.session, late.session]);
    expect(readPenLiveState(late.ydoc)).toEqual(readPenLiveState(a.ydoc));

    await Promise.all([a.session.stop(), b.session.stop(), late.session.stop()]);
    expect(a.rejects).toEqual([]);
  });

  it('a viewer’s local edits never reach editors', async () => {
    const hub = createHub();
    const seed = penLiveSeedUpdate(baseState(), schema);
    const a = open(hub, 'owner', owner.secret, seed);
    const v = open(hub, 'viewer', viewer.secret, seed);
    a.session.start();
    v.session.start();
    await settle([a.session, v.session]);
    const sv = readPenLiveState(v.ydoc);
    v.bridge.adopt(sv);
    v.bridge.applyLocal({ ...sv, title: 'Viewer was here' });
    await settle([a.session, v.session]);
    expect(readPenLiveState(a.ydoc).title).toBe('Doc');
    await Promise.all([a.session.stop(), v.session.stop()]);
  });

  it('moves large batches as chunks', async () => {
    const hub = createHub();
    const seed = penLiveSeedUpdate(baseState(), schema);
    const a = open(hub, 'owner', owner.secret, seed);
    const b = open(hub, 'collab', collab.secret, seed);
    a.session.start();
    b.session.start();
    await settle([a.session, b.session]);
    const big = 'x'.repeat(120_000);
    const sa = readPenLiveState(a.ydoc);
    a.bridge.adopt(sa);
    a.bridge.applyLocal({ ...sa, sections: [{ ...section(sa), doc: para(big) }] });
    await settle([a.session, b.session]);
    expect(textOf(section(readPenLiveState(b.ydoc)).doc)).toBe(big);
    await Promise.all([a.session.stop(), b.session.stop()]);
  });

  it('peers on an old key epoch are not heard after a re-key', async () => {
    const hub = createHub();
    const seed = penLiveSeedUpdate(baseState(), schema);
    const a = open(hub, 'owner', owner.secret, seed);
    const b = open(hub, 'collab', collab.secret, seed);
    a.session.start();
    b.session.start();
    await settle([a.session, b.session]);
    a.session.rekey(generateChatKey(), 1, roles);
    const sb = readPenLiveState(b.ydoc);
    b.bridge.adopt(sb);
    b.bridge.applyLocal({ ...sb, title: 'From old epoch' });
    await settle([a.session, b.session]);
    expect(readPenLiveState(a.ydoc).title).toBe('Doc');
    await Promise.all([a.session.stop(), b.session.stop()]);
  });

  it('delivers control messages to members on the same key and reports peers', async () => {
    const hub = createHub();
    const seed = penLiveSeedUpdate(baseState(), schema);
    const a = open(hub, 'owner', owner.secret, seed);
    const ydoc = new Y.Doc();
    Y.applyUpdate(ydoc, seed, PEN_LIVE_REMOTE);
    const controls: unknown[] = [];
    const peers: string[] = [];
    const b = new PenLiveSession({
      ydoc,
      docId: 'd1',
      groupId: 'g1',
      keyEpoch: 0,
      docKey,
      signer: { pnHash: 'collab', mlDsaSecretKey: collab.secret },
      roles,
      ownerPnHash: 'owner',
      transport: hub.transport(),
      batchWindowMs: 5,
      onControl: (m) => controls.push(m),
      onPeer: (pn) => peers.push(pn)
    });
    b.start();
    a.session.start();
    await settle([a.session, b]);
    a.session.sendControl({ t: 'ping', n: 1 });
    await settle([a.session, b]);
    expect(controls).toEqual([{ t: 'ping', n: 1 }]);
    expect(peers).toContain('owner');
    await Promise.all([a.session.stop(), b.stop()]);
  });

  it('shares presence between members', async () => {
    const hub = createHub();
    const seed = penLiveSeedUpdate(baseState(), schema);
    const a = open(hub, 'owner', owner.secret, seed);
    const b = open(hub, 'collab', collab.secret, seed);
    a.session.start();
    b.session.start();
    a.session.awareness.setLocalStateField('user', { name: 'Owner', color: '#f00' });
    await settle([a.session, b.session]);
    const states = Array.from(b.session.awareness.getStates().values());
    expect(states.some((s) => (s as { user?: { name?: string } }).user?.name === 'Owner')).toBe(true);
    await Promise.all([a.session.stop(), b.session.stop()]);
  });

  it('lists present members once each, with where they are working', async () => {
    const hub = createHub();
    const seed = penLiveSeedUpdate(baseState(), schema);
    const a = open(hub, 'owner', owner.secret, seed);
    const b = open(hub, 'collab', collab.secret, seed);
    a.session.start();
    b.session.start();
    setPenLivePresence(
      a.session.awareness,
      { name: 'Owner', color: penLivePresenceColor('owner') },
      { pnHash: 'owner', activeSectionSlug: 'body', selectedLayerIds: ['l1'] }
    );
    setPenLivePresence(b.session.awareness, { name: 'Collab', color: '#000' }, { pnHash: 'collab' });
    await settle([a.session, b.session]);
    const peers = readPenLivePeers(b.session.awareness, roles, 'owner');
    expect(peers).toHaveLength(1);
    expect(peers[0]).toMatchObject({
      pnHash: 'owner',
      name: 'Owner',
      activeSectionSlug: 'body',
      selectedLayerIds: ['l1'],
      color: penLivePresenceColor('owner')
    });
    expect(readPenLivePeers(b.session.awareness, [], 'someone-else')).toEqual([]);
    await Promise.all([a.session.stop(), b.session.stop()]);
  });
});
