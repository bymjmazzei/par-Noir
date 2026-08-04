/**
 * Owner-index resolution for a single storage backend.
 *
 * One GET /api/storage/owner-index attempt. On 403/409 (or any other failure),
 * leave ownerIndex null and ownerIndexFromApi false so mergeDriveScanWithIndex
 * fills Storage via client Drive listFiles — never a second owner-index GET, and
 * never POST /storage/initialize (which 400s without server-held tokens under
 * device custody and loops setup UI).
 */
import { ownerGet } from '../../../../services/ownerApiService';

export interface FetchOwnerIndexParams {
  backendId: string;
  currentPnIdentifier: string | undefined;
  resolveOwnerApiToken: (wantedPn?: string | null) => string | null;
}

export interface FetchOwnerIndexResult {
  ownerIndex: any;
  ownerIndexFromApi: boolean;
  /** Reserved for callers; always false after the single API attempt. */
  skipBackend: boolean;
}

export async function fetchOwnerIndex({
  backendId,
  currentPnIdentifier,
  resolveOwnerApiToken,
}: FetchOwnerIndexParams): Promise<FetchOwnerIndexResult> {
  let ownerIndex: any = null;
  let ownerIndexFromApi = false;

  const ownerApiToken = currentPnIdentifier
    ? resolveOwnerApiToken(
        currentPnIdentifier.startsWith('pn-')
          ? currentPnIdentifier
          : `pn-${currentPnIdentifier}`
      )
    : resolveOwnerApiToken();
  if (!currentPnIdentifier || !ownerApiToken) {
    return { ownerIndex, ownerIndexFromApi, skipBackend: false };
  }

  try {
    const pnId = currentPnIdentifier.startsWith('pn-')
      ? currentPnIdentifier
      : `pn-${currentPnIdentifier}`;
    const idxRes = await ownerGet(
      ownerApiToken,
      `/api/storage/owner-index/${encodeURIComponent(pnId)}`
    );
    if (idxRes.status === 403) {
      // Device policy / custody — mergeDriveScanWithIndex uses Drive listFiles
      console.debug('ℹ️ [loadFiles] owner-index forbidden; using Drive listFiles fallthrough');
    } else if (idxRes.status === 409) {
      // Server Drive index incomplete (common under device cloud custody where
      // OAuth secrets are not on the API). Do NOT POST /storage/initialize —
      // that returns 400 without server-held tokens and loops the "setup" UI.
      console.debug(
        'ℹ️ [loadFiles] owner-index incomplete (409); using Drive listFiles fallthrough instead of server rebuild'
      );
    } else if (idxRes.ok) {
      const idxData = await idxRes.json();
      const provider = backendId.includes('::') ? backendId.split('::')[0] : backendId;
      const filteredFiles = (idxData.files || []).filter(
        (entry: any) => (entry.backend || 'google_drive') === provider
      );
      ownerIndex = { ...idxData, files: filteredFiles };
      ownerIndexFromApi = true;
    }
  } catch {
    /* non-blocking — caller falls through to Drive listFiles */
  }

  return { ownerIndex, ownerIndexFromApi, skipBackend: false };
}
