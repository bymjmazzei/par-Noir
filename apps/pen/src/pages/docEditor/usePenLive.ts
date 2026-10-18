/**
 * Live co-editing for one open doc: Y.Doc + bridge + encrypted relay session.
 *
 * Runs only for shared docs (more than one role) when this device holds the
 * docKey and ML-DSA signing keys. The Y.Doc becomes the source of truth for
 * sections, title and toc once live; the app writes through `applyLocal` and
 * hears peers through `onRemote` / `onAdopt`.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import * as Y from 'yjs';
import {
  PEN_LIVE_LOCAL,
  PEN_LIVE_REMOTE,
  PenLiveBridge,
  PenLiveSession,
  attestMemberKey,
  bytesToBase64,
  makeKeyClaim,
  penLiveHasContent,
  penLiveSectionsMap,
  penLiveSeedUpdate,
  readPenLiveState,
  sealPenLiveSnapshot,
  signRolesUpdate,
  trustedLiveRoles,
  verifyKeyClaim,
  verifyRolesUpdate,
  type PenLiveControl,
  type PenLiveDocState,
  type PenLiveRemoteChange,
  type PenLiveRolesUpdate,
  type PenLiveSealedSnapshot,
  type PenLiveSigner,
  type PenLiveTrustAnchor
} from '@par-noir/pen-live';
import {
  hashPnIdentifier,
  type PenRoleAssignment,
  type PenTipTapNode
} from '@par-noir/pen-protocol';
import type { PenSession } from '../../services/penSession';
import type { LocalDocBundle } from '../../services/penLocalStore';
import { resolveSigningKeys } from '../../services/penKeys';
import { loadDocKey } from '../../services/penDocCrypto';
import { ensureLiveClaimSecret } from '../../services/penHydrate';
import { penEditorSchema } from '../../services/penEditorExtensions';
import { createPenLiveTransport } from '../../services/penLiveSocket';
import {
  PEN_LIVE_SNAPSHOT_EVENT,
  applyLiveSnapshots,
  loadDriveLiveSnapshot,
  loadLiveRolesUpdate,
  loadLocalLiveSnapshot,
  saveLiveRolesUpdate,
  saveLocalLiveSnapshot
} from '../../services/penLiveStore';

/** Owner seeds the Y.Doc from the draft when no peer answers within this window. */
const OWNER_SEED_WAIT_MS = 2500;
/** A member with no live state falls back to classic editing after this window. */
const MEMBER_WAIT_MS = 6000;

export type PenLiveStatus = 'off' | 'connecting' | 'live';

export interface PenLiveHandle {
  status: PenLiveStatus;
  canEdit: boolean;
  canUndo: boolean;
  canRedo: boolean;
  undo(): void;
  redo(): void;
  applyLocal(state: PenLiveDocState): void;
  /**
   * Bind the editor to a section body / text layer fragment (created from
   * `doc` when missing), or unbind with null. `key` changes with the fragment.
   */
  bindFragment(
    target: { slug: string; layerId: string | null; doc: PenTipTapNode } | null
  ): { fragment: Y.XmlFragment; key: string } | null;
  sealSnapshot(): Promise<PenLiveSealedSnapshot | null>;
  /** Latest owner-signed roles update this device holds (for durable fanout). */
  rolesUpdate(): PenLiveRolesUpdate | null;
  session(): PenLiveSession | null;
}

interface Runtime {
  ydoc: Y.Doc;
  bridge: PenLiveBridge;
  session: PenLiveSession;
  undo: Y.UndoManager;
  docKey: string;
  keyEpoch: number;
  anchor: PenLiveTrustAnchor;
  signer: PenLiveSigner;
  signerPublicKey: string;
  isOwner: boolean;
}

const fragmentIds = new WeakMap<Y.XmlFragment, string>();
let nextFragmentId = 0;

function fragmentKey(frag: Y.XmlFragment): string {
  let id = fragmentIds.get(frag);
  if (!id) {
    id = `yf${++nextFragmentId}`;
    fragmentIds.set(frag, id);
  }
  return id;
}

function stateOf(bundle: LocalDocBundle): PenLiveDocState {
  return { title: bundle.manifest.title, toc: bundle.manifest.toc, sections: bundle.sections };
}

export function usePenLive(params: {
  session: PenSession;
  docId: string;
  bundle: LocalDocBundle | null;
  /** Peer or undo changes to merge into the app's bundle. */
  onRemote: (change: PenLiveRemoteChange) => void;
  /** Whole live state replaces the app's sections/title/toc (going live). */
  onAdopt: (state: PenLiveDocState) => void;
  /** Owner: a member proved a signing key; store the attestation on the manifest. */
  onAttest: (pnHash: string, mlDsaPublicKey: string, attestation: { by: string; signature: string }) => void;
  /** Session ended while live (doc closed or re-keyed): final sealed state for durable fanout. */
  onClosed?: (sealed: PenLiveSealedSnapshot, rolesUpdate: PenLiveRolesUpdate | null) => void;
}): PenLiveHandle {
  const { session, docId, bundle } = params;
  const [status, setStatus] = useState<PenLiveStatus>('off');
  const [canEdit, setCanEdit] = useState(false);
  const [undoUi, setUndoUi] = useState({ canUndo: false, canRedo: false });
  const runtimeRef = useRef<Runtime | null>(null);
  const statusRef = useRef<PenLiveStatus>('off');
  const rolesUpdateRef = useRef<PenLiveRolesUpdate | null>(null);
  const callbacks = useRef(params);
  callbacks.current = params;
  const bundleRef = useRef(bundle);
  bundleRef.current = bundle;

  const manifest = bundle?.manifest;
  const groupId = manifest?.groupId || '';
  const keyEpoch = manifest?.keyEpoch ?? 0;
  const ownerPnHash = manifest?.ownerPnHash || bundle?.chain.genesis.authorPnHash || '';
  const ownerKey = bundle?.chain.genesis.publicKey || '';
  const shared = (manifest?.roles?.length ?? 0) > 1;
  const [docKey, setDocKey] = useState(() => loadDocKey(docId));

  useEffect(() => {
    if (docKey || !groupId) return;
    const t = window.setInterval(() => {
      const k = loadDocKey(docId);
      if (k) setDocKey(k);
    }, 1000);
    return () => window.clearInterval(t);
  }, [docId, docKey, groupId]);

  const setLiveStatus = (next: PenLiveStatus) => {
    statusRef.current = next;
    setStatus(next);
  };

  useEffect(() => {
    if (!shared || !groupId || !docKey || !ownerPnHash || !ownerKey) return;
    let signer: PenLiveSigner;
    let signerPublicKey: string;
    try {
      const keys = resolveSigningKeys(session);
      const pnHash = hashPnIdentifier(session.pnIdentifier);
      signer = { pnHash, mlDsaSecretKey: keys.secretKey };
      signerPublicKey = bytesToBase64(keys.publicKey);
    } catch {
      return;
    }

    let disposed = false;
    const timers: number[] = [];
    const anchor: PenLiveTrustAnchor = { docId, ownerPnHash, ownerMlDsaPublicKey: ownerKey };
    const isOwner = signer.pnHash === ownerPnHash;
    const ydoc = new Y.Doc();
    const bridge = new PenLiveBridge(ydoc, penEditorSchema());
    const transport = createPenLiveTransport(session.accessToken);

    const rolesSource = (): PenRoleAssignment[] => {
      const manifestRoles = bundleRef.current?.manifest.roles || [];
      if (isOwner) return manifestRoles;
      const stored = rolesUpdateRef.current;
      return stored ? stored.roles : manifestRoles;
    };

    const storedUpdate = loadLiveRolesUpdate(session.pnIdentifier, docId);
    rolesUpdateRef.current =
      storedUpdate && storedUpdate.keyEpoch === keyEpoch && verifyRolesUpdate(storedUpdate, anchor)
        ? storedUpdate
        : null;

    const myKeyTrusted = (roles: PenRoleAssignment[]) =>
      roles.find((r) => r.pnHash === signer.pnHash)?.mlDsaPublicKey === signerPublicKey;

    let liveSession: PenLiveSession;
    const sendClaim = () => {
      if (isOwner || disposed) return;
      if (myKeyTrusted(trustedLiveRoles(rolesSource(), anchor))) return;
      void ensureLiveClaimSecret({ session, docId, groupId }).then((secret) => {
        if (!secret || disposed) return;
        liveSession.sendControl(
          makeKeyClaim({ docId, pnHash: signer.pnHash, mlDsaPublicKey: signerPublicKey, claimSecret: secret })
        );
      });
    };

    const broadcastRoles = () => {
      if (!isOwner || disposed) return;
      const update = signRolesUpdate({ docId, keyEpoch, roles: rolesSource(), owner: signer });
      rolesUpdateRef.current = update;
      liveSession.sendControl(update);
    };

    const onControl = (raw: unknown) => {
      const msg = raw as PenLiveControl;
      if (msg?.docId !== docId) return;
      if (msg.t === 'key_claim' && isOwner && session.mlKemSecretKey) {
        const member = (bundleRef.current?.manifest.roles || []).find((r) => r.pnHash === msg.pnHash);
        if (!member || member.role === 'owner') return;
        if (member.mlDsaPublicKey === msg.mlDsaPublicKey && member.keyAttestation) return;
        if (!verifyKeyClaim(session.mlKemSecretKey, msg)) return;
        const attestation = attestMemberKey({
          docId,
          pnHash: msg.pnHash,
          mlDsaPublicKey: msg.mlDsaPublicKey,
          owner: signer
        });
        callbacks.current.onAttest(msg.pnHash, msg.mlDsaPublicKey, attestation);
        return;
      }
      if (msg.t === 'roles' && !isOwner) {
        if (msg.keyEpoch !== keyEpoch || !verifyRolesUpdate(msg, anchor)) return;
        const prev = rolesUpdateRef.current;
        if (prev && prev.issuedAt >= msg.issuedAt) return;
        rolesUpdateRef.current = msg;
        saveLiveRolesUpdate(session.pnIdentifier, docId, msg);
        const wasTrusted = myKeyTrusted(trustedLiveRoles(prev?.roles || bundleRef.current?.manifest.roles || [], anchor));
        const trusted = trustedLiveRoles(msg.roles, anchor);
        liveSession.setRoles(trusted);
        setCanEdit(liveSession.canEdit);
        if (!wasTrusted && myKeyTrusted(trusted)) liveSession.requestSync();
      }
    };

    liveSession = new PenLiveSession({
      ydoc,
      docId,
      groupId,
      keyEpoch,
      docKey,
      signer,
      roles: trustedLiveRoles(rolesSource(), anchor),
      ownerPnHash,
      transport,
      onControl,
      onPeer: (pnHash) => {
        if (isOwner) broadcastRoles();
        else if (pnHash === ownerPnHash) sendClaim();
      },
      onRemoteApplied: () => {
        if (statusRef.current === 'connecting' && penLiveHasContent(ydoc)) goLive();
      }
    });

    const undo = new Y.UndoManager([penLiveSectionsMap(ydoc), ydoc.getMap('meta')], {
      trackedOrigins: new Set([PEN_LIVE_LOCAL])
    });
    const bumpUndo = () =>
      setUndoUi({ canUndo: undo.undoStack.length > 0, canRedo: undo.redoStack.length > 0 });
    undo.on('stack-item-added', bumpUndo);
    undo.on('stack-item-popped', bumpUndo);
    undo.on('stack-cleared', bumpUndo);

    const offRemote = bridge.onRemote((change) => {
      if (statusRef.current === 'live') callbacks.current.onRemote(change);
    });

    function goLive() {
      if (disposed || statusRef.current === 'live') return;
      const state = readPenLiveState(ydoc);
      bridge.adopt(state);
      callbacks.current.onAdopt(state);
      undo.clear();
      setCanEdit(liveSession.canEdit);
      setLiveStatus('live');
    }

    runtimeRef.current = {
      ydoc,
      bridge,
      session: liveSession,
      undo,
      docKey,
      keyEpoch,
      anchor,
      signer,
      signerPublicKey,
      isOwner
    };

    const onSnapshotEvent = (e: Event) => {
      const detail = (e as CustomEvent<{ docId?: string; sealed?: PenLiveSealedSnapshot }>).detail;
      if (detail?.docId !== docId || !detail.sealed) return;
      void applyLiveSnapshots(ydoc, [detail.sealed], docKey, keyEpoch, PEN_LIVE_REMOTE).then(() => {
        if (statusRef.current === 'connecting' && penLiveHasContent(ydoc)) goLive();
      });
    };
    window.addEventListener(PEN_LIVE_SNAPSHOT_EVENT, onSnapshotEvent);

    setLiveStatus('connecting');
    void (async () => {
      const local = loadLocalLiveSnapshot(session.pnIdentifier, docId);
      const drive = await loadDriveLiveSnapshot(session.pnIdentifier, docId);
      if (disposed) return;
      await applyLiveSnapshots(ydoc, [local, drive], docKey, keyEpoch, null);
      if (disposed) return;
      liveSession.start();
      sendClaim();
      if (penLiveHasContent(ydoc)) {
        goLive();
        return;
      }
      if (isOwner) {
        timers.push(
          window.setTimeout(() => {
            const current = bundleRef.current;
            if (disposed || statusRef.current !== 'connecting' || !current) return;
            if (!penLiveHasContent(ydoc)) {
              // Unsent origin: the session broadcasts the seed to members already in the room.
              Y.applyUpdate(ydoc, penLiveSeedUpdate(stateOf(current), penEditorSchema()));
            }
            goLive();
          }, OWNER_SEED_WAIT_MS)
        );
      } else {
        timers.push(
          window.setTimeout(() => {
            if (disposed || statusRef.current !== 'connecting') return;
            setLiveStatus('off');
          }, MEMBER_WAIT_MS)
        );
      }
    })();

    return () => {
      disposed = true;
      for (const t of timers) window.clearTimeout(t);
      window.removeEventListener(PEN_LIVE_SNAPSHOT_EVENT, onSnapshotEvent);
      offRemote();
      const wasLive = statusRef.current === 'live';
      runtimeRef.current = null;
      setLiveStatus('off');
      setCanEdit(false);
      const finalRoles = rolesUpdateRef.current;
      void (async () => {
        if (wasLive) {
          try {
            const sealed = await sealPenLiveSnapshot(ydoc, docKey, keyEpoch);
            saveLocalLiveSnapshot(session.pnIdentifier, docId, sealed);
            callbacks.current.onClosed?.(sealed, finalRoles);
          } catch {
            /* best effort */
          }
        }
        await liveSession.stop().catch(() => undefined);
        transport.close();
        undo.destroy();
        ydoc.destroy();
      })();
    };
    // Roles changes go through setRoles below; a new epoch or key restarts the session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shared, groupId, docKey, keyEpoch, ownerPnHash, ownerKey, docId, session.pnIdentifier, session.accessToken]);

  const rolesJson = JSON.stringify(manifest?.roles || []);
  useEffect(() => {
    const rt = runtimeRef.current;
    if (!rt) return;
    const roles = rt.isOwner
      ? manifest?.roles || []
      : rolesUpdateRef.current?.roles || manifest?.roles || [];
    rt.session.setRoles(trustedLiveRoles(roles, rt.anchor));
    setCanEdit(rt.session.canEdit);
    if (rt.isOwner && statusRef.current !== 'off') {
      const update = signRolesUpdate({ docId, keyEpoch: rt.keyEpoch, roles, owner: rt.signer });
      rolesUpdateRef.current = update;
      rt.session.sendControl(update);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rolesJson]);

  const applyLocal = useCallback((state: PenLiveDocState) => {
    const rt = runtimeRef.current;
    if (!rt || statusRef.current !== 'live' || !rt.session.canEdit) return;
    rt.bridge.applyLocal(state);
  }, []);

  const bindFragment = useCallback(
    (target: { slug: string; layerId: string | null; doc: PenTipTapNode } | null) => {
      const rt = runtimeRef.current;
      if (!rt) return null;
      if (!target || statusRef.current !== 'live' || !rt.session.canEdit) {
        rt.bridge.bind(null);
        return null;
      }
      const { slug, layerId, doc } = target;
      let frag = rt.bridge.ensureFragment(slug, layerId, doc);
      const current = bundleRef.current;
      if (!frag && current) {
        // Section or layer added this render; write it before binding.
        rt.bridge.bind(null);
        rt.bridge.applyLocal(stateOf(current));
        frag = rt.bridge.ensureFragment(slug, layerId, doc);
      }
      rt.bridge.bind(frag);
      return frag ? { fragment: frag, key: fragmentKey(frag) } : null;
    },
    []
  );

  const undoLive = useCallback(() => runtimeRef.current?.undo.undo(), []);
  const redoLive = useCallback(() => runtimeRef.current?.undo.redo(), []);

  const sealSnapshot = useCallback(async () => {
    const rt = runtimeRef.current;
    if (!rt || statusRef.current !== 'live') return null;
    return sealPenLiveSnapshot(rt.ydoc, rt.docKey, rt.keyEpoch);
  }, []);

  return {
    status,
    canEdit,
    canUndo: undoUi.canUndo,
    canRedo: undoUi.canRedo,
    undo: undoLive,
    redo: redoLive,
    applyLocal,
    bindFragment,
    sealSnapshot,
    rolesUpdate: () => rolesUpdateRef.current,
    session: () => runtimeRef.current?.session ?? null
  };
}
