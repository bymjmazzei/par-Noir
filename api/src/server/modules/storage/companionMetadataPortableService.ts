/**
 * Portable companion metadata: single JSON blob per file on social cloud.
 * Path: _metadata/{media|thoughts|collections}/{fileId}.metadata.json
 */

import { companionMetadataPath, type ContentClass } from '@par-noir/user-owned-storage';
import type {
  CompanionMetadata,
  CommentRecord,
  LikeRecord,
  SaveRecord,
  ShareRecord,
  ViewRecord
} from '../companionMetadataSheets';
import { readPortableJsonBlob, writePortableJsonBlob } from './portableJsonBlob';

export interface PortableCompanionDocument extends CompanionMetadata {
  likes?: LikeRecord[];
  comments?: CommentRecord[];
  shares?: ShareRecord[];
  saves?: SaveRecord[];
  views?: ViewRecord[];
  lastUpdated?: string;
}

function toLayoutContentClass(
  contentClass?: 'media' | 'thought' | 'collection' | string
): ContentClass {
  if (contentClass === 'thought' || contentClass === 'thoughts') return 'thoughts';
  if (contentClass === 'collection' || contentClass === 'collections') return 'collections';
  return 'media';
}

export function portableCompanionRelPath(
  fileId: string,
  contentClass?: 'media' | 'thought' | 'collection' | string
): string {
  return companionMetadataPath(toLayoutContentClass(contentClass), fileId);
}

async function findPortableDoc(
  pnIdentifier: string,
  fileId: string,
  accountId?: string,
  hint?: string
): Promise<{ path: string; doc: PortableCompanionDocument } | null> {
  const order: ContentClass[] = hint
    ? [toLayoutContentClass(hint), 'media', 'thoughts', 'collections']
    : ['media', 'thoughts', 'collections'];
  const seen = new Set<string>();
  for (const cc of order) {
    if (seen.has(cc)) continue;
    seen.add(cc);
    const path = companionMetadataPath(cc, fileId);
    const doc = await readPortableJsonBlob<PortableCompanionDocument>(pnIdentifier, path, accountId);
    if (doc) return { path, doc };
  }
  return null;
}

export async function createCompanionPortable(
  pnIdentifier: string,
  fileId: string,
  metadata: CompanionMetadata,
  accountId?: string
): Promise<string> {
  const path = portableCompanionRelPath(fileId, metadata.contentClass);
  const doc: PortableCompanionDocument = {
    ...metadata,
    likes: [],
    comments: [],
    shares: [],
    saves: [],
    views: [],
    lastUpdated: new Date().toISOString(),
    engagement: metadata.engagement ?? {
      views: 0,
      likes: 0,
      comments: 0,
      shares: 0,
      saves: 0,
      lastUpdated: new Date().toISOString()
    }
  };
  await writePortableJsonBlob(pnIdentifier, path, doc, accountId);
  return path;
}

export async function readCompanionPortable(
  pnIdentifier: string,
  fileId: string,
  accountId?: string,
  contentClassHint?: string
): Promise<CompanionMetadata | null> {
  const found = await findPortableDoc(pnIdentifier, fileId, accountId, contentClassHint);
  if (!found) return null;
  const { doc } = found;
  const likes = doc.likes?.length ?? doc.engagement?.likes ?? 0;
  const comments = doc.comments?.length ?? doc.engagement?.comments ?? 0;
  const shares = doc.shares?.length ?? doc.engagement?.shares ?? 0;
  const saves = doc.saves?.length ?? doc.engagement?.saves ?? 0;
  const views = doc.views?.length ?? doc.engagement?.views ?? 0;
  return {
    ...doc,
    engagement: {
      views: typeof views === 'number' ? views : 0,
      likes: typeof likes === 'number' ? likes : 0,
      comments: typeof comments === 'number' ? comments : 0,
      shares: typeof shares === 'number' ? shares : 0,
      saves: typeof saves === 'number' ? saves : 0,
      lastUpdated: doc.lastUpdated || new Date().toISOString(),
      engagementHistory: doc.engagement?.engagementHistory
    }
  };
}

export async function updateCompanionPortable(
  pnIdentifier: string,
  fileId: string,
  patch: Partial<CompanionMetadata>,
  accountId?: string
): Promise<void> {
  const found = await findPortableDoc(pnIdentifier, fileId, accountId, patch.contentClass);
  if (!found) {
    throw new Error(`Companion metadata not found for ${fileId}`);
  }
  const next: PortableCompanionDocument = {
    ...found.doc,
    ...patch,
    owner: patch.owner ? { ...found.doc.owner, ...patch.owner } : found.doc.owner,
    engagement: patch.engagement
      ? { ...found.doc.engagement, ...patch.engagement }
      : found.doc.engagement,
    lastUpdated: new Date().toISOString()
  };
  const path =
    patch.contentClass && patch.contentClass !== found.doc.contentClass
      ? portableCompanionRelPath(fileId, patch.contentClass)
      : found.path;
  await writePortableJsonBlob(pnIdentifier, path, next, accountId);
}

export async function existsCompanionPortable(
  pnIdentifier: string,
  fileId: string,
  accountId?: string
): Promise<boolean> {
  return (await findPortableDoc(pnIdentifier, fileId, accountId)) != null;
}

type Mutator = (doc: PortableCompanionDocument) => void;

async function mutateEngagement(
  pnIdentifier: string,
  fileId: string,
  accountId: string | undefined,
  mutator: Mutator
): Promise<void> {
  const found = await findPortableDoc(pnIdentifier, fileId, accountId);
  if (!found) {
    throw new Error(`Companion metadata not found for ${fileId}`);
  }
  mutator(found.doc);
  found.doc.lastUpdated = new Date().toISOString();
  found.doc.engagement = {
    views: found.doc.views?.length ?? 0,
    likes: found.doc.likes?.length ?? 0,
    comments: found.doc.comments?.length ?? 0,
    shares: found.doc.shares?.length ?? 0,
    saves: found.doc.saves?.length ?? 0,
    lastUpdated: found.doc.lastUpdated,
    engagementHistory: found.doc.engagement?.engagementHistory
  };
  await writePortableJsonBlob(pnIdentifier, found.path, found.doc, accountId);
}

export async function appendLikePortable(
  pn: string,
  fileId: string,
  like: LikeRecord,
  accountId?: string
): Promise<void> {
  await mutateEngagement(pn, fileId, accountId, (doc) => {
    doc.likes = doc.likes ?? [];
    if (!doc.likes.some((l) => l.pnIdentifier === like.pnIdentifier)) {
      doc.likes.push(like);
    }
  });
}

export async function removeLikePortable(
  pn: string,
  fileId: string,
  pnIdentifier: string,
  accountId?: string
): Promise<void> {
  await mutateEngagement(pn, fileId, accountId, (doc) => {
    doc.likes = (doc.likes ?? []).filter((l) => l.pnIdentifier !== pnIdentifier);
  });
}

export async function appendCommentPortable(
  pn: string,
  fileId: string,
  comment: CommentRecord,
  accountId?: string
): Promise<void> {
  await mutateEngagement(pn, fileId, accountId, (doc) => {
    doc.comments = doc.comments ?? [];
    doc.comments.push(comment);
  });
}

export async function appendSharePortable(
  pn: string,
  fileId: string,
  share: ShareRecord,
  accountId?: string
): Promise<void> {
  await mutateEngagement(pn, fileId, accountId, (doc) => {
    doc.shares = doc.shares ?? [];
    doc.shares.push(share);
  });
}

export async function appendSavePortable(
  pn: string,
  fileId: string,
  save: SaveRecord,
  accountId?: string
): Promise<void> {
  await mutateEngagement(pn, fileId, accountId, (doc) => {
    doc.saves = doc.saves ?? [];
    if (!doc.saves.some((s) => s.pnIdentifier === save.pnIdentifier)) {
      doc.saves.push(save);
    }
  });
}

export async function removeSavePortable(
  pn: string,
  fileId: string,
  pnIdentifier: string,
  accountId?: string
): Promise<void> {
  await mutateEngagement(pn, fileId, accountId, (doc) => {
    doc.saves = (doc.saves ?? []).filter((s) => s.pnIdentifier !== pnIdentifier);
  });
}

export async function appendViewPortable(
  pn: string,
  fileId: string,
  view: ViewRecord,
  accountId?: string
): Promise<void> {
  await mutateEngagement(pn, fileId, accountId, (doc) => {
    doc.views = doc.views ?? [];
    doc.views.push(view);
  });
}
