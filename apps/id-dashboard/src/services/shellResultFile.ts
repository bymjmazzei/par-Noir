import type { HostedShellSession } from '@par-noir/oauth-ui';

export function downloadShellIdentityFile(session: HostedShellSession, filename = 'par-noir-identity.json'): void {
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
