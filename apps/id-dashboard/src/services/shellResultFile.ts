import type { HostedShellSession } from '@par-noir/oauth-ui';

/** "pN977164442" -> "pn977164442.pn", the name create has always used for the portable file. */
export function shellIdentityFilename(session: HostedShellSession): string {
  const nickname = session.result?.nickname || session.nickname || '';
  const clean = nickname
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .replace(/\s+/g, '-')
    .toLowerCase()
    .substring(0, 20);
  return `${clean || 'par-noir-identity'}.pn`;
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
