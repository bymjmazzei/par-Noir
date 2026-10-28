import type { HostedShellSession } from '@par-noir/oauth-ui';
import { deriveCanonicalPnIdentifier } from '@par-noir/pqc-crypto/oauth-unlock-proof';

/** The pN identifier derived from the public key, e.g. "pn-87f49f0fb345.pn". */
export function shellIdentityFilename(session: HostedShellSession): string {
  if (!session.publicKey) return 'par-noir-identity.pn';
  return `${deriveCanonicalPnIdentifier(session.publicKey)}.pn`;
}

export function downloadShellIdentityFile(
  session: HostedShellSession,
  filename = shellIdentityFilename(session)
): void {
  const file = session.result?.identityFile;
  if (!file) return;
  const blob = new Blob([file], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
