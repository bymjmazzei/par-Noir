/**
 * Owner-index resolution for a single storage backend.
 *
 * The sheet is on the device. This never GETs /api/storage/owner-index.
 * An empty or missing sheet leaves ownerIndex null so mergeDriveScanWithIndex
 * fills Storage via client Drive listFiles.
 */
import { readDeviceOwnerIndex } from '../../../../services/storage/deviceOwnerIndex';

export interface FetchOwnerIndexParams {
  backendId: string;
  currentPnIdentifier: string | undefined;
  resolveOwnerApiToken: (wantedPn?: string | null) => string | null;
}

export interface FetchOwnerIndexResult {
  ownerIndex: any;
  ownerIndexFromApi: boolean;
  skipBackend: boolean;
}

export async function fetchOwnerIndex({
  backendId,
  currentPnIdentifier,
  resolveOwnerApiToken,
}: FetchOwnerIndexParams): Promise<FetchOwnerIndexResult> {
  const empty = { ownerIndex: null, ownerIndexFromApi: false, skipBackend: false };
  if (!currentPnIdentifier) return empty;

  const pnId = currentPnIdentifier.startsWith('pn-')
    ? currentPnIdentifier
    : `pn-${currentPnIdentifier}`;
  const ownerApiToken = resolveOwnerApiToken(pnId);
  if (!ownerApiToken) return empty;

  try {
    const files = await readDeviceOwnerIndex(pnId, ownerApiToken);
    const provider = backendId.includes('::') ? backendId.split('::')[0] : backendId;
    const filtered = files.filter(
      (entry) => (entry.backend || 'google_drive') === provider
    );
    if (!filtered.length) return empty;
    return {
      ownerIndex: { files: filtered },
      ownerIndexFromApi: true,
      skipBackend: false,
    };
  } catch {
    return empty;
  }
}
