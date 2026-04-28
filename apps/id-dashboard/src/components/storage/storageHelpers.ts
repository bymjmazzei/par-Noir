export function normalizeVisibility(value: unknown): 'public' | 'private' | 'friends' {
  if (value === 'public') return 'public';
  if (value === 'friends') return 'friends';
  return 'private';
}

export function driveAccountTokens(account: Record<string, unknown> | null | undefined): {
  accessToken: string | null;
  refreshToken: string | null;
} {
  if (!account || typeof account !== 'object') {
    return { accessToken: null, refreshToken: null };
  }
  const access =
    (typeof account.accessToken === 'string' && account.accessToken) ||
    (typeof account.access_token === 'string' && account.access_token) ||
    null;
  const refresh =
    (typeof account.refreshToken === 'string' && account.refreshToken) ||
    (typeof account.refresh_token === 'string' && account.refresh_token) ||
    null;
  return { accessToken: access, refreshToken: refresh };
}

