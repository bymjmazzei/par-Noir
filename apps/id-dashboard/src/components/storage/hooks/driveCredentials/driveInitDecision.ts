/**
 * Decides whether a credential-persist response should trigger a server-side Drive init.
 *
 * Device custody note: the API holds no Google OAuth secrets, so a
 * `clientSideLayoutRequired` response means the layout must be built by the client.
 * POSTing /storage/initialize in that case 400s and loops the multi-minute setup UI,
 * so that flag always wins over `initInProgress` / `directoryBuilt`.
 */

export interface DrivePersistResult {
  directoryBuilt?: boolean;
  initInProgress?: boolean;
  clientSideLayoutRequired?: boolean;
  folderInitError?: string;
}

/** True when the client owns Drive layout and the server init must be skipped. */
export function shouldSkipServerDriveInit(result: DrivePersistResult | null | undefined): boolean {
  return result?.clientSideLayoutRequired === true;
}

/** True when the server still needs to build the Drive layout. */
export function shouldRunServerDriveInit(result: DrivePersistResult | null | undefined): boolean {
  if (shouldSkipServerDriveInit(result)) {
    return false;
  }
  return result?.initInProgress === true || result?.directoryBuilt === false;
}
