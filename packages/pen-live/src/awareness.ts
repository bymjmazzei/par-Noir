import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate } from 'y-protocols/awareness';
import {
  canPenRole,
  resolvePenRole,
  type PenLiveAwareness,
  type PenRoleAssignment
} from '@par-noir/pen-protocol';
import { openBytes, sealBytes } from './crypto.js';

export { Awareness };

export async function sealPenLiveAwareness(params: {
  awareness: Awareness;
  clients: number[];
  docId: string;
  keyEpoch: number;
  docKey: string;
  authorPnHash: string;
}): Promise<PenLiveAwareness> {
  const update = encodeAwarenessUpdate(params.awareness, params.clients);
  return {
    docId: params.docId,
    keyEpoch: params.keyEpoch,
    authorPnHash: params.authorPnHash,
    ciphertext: await sealBytes(update, params.docKey)
  };
}

/** Presence is unsigned; it is accepted only from current members on this doc + epoch. */
export async function applyPenLiveAwareness(params: {
  awareness: Awareness;
  message: PenLiveAwareness;
  docId: string;
  keyEpoch: number;
  docKey: string;
  roles: PenRoleAssignment[] | undefined;
  ownerPnHash: string | undefined;
}): Promise<boolean> {
  const { message } = params;
  if (message.docId !== params.docId || message.keyEpoch !== params.keyEpoch) return false;
  const role = resolvePenRole(params.roles, message.authorPnHash, params.ownerPnHash);
  if (!role || !canPenRole(role, 'read')) return false;
  try {
    const bytes = await openBytes(message.ciphertext, params.docKey);
    applyAwarenessUpdate(params.awareness, bytes, 'remote');
    return true;
  } catch {
    return false;
  }
}
