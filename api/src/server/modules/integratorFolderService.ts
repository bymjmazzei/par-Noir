/**
 * Ensures and resolves integrator silo folders on Google Drive (integrators/{client_id}/).
 */

import {
  findFolderByNameUnderParent,
  findOrCreateFolderUnderParent,
  findPnRootFolderId,
  hasCachedDriveLayout,
  initializeIntegratorsRoot,
  loadCachedFolderIds,
  persistCachedFolderIds,
  type PnCachedFolderIds
} from './pnDriveLayout';
import {
  INTEGRATORS_ROOT,
  integratorFolderName,
  integratorPathLabel,
  isFirstPartyClient,
  normalizePnIdentifier
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
      ...(init?.headers || {})
    }
  });
}

export interface PnFolderLayout {
  pnFolderId: string;
  metadataFolderId: string;
}

/** Lookup pN root + _metadata; does not create. */
export async function lookupPnFolderLayout(
  accessToken: string,
  pnIdentifier: string
): Promise<PnFolderLayout | null> {
  const pnFolderId = await findPnRootFolderId(accessToken, pnIdentifier);
  if (!pnFolderId) return null;
  const metadataFolderId = await findFolderByNameUnderParent(
    accessToken,
    '_metadata',
    pnFolderId
  );
  if (!metadataFolderId) return null;
  return { pnFolderId, metadataFolderId };
}

export class IntegratorFolderService {
  static async ensureIntegratorFolder(
    accessToken: string,
    pnIdentifier: string,
    clientId: string,
    accountId?: string,
    cached?: PnCachedFolderIds | null
  ): Promise<IntegratorFolderResult> {
    if (isFirstPartyClient(clientId)) {
      throw new IntegratorStorageError(
        'First-party clients do not use integrator silos',
        'INVALID_CLIENT'
      );
    }

    const normalized = normalizePnIdentifier(pnIdentifier);
    const folderSegment = integratorFolderName(clientId);
    let layout = cached ?? (await loadCachedFolderIds(normalized));

    if (hasCachedDriveLayout(layout)) {
      const integratorFolderId = await findOrCreateFolderUnderParent(
        accessToken,
        folderSegment,
        layout.integratorsRootId
      );
      return {
        integratorFolderId,
        integratorsRootId: layout.integratorsRootId,
        pnFolderId: layout.pnFolderId,
        metadataFolderId: layout.metadataFolderId,
        integratorPath: integratorPathLabel(clientId)
      };
    }

    const looked = await lookupPnFolderLayout(accessToken, normalized);
    if (!looked) {
      throw new IntegratorStorageError(
        'Google Drive pN folder is not initialized. Connect storage in the dashboard first.',
        'DRIVE_NOT_INITIALIZED'
      );
    }

    const { pnFolderId, metadataFolderId } = looked;
    const integratorsRootId = await initializeIntegratorsRoot(accessToken, pnFolderId);
    const integratorFolderId = await findOrCreateFolderUnderParent(
      accessToken,
      folderSegment,
      integratorsRootId
    );

    try {
      const { storageCredentialsService } = await import('./storageCredentialsService');
      const credRecord = await storageCredentialsService.getCredentials(normalized);
      if (credRecord?.credentials) {
        await persistCachedFolderIds(normalized, credRecord.credentials, {
          pnFolderId,
          metadataFolderId,
          integratorsRootId
        });
      }
    } catch {
      // Repair cache is best-effort; folder creation already succeeded
    }

    return {
      integratorFolderId,
      integratorsRootId,
      pnFolderId,
      metadataFolderId,
      integratorPath: integratorPathLabel(clientId)
    };
  }

  /** Returns null for first-party (no silo). */
  static async resolveIntegratorFolderId(
    accessToken: string,
    pnIdentifier: string,
    clientId: string,
    cached?: PnCachedFolderIds | null
  ): Promise<string | null> {
    if (isFirstPartyClient(clientId)) return null;

    const normalized = normalizePnIdentifier(pnIdentifier);
    const cache = cached ?? (await loadCachedFolderIds(normalized));
    const folderSegment = integratorFolderName(clientId);

    if (cache?.integratorsRootId) {
      return findFolderByNameUnderParent(
        accessToken,
        folderSegment,
        cache.integratorsRootId
      );
    }

    const layout = await lookupPnFolderLayout(accessToken, normalized);
    if (!layout) return null;
    const integratorsRootId = await findFolderByNameUnderParent(
      accessToken,
      INTEGRATORS_ROOT,
      layout.pnFolderId
    );
    if (!integratorsRootId) return null;
    return findFolderByNameUnderParent(
      accessToken,
      folderSegment,
      integratorsRootId
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
