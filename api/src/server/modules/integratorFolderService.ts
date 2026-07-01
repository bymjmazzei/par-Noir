/**
 * Ensures and resolves integrator silo folders on Google Drive (integrators/{client_id}/).
 * Runtime layout IDs come from pnDriveIndex — no pN root / _metadata discovery.
 */

import {
  findFolderByNameUnderParent,
  findOrCreateFolderUnderParent,
} from './pnDriveLayout';
import {
  isPnDriveIndexComplete,
  loadPnDriveIndex,
  type PnDriveIndex,
} from './pnDriveIndex';
import {
  integratorFolderName,
  integratorPathLabel,
  isFirstPartyClient,
  normalizePnIdentifier,
} from './integratorStoragePaths';
import type { TokenPayload } from './pnOAuthService';

export interface IntegratorFolderResult {
  integratorFolderId: string;
  integratorsRootId: string;
  pnFolderId: string;
  metadataFolderId: string;
  integratorPath: string;
}

export class IntegratorStorageError extends Error {
  constructor(
    message: string,
    public readonly code: 'DRIVE_NOT_INITIALIZED' | 'INVALID_CLIENT' | 'FORBIDDEN_PARENT' | 'MISSING_SCOPE'
  ) {
    super(message);
    this.name = 'IntegratorStorageError';
  }
}

async function driveFetch(
  accessToken: string,
  path: string,
  init?: RequestInit
): Promise<Response> {
  return fetch(`https://www.googleapis.com/drive/v3${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
}

async function requireDriveIndex(pnIdentifier: string): Promise<PnDriveIndex> {
  const normalized = normalizePnIdentifier(pnIdentifier);
  const index = await loadPnDriveIndex(normalized);
  if (!isPnDriveIndexComplete(index)) {
    throw new IntegratorStorageError(
      'Google Drive pN folder is not initialized. Connect storage in the dashboard first.',
      'DRIVE_NOT_INITIALIZED'
    );
  }
  return index;
}

export class IntegratorFolderService {
  static async ensureIntegratorFolder(
    accessToken: string,
    pnIdentifier: string,
    clientId: string,
    _accountId?: string,
    indexOverride?: PnDriveIndex | null
  ): Promise<IntegratorFolderResult> {
    if (isFirstPartyClient(clientId)) {
      throw new IntegratorStorageError(
        'First-party clients do not use integrator silos',
        'INVALID_CLIENT'
      );
    }

    const normalized = normalizePnIdentifier(pnIdentifier);
    const index = indexOverride && isPnDriveIndexComplete(indexOverride)
      ? indexOverride
      : await requireDriveIndex(normalized);

    const folderSegment = integratorFolderName(clientId);
    const integratorFolderId = await findOrCreateFolderUnderParent(
      accessToken,
      folderSegment,
      index.integratorsRootId
    );

    return {
      integratorFolderId,
      integratorsRootId: index.integratorsRootId,
      pnFolderId: index.pnFolderId,
      metadataFolderId: index.metadataFolderId,
      integratorPath: integratorPathLabel(clientId),
    };
  }

  /** Returns null for first-party (no silo). */
  static async resolveIntegratorFolderId(
    accessToken: string,
    pnIdentifier: string,
    clientId: string,
    indexOverride?: PnDriveIndex | null
  ): Promise<string | null> {
    if (isFirstPartyClient(clientId)) return null;

    const normalized = normalizePnIdentifier(pnIdentifier);
    const index = indexOverride && isPnDriveIndexComplete(indexOverride)
      ? indexOverride
      : await loadPnDriveIndex(normalized);
    if (!isPnDriveIndexComplete(index)) return null;

    return findFolderByNameUnderParent(
      accessToken,
      integratorFolderName(clientId),
      index.integratorsRootId
    );
  }

  /**
   * L5: parents must be integrator folder or its descendants.
   * First-party: no restriction from this helper.
   */
  static async assertParentsAllowed(
    accessToken: string,
    clientId: string,
    parentIds: string[] | undefined,
    integratorFolderId: string,
    metadataFolderId: string,
    pnFolderId: string
  ): Promise<string[]> {
    if (isFirstPartyClient(clientId)) {
      return parentIds?.length ? parentIds : [];
    }

    const blocked = new Set([metadataFolderId, pnFolderId]);
    for (const pid of parentIds || []) {
      if (blocked.has(pid)) {
        throw new IntegratorStorageError(
          'Integrator apps cannot write to pN metadata or root folders',
          'FORBIDDEN_PARENT'
        );
      }
    }

    if (!parentIds?.length) {
      return [integratorFolderId];
    }

    for (const pid of parentIds) {
      const ok = await this.isDescendantOf(accessToken, pid, integratorFolderId);
      if (!ok) {
        throw new IntegratorStorageError(
          'Parent folder must be inside your app integrator silo',
          'FORBIDDEN_PARENT'
        );
      }
    }
    return parentIds;
  }

  static async isDescendantOf(
    accessToken: string,
    fileOrFolderId: string,
    ancestorId: string
  ): Promise<boolean> {
    if (fileOrFolderId === ancestorId) return true;
    let currentId: string | undefined = fileOrFolderId;
    const visited = new Set<string>();
    while (currentId && !visited.has(currentId)) {
      if (currentId === ancestorId) return true;
      visited.add(currentId);
      const res = await driveFetch(
        accessToken,
        `/files/${currentId}?fields=parents`
      );
      if (!res.ok) return false;
      const data = (await res.json()) as { parents?: string[] };
      const parents = data.parents || [];
      if (parents.includes(ancestorId)) return true;
      currentId = parents[0];
    }
    return false;
  }

  static async assertFileInIntegratorSilo(
    accessToken: string,
    fileId: string,
    integratorFolderId: string
  ): Promise<void> {
    const ok = await this.isDescendantOf(accessToken, fileId, integratorFolderId);
    if (!ok) {
      throw new IntegratorStorageError(
        'File is outside the integrator storage silo',
        'FORBIDDEN_PARENT'
      );
    }
  }

  static integratorListQuery(integratorFolderId: string, userQuery?: string): string {
    const siloClause = `'${integratorFolderId}' in parents`;
    if (!userQuery?.trim()) return siloClause;
    return `${userQuery.trim()} and ${siloClause}`;
  }

  static tokenNeedsSilo(token: TokenPayload): boolean {
    return !isFirstPartyClient(token.clientId);
  }
}
