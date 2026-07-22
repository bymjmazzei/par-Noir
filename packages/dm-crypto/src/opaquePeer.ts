import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

/** Relative from-marker on conversation sheets (hides peer pn from cloud cells). */
export const FROM_SELF = 'self' as const;
export const FROM_PEER = 'peer' as const;
export type RelativeFromMarker = typeof FROM_SELF | typeof FROM_PEER;

const OPAQUE_PREFIX = 'o_';
const CONV_FILE_PREFIX = 'conversation-o-';
const LEGACY_CONV_PREFIX = 'conversation-';

function normalizePn(pn: string): string {
  const t = pn.trim();
  if (!t) return t;
  return t.startsWith('pn-') ? t : `pn-${t}`;
}

/** Deterministic cloud-opaque peer ref (hex). Same inputs → same id; not secret. */
export function opaquePeerRef(ownerPn: string, peerPn: string): string {
  const material = `par-noir-peer-v1:${normalizePn(ownerPn)}:${normalizePn(peerPn)}`;
  return bytesToHex(sha256(new TextEncoder().encode(material))).slice(0, 32);
}

/** Inbox / index key with prefix so legacy plaintext pns are distinguishable. */
export function opaquePeerKey(ownerPn: string, peerPn: string): string {
  return `${OPAQUE_PREFIX}${opaquePeerRef(ownerPn, peerPn)}`;
}

export function isOpaquePeerKey(value: string | undefined | null): boolean {
  return !!value && value.startsWith(OPAQUE_PREFIX) && value.length === OPAQUE_PREFIX.length + 32;
}

export function conversationFileName(ownerPn: string, peerPn: string): string {
  return `${CONV_FILE_PREFIX}${opaquePeerRef(ownerPn, peerPn)}`;
}

/** Build conversation Drive title from a peer pn or opaque key (`o_…`). */
export function conversationFileNameFromPeerToken(ownerPn: string, peerToken: string): string {
  if (isOpaquePeerKey(peerToken)) {
    return `${CONV_FILE_PREFIX}${peerToken.slice(OPAQUE_PREFIX.length)}`;
  }
  return conversationFileName(ownerPn, peerToken);
}

export function legacyConversationFileName(peerPn: string): string {
  const id = normalizePn(peerPn);
  return `${LEGACY_CONV_PREFIX}${id}`;
}

export function isOpaqueConversationFileName(name: string): boolean {
  return name.startsWith(CONV_FILE_PREFIX);
}

export function isLegacyConversationFileName(name: string): boolean {
  return (
    name.startsWith(LEGACY_CONV_PREFIX) &&
    !name.startsWith(CONV_FILE_PREFIX) &&
    !name.startsWith('conversation-group-')
  );
}

/** Extract peer token from conversation filename (opaque key or legacy pn). */
export function peerTokenFromConversationFileName(name: string): string | null {
  if (name.startsWith('conversation-group-')) return null;
  if (isOpaqueConversationFileName(name)) {
    return `${OPAQUE_PREFIX}${name.slice(CONV_FILE_PREFIX.length)}`;
  }
  if (isLegacyConversationFileName(name)) {
    return name.slice(LEGACY_CONV_PREFIX.length);
  }
  return null;
}

export function relativeFromMarker(
  fromPn: string,
  sheetOwnerPn: string
): RelativeFromMarker {
  return normalizePn(fromPn) === normalizePn(sheetOwnerPn) ? FROM_SELF : FROM_PEER;
}

export function resolveRelativeFrom(
  markerOrPn: string,
  sheetOwnerPn: string,
  peerPn: string
): string {
  if (markerOrPn === FROM_SELF) return normalizePn(sheetOwnerPn);
  if (markerOrPn === FROM_PEER) return normalizePn(peerPn);
  return normalizePn(markerOrPn);
}

export function isRelativeFromMarker(value: string): value is RelativeFromMarker {
  return value === FROM_SELF || value === FROM_PEER;
}

/** Resolve opaque key against known peers (connections). */
export function resolveOpaquePeerKey(
  ownerPn: string,
  keyOrPn: string,
  knownPeers: string[]
): string | null {
  if (!isOpaquePeerKey(keyOrPn)) {
    return normalizePn(keyOrPn);
  }
  for (const peer of knownPeers) {
    if (opaquePeerKey(ownerPn, peer) === keyOrPn) {
      return normalizePn(peer);
    }
  }
  return null;
}

export function portableConversationBlobId(ownerPn: string, peerPn: string): string {
  return `pn-portable-conv:${opaquePeerKey(ownerPn, peerPn)}`;
}

export function legacyPortableConversationBlobId(peerPn: string): string {
  const id = normalizePn(peerPn);
  return `pn-portable-conv:${id}`;
}

/** Generic attachment blob name (no peer-derived tokens). */
export function genericAttachmentFileName(): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const hex = bytesToHex(bytes);
  return `blob-${hex}.msgenc`;
}
