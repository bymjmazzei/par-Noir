/**
 * Decides whether a credential-persist response should trigger a server-side Drive init.
 *
 * Device custody: `clientSideLayoutRequired` means the API has no Google secrets.
 * Callers must still POST /storage/initialize with `X-PN-Cloud-Access-Token` (see
 * useDriveStorageCredentials) — do not treat this flag as "never initialize".
 * `shouldSkipServerDriveInit` only means "do not call secretless initialize".
 */

export interface DrivePersistResult {
  directoryBuilt?: boolean;
  initInProgress?: boolean;
  clientSideLayoutRequired?: boolean;
  folderInitError?: string;
}

/**
 * True when secretless server init must not run.
 * Callers with a local Google access token should still initialize via forwarded token.
 */
export function shouldSkipServerDriveInit(result: DrivePersistResult | null | undefined): boolean {
  return result?.clientSideLayoutRequired === true;
}

/** True when the server still needs to build the Drive layout (non-custody / has secrets). */
export function shouldRunServerDriveInit(result: DrivePersistResult | null | undefined): boolean {
  if (shouldSkipServerDriveInit(result)) {
    return false;
  }
  return result?.initInProgress === true || result?.directoryBuilt === false;
}
