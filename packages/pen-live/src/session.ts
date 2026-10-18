import * as Y from 'yjs';
import { removeAwarenessStates } from 'y-protocols/awareness';
import {
  canPenRole,
  resolvePenRole,
  type PenLiveAwareness,
  type PenLiveBatch,
  type PenRoleAssignment
} from '@par-noir/pen-protocol';
import { Awareness, applyPenLiveAwareness, sealPenLiveAwareness } from './awareness.js';
import { PenLiveUpdateBatcher, sealPenLiveBatch, type PenLiveSigner } from './batch.js';
import { openBytes, sealBytes } from './crypto.js';
import { PEN_LIVE_REMOTE } from './docModel.js';
import { penLiveRoomToken } from './roomToken.js';
import { penLiveDiffFor, penLiveStateVector } from './syncProtocol.js';
import { openPenLiveBatch, PenLiveReplayGuard, type PenLiveRejectReason } from './verify.js';

/** Relay messages are capped server-side; larger batches travel as chunks. */
export const PEN_LIVE_CHUNK_CHARS = 48_000;
const MAX_REASSEMBLY_CHARS = 16_000_000;
const CHUNK_TTL_MS = 30_000;

export type PenLiveWireKind = 'batch' | 'sync' | 'awareness' | 'control';

export interface PenLiveChunk {
  chunk: { id: string; i: number; n: number; part: string };
}

/** docKey-encrypted JSON (key claims, owner-signed role updates); content is checked by the receiver. */
export interface PenLiveControlEnvelope {
  docId: string;
  keyEpoch: number;
  control: string;
}

export type PenLiveWirePayload =
  | PenLiveBatch
  | PenLiveChunk
  | PenLiveAwareness
  | PenLiveControlEnvelope;

/** Socket transport supplied by the app (socket.io in Pen, an in-memory hub in tests). */
export interface PenLiveTransport {
  join(roomToken: string): void;
  leave(roomToken: string): void;
  send(kind: PenLiveWireKind, roomToken: string, payload: PenLiveWirePayload): void;
  subscribe(
    handler: (kind: PenLiveWireKind, roomToken: string, payload: PenLiveWirePayload) => void
  ): () => void;
  onReconnect(handler: () => void): () => void;
}

export interface PenLiveSessionOptions {
  ydoc: Y.Doc;
  docId: string;
  groupId: string;
  keyEpoch: number;
  docKey: string;
  signer: PenLiveSigner;
  roles: PenRoleAssignment[] | undefined;
  ownerPnHash: string | undefined;
  transport: PenLiveTransport;
  batchWindowMs?: number;
  onReject?: (reason: PenLiveRejectReason) => void;
  /** Fired after a remote update or sync reply is applied. */
  onRemoteApplied?: () => void;
  /** First verified sync request from a peer session (any role). */
  onPeer?: (pnHash: string) => void;
  /** Decrypted control message; the receiver must verify it. */
  onControl?: (message: unknown) => void;
}

function isChunk(payload: PenLiveWirePayload): payload is PenLiveChunk {
  return Boolean((payload as PenLiveChunk).chunk);
}

function randomId(): string {
  const bytes = new Uint8Array(12);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * One live editing session on one doc + key epoch: batches and signs local
 * Yjs updates, verifies and applies peer batches, runs the encrypted sync
 * handshake and relays presence.
 */
export class PenLiveSession {
  readonly awareness: Awareness;
  private opts: PenLiveSessionOptions;
  private room = '';
  private seq = 0;
  private replay = new PenLiveReplayGuard();
  private syncedWith = new Set<string>();
  private chunks = new Map<string, { parts: string[]; got: number; size: number; at: number }>();
  private sendChain: Promise<void> = Promise.resolve();
  private batcher: PenLiveUpdateBatcher;
  private unsubs: Array<() => void> = [];
  private started = false;

  constructor(opts: PenLiveSessionOptions) {
    this.opts = opts;
    this.awareness = new Awareness(opts.ydoc);
    this.batcher = new PenLiveUpdateBatcher(opts.batchWindowMs ?? 150, (merged) =>
      this.sendBatch('batch', 'update', merged)
    );
  }

  get roomToken(): string {
    return this.room;
  }

  get canEdit(): boolean {
    const role = resolvePenRole(this.opts.roles, this.opts.signer.pnHash, this.opts.ownerPnHash);
    return Boolean(role && canPenRole(role, 'live_edit'));
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    const { ydoc, transport } = this.opts;
    this.room = penLiveRoomToken(this.opts.docKey, this.opts.groupId, this.opts.keyEpoch);

    const onUpdate = (update: Uint8Array, origin: unknown) => {
      if (origin === PEN_LIVE_REMOTE || !this.canEdit) return;
      this.batcher.push(update);
    };
    ydoc.on('update', onUpdate);
    this.unsubs.push(() => ydoc.off('update', onUpdate));

    const onAwareness = (
      { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
      origin: unknown
    ) => {
      if (origin !== 'local') return;
      this.sendAwareness([...added, ...updated, ...removed]);
    };
    this.awareness.on('update', onAwareness);
    this.unsubs.push(() => this.awareness.off('update', onAwareness));

    this.unsubs.push(
      transport.subscribe((kind, roomToken, payload) => {
        if (roomToken !== this.room) return;
        void this.receive(kind, payload);
      })
    );
    this.unsubs.push(
      transport.onReconnect(() => {
        transport.join(this.room);
        this.syncedWith.clear();
        this.requestSync();
        this.sendAwareness([this.opts.ydoc.clientID]);
      })
    );

    transport.join(this.room);
    this.requestSync();
  }

  /** Flush pending edits, announce departure and leave the room. */
  async stop(): Promise<void> {
    if (!this.started) return;
    this.batcher.flush();
    removeAwarenessStates(this.awareness, [this.opts.ydoc.clientID], 'local');
    await this.sendChain.catch(() => undefined);
    for (const off of this.unsubs.splice(0)) off();
    this.batcher.dispose();
    this.opts.transport.leave(this.room);
    this.awareness.destroy();
    this.started = false;
  }

  setRoles(roles: PenRoleAssignment[] | undefined): void {
    this.opts = { ...this.opts, roles };
  }

  /** Move to a new doc key epoch (member removed). Peers on the old key stop being heard. */
  rekey(docKey: string, keyEpoch: number, roles: PenRoleAssignment[] | undefined): void {
    this.batcher.flush();
    const old = this.room;
    this.opts = { ...this.opts, docKey, keyEpoch, roles };
    this.room = penLiveRoomToken(docKey, this.opts.groupId, keyEpoch);
    this.replay = new PenLiveReplayGuard();
    this.syncedWith.clear();
    this.chunks.clear();
    if (this.started) {
      this.opts.transport.leave(old);
      this.opts.transport.join(this.room);
      this.requestSync();
      this.sendAwareness([this.opts.ydoc.clientID]);
    }
  }

  requestSync(): void {
    this.sendBatch('sync', 'sync1', penLiveStateVector(this.opts.ydoc));
  }

  sendControl(message: object): void {
    const room = this.room;
    const { docId, keyEpoch, docKey, transport } = this.opts;
    this.sendChain = this.sendChain
      .then(async () => {
        const control = await sealBytes(new TextEncoder().encode(JSON.stringify(message)), docKey);
        transport.send('control', room, { docId, keyEpoch, control });
      })
      .catch(() => undefined);
  }

  /** Resolves once queued sends have been handed to the transport. */
  drain(): Promise<void> {
    this.batcher.flush();
    return this.sendChain;
  }

  private sendBatch(kind: 'batch' | 'sync', type: PenLiveBatch['type'], payload: Uint8Array): void {
    const room = this.room;
    const { docId, keyEpoch, docKey, signer, ydoc, transport } = this.opts;
    this.sendChain = this.sendChain
      .then(async () => {
        const batch = await sealPenLiveBatch({
          docId,
          keyEpoch,
          docKey,
          signer,
          clientId: ydoc.clientID,
          seq: ++this.seq,
          type,
          payload
        });
        const wire = JSON.stringify(batch);
        if (wire.length <= PEN_LIVE_CHUNK_CHARS) {
          transport.send(kind, room, batch);
          return;
        }
        const id = randomId();
        const n = Math.ceil(wire.length / PEN_LIVE_CHUNK_CHARS);
        for (let i = 0; i < n; i++) {
          const part = wire.slice(i * PEN_LIVE_CHUNK_CHARS, (i + 1) * PEN_LIVE_CHUNK_CHARS);
          transport.send(kind, room, { chunk: { id, i, n, part } });
        }
      })
      .catch(() => undefined);
  }

  private sendAwareness(clients: number[]): void {
    const room = this.room;
    const { docId, keyEpoch, docKey, signer, transport } = this.opts;
    this.sendChain = this.sendChain
      .then(async () => {
        const msg = await sealPenLiveAwareness({
          awareness: this.awareness,
          clients,
          docId,
          keyEpoch,
          docKey,
          authorPnHash: signer.pnHash
        });
        transport.send('awareness', room, msg);
      })
      .catch(() => undefined);
  }

  private reassemble(payload: PenLiveBatch | PenLiveChunk): PenLiveBatch | null {
    if (!isChunk(payload)) return payload;
    const { id, i, n, part } = payload.chunk;
    const now = Date.now();
    for (const [key, entry] of this.chunks) {
      if (now - entry.at > CHUNK_TTL_MS) this.chunks.delete(key);
    }
    if (!Number.isInteger(n) || n < 1 || !Number.isInteger(i) || i < 0 || i >= n) return null;
    let entry = this.chunks.get(id);
    if (!entry) {
      entry = { parts: new Array(n), got: 0, size: 0, at: now };
      this.chunks.set(id, entry);
    }
    if (entry.parts.length !== n || entry.parts[i] !== undefined) return null;
    entry.size += part.length;
    if (entry.size > MAX_REASSEMBLY_CHARS) {
      this.chunks.delete(id);
      return null;
    }
    entry.parts[i] = part;
    entry.got += 1;
    if (entry.got < n) return null;
    this.chunks.delete(id);
    try {
      return JSON.parse(entry.parts.join('')) as PenLiveBatch;
    } catch {
      return null;
    }
  }

  private async receive(kind: PenLiveWireKind, payload: PenLiveWirePayload): Promise<void> {
    const { ydoc, docId, keyEpoch, docKey, roles, ownerPnHash } = this.opts;
    if (kind === 'control') {
      const env = payload as PenLiveControlEnvelope;
      if (env.docId !== docId || env.keyEpoch !== keyEpoch || typeof env.control !== 'string') return;
      try {
        const bytes = await openBytes(env.control, docKey);
        this.opts.onControl?.(JSON.parse(new TextDecoder().decode(bytes)));
      } catch {
        /* not for this key */
      }
      return;
    }
    if (kind === 'awareness') {
      await applyPenLiveAwareness({
        awareness: this.awareness,
        message: payload as PenLiveAwareness,
        docId,
        keyEpoch,
        docKey,
        roles,
        ownerPnHash
      });
      return;
    }
    const batch = this.reassemble(payload as PenLiveBatch | PenLiveChunk);
    if (!batch) return;
    const opened = await openPenLiveBatch(batch, {
      docId,
      keyEpoch,
      docKey,
      roles,
      ownerPnHash,
      replay: this.replay
    });
    if (!opened.ok) {
      this.opts.onReject?.(opened.reason);
      return;
    }
    if (batch.type === 'sync1') {
      if (this.canEdit) {
        const diff = penLiveDiffFor(ydoc, opened.payload);
        if (diff) this.sendBatch('sync', 'sync2', diff);
      }
      const peer = `${batch.authorPnHash}:${batch.clientId}`;
      if (!this.syncedWith.has(peer)) {
        this.syncedWith.add(peer);
        this.requestSync();
        this.sendAwareness([ydoc.clientID]);
        this.opts.onPeer?.(batch.authorPnHash);
      }
      return;
    }
    Y.applyUpdate(ydoc, opened.payload, PEN_LIVE_REMOTE);
    this.opts.onRemoteApplied?.();
  }
}
