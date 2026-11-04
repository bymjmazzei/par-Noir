/**
 * Where a pN's held ZK proofs live: Pen Knowledge claim docs under the pN Drive folder.
 */

import { getOwnerStorageContext } from './ownerStorageContext';

export interface ZkpStorageBundle {
  pnIdentifier: string;
  accountId?: string;
  pnFolderId: string;
  token?: { access_token: string };
}

export async function loadZkpBundle(
  pn: string,
  opts?: { accessToken?: string }
): Promise<ZkpStorageBundle | null> {
  const ctx = await getOwnerStorageContext(pn, opts);
  if (!ctx || ctx.kind === 'portable') return null;

  const { loadPnDriveIndex } = await import('../pnDriveIndex');
  const index = await loadPnDriveIndex(ctx.pnIdentifier);
  if (!index?.pnFolderId) return null;

  return {
    pnIdentifier: ctx.pnIdentifier,
    accountId: ctx.accountId,
    pnFolderId: index.pnFolderId,
    token: opts?.accessToken
      ? { access_token: opts.accessToken }
      : ctx.token,
  };
}
