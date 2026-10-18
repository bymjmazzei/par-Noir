import type { PenRoleAssignment } from '@par-noir/pen-protocol';
import type { Awareness } from 'y-protocols/awareness';

/** Awareness fields: `user` is what TipTap's CollaborationCursor renders; `pen` is Pen presence. */
export interface PenLivePresenceUser {
  name: string;
  color: string;
}

export interface PenLivePresenceState {
  pnHash: string;
  activeSectionSlug?: string;
  selectedLayerIds?: string[];
  updatedAt: number;
}

export interface PenLivePeer extends PenLivePresenceState {
  clientId: number;
  name: string;
  color: string;
}

const PALETTE = [
  '#0f766e',
  '#b45309',
  '#7c3aed',
  '#be123c',
  '#1d4ed8',
  '#15803d',
  '#c2410c',
  '#a21caf'
];

/** Stable per-member colour so everyone sees the same person in the same colour. */
export function penLivePresenceColor(pnHash: string): string {
  let h = 0;
  for (let i = 0; i < pnHash.length; i++) h = (h * 31 + pnHash.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length]!;
}

export function setPenLivePresence(
  awareness: Awareness,
  user: PenLivePresenceUser,
  pen: Omit<PenLivePresenceState, 'updatedAt'>
): void {
  awareness.setLocalStateField('user', user);
  awareness.setLocalStateField('pen', { ...pen, updatedAt: Date.now() });
}

/**
 * Other members present on this doc, one entry per member (their most recent
 * session), limited to pnHashes holding a role.
 */
export function readPenLivePeers(
  awareness: Awareness,
  roles: PenRoleAssignment[] | undefined,
  ownerPnHash: string | undefined
): PenLivePeer[] {
  const members = new Set((roles || []).map((r) => r.pnHash));
  if (ownerPnHash) members.add(ownerPnHash);
  const self = awareness.clientID;
  const selfHash = (awareness.getLocalState()?.pen as PenLivePresenceState | undefined)?.pnHash;
  const byMember = new Map<string, PenLivePeer>();
  awareness.getStates().forEach((state, clientId) => {
    if (clientId === self) return;
    const pen = state?.pen as PenLivePresenceState | undefined;
    const user = state?.user as PenLivePresenceUser | undefined;
    if (!pen?.pnHash || !members.has(pen.pnHash) || pen.pnHash === selfHash) return;
    const peer: PenLivePeer = {
      clientId,
      pnHash: pen.pnHash,
      activeSectionSlug: typeof pen.activeSectionSlug === 'string' ? pen.activeSectionSlug : undefined,
      selectedLayerIds: Array.isArray(pen.selectedLayerIds) ? pen.selectedLayerIds.slice(0, 32) : undefined,
      updatedAt: Number(pen.updatedAt) || 0,
      name: String(user?.name || 'Collaborator').slice(0, 40),
      color: penLivePresenceColor(pen.pnHash)
    };
    const prev = byMember.get(pen.pnHash);
    if (!prev || prev.updatedAt < peer.updatedAt) byMember.set(pen.pnHash, peer);
  });
  return Array.from(byMember.values()).sort((a, b) => a.name.localeCompare(b.name));
}
