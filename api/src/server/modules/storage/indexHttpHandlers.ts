import type { Request, Response } from 'express';
import { IndexStorageService } from './indexStorageService';
import { isPortableSocialCloud } from './storageProviderUtils';

type ContentClass = 'media' | 'thoughts' | 'collections';

function normalizePn(identityId: string): string {
  return identityId.startsWith('pn-') ? identityId : `pn-${identityId}`;
}

function contentTypes(filter?: string): ContentClass[] {
  if (filter === 'media' || filter === 'thoughts' || filter === 'collections') {
    return [filter];
  }
  return ['media', 'thoughts', 'collections'];
}

export async function handleGetOwnerIndex(
  req: Request,
  res: Response,
  identityId: string
): Promise<void> {
  const pnIdentifier = normalizePn(identityId);
  const filter = req.query.contentClass as string | undefined;

  if (await isPortableSocialCloud(pnIdentifier)) {
    const types = contentTypes(filter);
    const allFiles: unknown[] = [];
    let latestUpdated = new Date().toISOString();
    for (const ct of types) {
      const idx = await IndexStorageService.getContentClassOwnerIndex(pnIdentifier, ct);
      if (idx?.files?.length) {
        allFiles.push(...idx.files);
        latestUpdated = idx.updatedAt;
      }
    }
    if (allFiles.length > 0) {
      res.json({ identifier: identityId, files: allFiles, updatedAt: latestUpdated });
      return;
    }
    const root = await IndexStorageService.getOwnerFileIndex(pnIdentifier);
    res.json({ identifier: identityId, files: root.files, updatedAt: root.updatedAt });
    return;
  }

  res.status(404).json({ error: 'Use Google Drive path for non-portable social cloud owner index' });
}

export async function handleGetPublicIndex(
  req: Request,
  res: Response,
  identityId: string
): Promise<void> {
  const pnIdentifier = normalizePn(identityId);

  if (await isPortableSocialCloud(pnIdentifier)) {
    const types = contentTypes();
    const allFiles: unknown[] = [];
    let latestUpdated = new Date().toISOString();
    for (const ct of types) {
      const idx = await IndexStorageService.getContentClassPublicIndex(pnIdentifier, ct);
      if (idx?.files?.length) {
        allFiles.push(...idx.files);
        latestUpdated = idx.updatedAt;
      }
    }
    if (allFiles.length > 0) {
      res.json({ identifier: identityId, files: allFiles, updatedAt: latestUpdated });
      return;
    }
    const root = await IndexStorageService.getPublicFileIndex(pnIdentifier);
    res.json({ identifier: identityId, files: root.files, updatedAt: root.updatedAt });
    return;
  }

  res.status(404).json({ error: 'Use Google Drive path for non-portable social cloud public index' });
}
