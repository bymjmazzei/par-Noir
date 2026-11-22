/**
 * Shared portable data root for all par Noir Electron desktops.
 * Override with PN_DATA_ROOT; otherwise Application Support / "par Noir".
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

export const PN_DESKTOP_DATA_DIR_NAME = 'par Noir';

export function defaultApplicationSupportRoot(): string {
  const home = os.homedir();
  switch (process.platform) {
    case 'darwin':
      return path.join(home, 'Library', 'Application Support', PN_DESKTOP_DATA_DIR_NAME);
    case 'win32':
      return path.join(
        process.env.APPDATA || path.join(home, 'AppData', 'Roaming'),
        PN_DESKTOP_DATA_DIR_NAME
      );
    default:
      return path.join(
        process.env.XDG_CONFIG_HOME || path.join(home, '.config'),
        PN_DESKTOP_DATA_DIR_NAME
      );
  }
}

/** Resolve and ensure the shared PN desktop data root. */
export function resolvePnDesktopDataRoot(opts?: {
  env?: NodeJS.ProcessEnv;
  mkdir?: boolean;
}): string {
  const env = opts?.env ?? process.env;
  const override = env.PN_DATA_ROOT?.trim();
  const root = override && override.length > 0 ? path.resolve(override) : defaultApplicationSupportRoot();
  if (opts?.mkdir !== false) {
    try {
      fs.mkdirSync(root, { recursive: true });
    } catch (error) {
      console.warn('[desktop-secure-volume] Failed to create data root at', root, error);
    }
  }
  return root;
}
