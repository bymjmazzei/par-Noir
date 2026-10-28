import type { HostedShellSession } from '@par-noir/oauth-ui';
import { pnFileName, pnFilePublicKey } from './pnFileName';

/** Named from the returned file's own key: a rotated pN gets its new identifier, not the old session's. */
export function shellIdentityFilename(session: HostedShellSession): string {
  let filePublicKey: string | undefined;
  try {
    filePublicKey = pnFilePublicKey(JSON.parse(session.result?.identityFile || 'null'));
  } catch {
    filePublicKey = undefined;
  }
  return pnFileName(filePublicKey || session.publicKey || undefined);
}

export function downloadShellIdentityFile(session: HostedShellSession): void {
  const file = session.result?.identityFile;
  if (!file) return;
  const blob = new Blob([file], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = shellIdentityFilename(session);
  a.click();
  URL.revokeObjectURL(url);
}
